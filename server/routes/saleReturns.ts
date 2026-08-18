import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { Item, Party, Invoice, JournalEntry, SaleReturn, SaleReturnItem, isDbConnected, sequelize } from '../db/sequelize.js';

export const saleReturnsRouter = Router();

// GET /api/v1/sale-returns - Fetch all credit notes for active tenant
saleReturnsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { tenantId = 'default-tenant' } = req.query;

    if (isDbConnected()) {
      const tId = String(tenantId);
      const returns = await SaleReturn.findAll({
        where: { tenantId: tId },
        include: [{ model: SaleReturnItem, as: 'items' }],
        order: [['id', 'DESC']]
      });

      return res.json({ success: true, data: returns });
    }

    return res.json({ success: true, data: [] });
  } catch (err: any) {
    console.error('Error fetching sale returns:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/sale-returns - Insert Sale Return / Credit Note & update stock (+qty) / customer receivable (-amount)
saleReturnsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      returnId,
      creditNoteNumber = `CR-${Date.now().toString().slice(-4)}`,
      returnDate = new Date().toISOString().split('T')[0],
      invoiceNumber = '',
      partyId,
      partyName,
      partyPhone = '',
      items = [],
      refundAmount = 0,
      notes = '',
      tenantId = 'default-tenant'
    } = req.body;

    if (!partyName || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Customer name and returned items are required' });
    }

    const totalReturnAmount = items.reduce((sum: number, item: any) => {
      const qty = Number(item.returnQuantity) || Number(item.quantity) || 1;
      const rate = Number(item.unitPrice) || Number(item.price) || 0;
      return sum + (Number(item.totalAmount) || (qty * rate));
    }, 0);

    if (isDbConnected()) {
      const t = await sequelize.transaction();
      try {
        const uniqueReturnId = returnId || `cr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        // 1. Create SaleReturn record
        const newReturn = await SaleReturn.create({
          returnId: uniqueReturnId,
          tenantId,
          creditNoteNumber,
          returnDate,
          invoiceNumber,
          partyId: partyId || null,
          partyName,
          partyPhone,
          subtotal: totalReturnAmount,
          grandTotal: totalReturnAmount,
          refundAmount,
          notes
        }, { transaction: t });

        // 2. Create SaleReturnItems & Increase Item Stock Levels (item.currentStock += returnQuantity)
        for (const item of items) {
          const returnQty = Number(item.returnQuantity) || Number(item.quantity) || 1;
          const rate = Number(item.unitPrice) || Number(item.price) || 0;
          const itemTotal = Number(item.totalAmount) || (returnQty * rate);

          await SaleReturnItem.create({
            saleReturnId: newReturn.id,
            itemId: item.itemId || item.id || null,
            itemName: item.itemName || item.name || 'Returned Item',
            hsnSacCode: item.hsnSacCode || '1000',
            unitType: item.unitType || 'PCS',
            returnQuantity: returnQty,
            unitPrice: rate,
            taxAmount: Number(item.taxAmount) || 0,
            totalAmount: itemTotal
          }, { transaction: t });

          // INCREASE Item Stock Level (item.stock += returned_qty)
          let dbItem = item.itemId ? await Item.findByPk(item.itemId, { transaction: t }) : null;
          if (!dbItem && item.itemName) {
            dbItem = await Item.findOne({ where: { name: item.itemName }, transaction: t });
          }
          if (dbItem) {
            const curStock = (dbItem.get('currentStock') as number) || 0;
            await dbItem.update({
              currentStock: curStock + returnQty
            }, { transaction: t });
          }
        }

        // 3. Update Customer Account Balance in parties table (customer.balance -= return_amount)
        if (partyId || partyName) {
          let customer = partyId ? await Party.findByPk(partyId, { transaction: t }) : null;
          if (!customer && partyName) {
            customer = await Party.findOne({ where: { name: partyName }, transaction: t });
          }
          if (customer) {
            const curBal = (customer.get('currentBalance') as number) || 0;
            await customer.update({ currentBalance: Math.max(0, curBal - totalReturnAmount) }, { transaction: t });
          }
        }

        // 3b. Update Sales Invoice dueAmount & paymentStatus in PostgreSQL
        let targetInvoice: any = null;
        if (invoiceNumber && invoiceNumber.trim() !== '') {
          targetInvoice = await Invoice.findOne({ where: { invoiceNumber: invoiceNumber.trim() }, transaction: t });
        }
        if (!targetInvoice && (partyId || partyName)) {
          let cust = partyId ? await Party.findByPk(partyId, { transaction: t }) : null;
          if (!cust && partyName) cust = await Party.findOne({ where: { name: partyName }, transaction: t });
          if (cust) {
            targetInvoice = await Invoice.findOne({
              where: { partyId: cust.id },
              order: [['id', 'DESC']],
              transaction: t
            });
          }
        }
        if (targetInvoice) {
          const curDue = (targetInvoice.get('dueAmount') as number) ?? (targetInvoice.get('grandTotal') as number) ?? 0;
          const grandTotalVal = (targetInvoice.get('grandTotal') as number) || 0;
          const newDue = Math.max(0, curDue - totalReturnAmount);
          const newStatus = newDue === 0 ? 'PAID' : (newDue < grandTotalVal ? 'PARTIAL' : targetInvoice.get('paymentStatus'));
          await targetInvoice.update({
            dueAmount: newDue,
            paymentStatus: newStatus
          }, { transaction: t });
        }

        // 4. Insert Journal Entry in journal_entries table
        await JournalEntry.create({
          tenantId,
          entryNumber: `JE-CR-${Date.now().toString().slice(-4)}`,
          referenceId: creditNoteNumber,
          transactionDate: returnDate,
          description: `Sale Return / Credit Note ${creditNoteNumber} from ${partyName}`,
          totalDebit: totalReturnAmount,
          totalCredit: totalReturnAmount
        }, { transaction: t });

        await t.commit();

        const fullReturn = await SaleReturn.findByPk(newReturn.id, {
          include: [{ model: SaleReturnItem, as: 'items' }]
        });

        return res.status(201).json({
          success: true,
          message: 'Sale Return / Credit Note recorded in PostgreSQL. Stock increased & customer balance reduced.',
          data: fullReturn
        });
      } catch (err: any) {
        await t.rollback();
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    return res.status(201).json({ success: true, data: req.body });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/sale-returns/:id - Delete Sale Return / Credit Note
saleReturnsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (isDbConnected()) {
      await SaleReturn.destroy({ where: { id } });
      return res.json({ success: true, message: 'Sale Return / Credit Note deleted' });
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting sale return:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
