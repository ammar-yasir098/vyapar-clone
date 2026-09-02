import { Router, Request, Response } from 'express';
import { Item, Party, Invoice, SaleReturn, SaleReturnItem, ItemLocationMapping, InventoryLocation, CashAccount, CashTransaction, isDbConnected, sequelize } from '../db/sequelize.js';

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
      refundMode = 'CASH_REFUND',
      notes = '',
      tenantId: rawTenantId
    } = req.body;

    const tenantId = rawTenantId || (req as any).user?.tenantId || 'default-tenant';

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
          partyId: partyId ? String(partyId) : null,
          partyName,
          partyPhone,
          subtotal: totalReturnAmount,
          grandTotal: totalReturnAmount,
          refundAmount: refundMode === 'CASH_REFUND' ? totalReturnAmount : 0,
          notes
        }, { transaction: t });

        // 2. Create SaleReturnItems & Increase Item Stock Levels (item.currentStock += returnQuantity)
        for (const item of items) {
          const returnQty = Number(item.returnQuantity) || Number(item.quantity) || 1;
          const rate = Number(item.unitPrice) || Number(item.price) || 0;
          const itemTotal = Number(item.totalAmount) || (returnQty * rate);

          await SaleReturnItem.create({
            saleReturnId: (newReturn as any).id,
            itemId: item.itemId ? String(item.itemId) : (item.id ? String(item.id) : null),
            itemName: item.itemName || item.name || 'Returned Item',
            hsnSacCode: item.hsnSacCode || '1000',
            unitType: item.unitType || 'PCS',
            returnQuantity: returnQty,
            unitPrice: rate,
            taxAmount: Number(item.taxAmount) || 0,
            totalAmount: itemTotal
          }, { transaction: t });

          // INCREASE Item Stock Level (item.stock += returned_qty)
          let dbItem = item.itemId ? await Item.findByPk(String(item.itemId), { transaction: t }) : null;
          if (!dbItem && item.itemName) {
            dbItem = await Item.findOne({ where: { name: item.itemName, tenantId }, transaction: t })
              || await Item.findOne({ where: { name: item.itemName }, transaction: t });
          }
          if (dbItem) {
            const curStock = Number(dbItem.get('currentStock')) || 0;
            await dbItem.update({
              currentStock: curStock + returnQty
            }, { transaction: t });

            // RESTOCK into Store Front shelf mapping in PostgreSQL!
            const storeLoc = await InventoryLocation.findOne({
              where: { tenantId, code: 'STORE-FRONT' },
              transaction: t
            });

            if (storeLoc) {
              const storeMap = await ItemLocationMapping.findOne({
                where: { tenantId, itemId: String(dbItem.id), locationId: String((storeLoc as any).id) },
                transaction: t
              });

              if (storeMap) {
                const curLocQty = Number(storeMap.get('quantity')) || 0;
                await storeMap.update({ quantity: curLocQty + returnQty }, { transaction: t });
              } else {
                await ItemLocationMapping.create({
                  id: `map-${dbItem.id}-${(storeLoc as any).id}`,
                  tenantId,
                  itemId: String(dbItem.id),
                  locationId: String((storeLoc as any).id),
                  quantity: returnQty
                }, { transaction: t });
              }
            }
          }
        }

        // 3. Update Customer Account Balance
        let customer = partyId ? await Party.findByPk(String(partyId), { transaction: t }) : null;
        if (!customer && partyName) {
          customer = await Party.findOne({ where: { name: partyName, tenantId }, transaction: t })
            || await Party.findOne({ where: { name: partyName }, transaction: t });
        }

        if (customer) {
          const curBal = Number(customer.get('currentBalance')) || 0;
          if (refundMode === 'STORE_CREDIT') {
            // Store Credit: credit to customer account (reduces balance, can go negative = advance)
            const newBal = curBal - totalReturnAmount;
            await customer.update({ currentBalance: newBal }, { transaction: t });
          } else {
            // CASH_REFUND: If customer had outstanding dues, reduce dues; otherwise balance stays 0
            if (curBal > 0) {
              const newBal = Math.max(0, curBal - totalReturnAmount);
              await customer.update({ currentBalance: newBal }, { transaction: t });
            }

            // Post Cash Outflow Entry if cash was refunded
            if (totalReturnAmount > 0) {
              let cAccount = await CashAccount.findOne({ where: { tenantId }, transaction: t });
              if (!cAccount) {
                cAccount = await CashAccount.create({ tenantId, name: 'Main Cash Drawer', openingBalance: 0 }, { transaction: t });
              }
              await CashTransaction.create({
                cashAccountId: (cAccount as any).id,
                tenantId,
                type: 'OUT',
                amount: totalReturnAmount,
                source: 'SALE_RETURN_REFUND',
                referenceId: creditNoteNumber,
                description: `Cash refund for Sale Return ${creditNoteNumber} (${partyName})`,
                transactionDate: returnDate
              }, { transaction: t });
            }
          }
        }

        // 4. Update Sales Invoice dueAmount & paymentStatus in PostgreSQL if applicable
        let targetInvoice: any = null;
        if (invoiceNumber && invoiceNumber.trim() !== '') {
          targetInvoice = await Invoice.findOne({ where: { tenantId, invoiceNumber: invoiceNumber.trim() }, transaction: t })
            || await Invoice.findOne({ where: { invoiceNumber: invoiceNumber.trim() }, transaction: t });
        }
        if (!targetInvoice && customer) {
          targetInvoice = await Invoice.findOne({
            where: { tenantId, partyId: String(customer.id) },
            order: [['id', 'DESC']],
            transaction: t
          });
        }
        if (targetInvoice) {
          const curDue = Number(targetInvoice.get('dueAmount')) || 0;
          const grandTotalVal = Number(targetInvoice.get('grandTotal')) || 0;
          const newDue = Math.max(0, curDue - totalReturnAmount);
          const newStatus = newDue === 0 ? 'PAID' : (newDue < grandTotalVal ? 'PARTIAL' : targetInvoice.get('paymentStatus'));
          await targetInvoice.update({
            dueAmount: newDue,
            paymentStatus: newStatus
          }, { transaction: t });
        }

        const fullReturn = await SaleReturn.findByPk(String((newReturn as any).id), {
          include: [{ model: SaleReturnItem, as: 'items' }],
          transaction: t
        });

        await t.commit();

        return res.status(201).json({
          success: true,
          message: 'Sale Return / Credit Note recorded in PostgreSQL. Stock increased & customer balance updated.',
          data: fullReturn
        });
      } catch (err: any) {
        try {
          if (t && !(t as any).finished) {
            await t.rollback();
          }
        } catch (_) {}
        console.error('Error in POST /sale-returns transaction:', err);
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
