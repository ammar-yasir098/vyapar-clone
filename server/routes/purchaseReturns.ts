import { Router, Request, Response } from 'express';
import { Item, Party, PurchaseReturn, PurchaseReturnItem, isDbConnected, sequelize } from '../db/sequelize.js';

export const purchaseReturnsRouter = Router();

// GET /api/v1/purchase-returns - Fetch all debit notes for active tenant
purchaseReturnsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { tenantId = 'default-tenant' } = req.query;

    if (isDbConnected()) {
      const tId = String(tenantId);
      const returns = await PurchaseReturn.findAll({
        where: { tenantId: tId },
        include: [{ model: PurchaseReturnItem, as: 'items' }],
        order: [['id', 'DESC']]
      });

      return res.json({ success: true, data: returns });
    }

    return res.json({ success: true, data: [] });
  } catch (err: any) {
    console.error('Error fetching purchase returns:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/purchase-returns - Insert Purchase Return / Debit Note & update stock/payables using Sequelize ORM
purchaseReturnsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      returnId,
      debitNoteNumber = `DN-${Date.now().toString().slice(-4)}`,
      returnDate = new Date().toISOString().split('T')[0],
      purchaseBillNumber = '',
      supplierId,
      supplierName,
      supplierPhone = '',
      items = [],
      notes = '',
      tenantId = 'default-tenant'
    } = req.body;

    if (!supplierName || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Supplier name and returned items are required' });
    }

    const totalReturnAmount = items.reduce((sum: number, item: any) => {
      const qty = Number(item.returnQuantity) || Number(item.quantity) || 1;
      const rate = Number(item.unitPrice) || Number(item.purchasePrice) || 0;
      return sum + (Number(item.totalAmount) || (qty * rate));
    }, 0);

    if (isDbConnected()) {
      const t = await sequelize.transaction();
      try {
        const uniqueReturnId = returnId || `dn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        // 1. Create PurchaseReturn record
        const newReturn = await PurchaseReturn.create({
          returnId: uniqueReturnId,
          tenantId,
          debitNoteNumber,
          returnDate,
          purchaseBillNumber,
          supplierId: supplierId || null,
          supplierName,
          supplierPhone,
          subtotal: totalReturnAmount,
          grandTotal: totalReturnAmount,
          notes
        }, { transaction: t });

        // 2. Create PurchaseReturnItems & Deduct Item Stock Levels (item.currentStock -= returnQuantity)
        for (const item of items) {
          const returnQty = Number(item.returnQuantity) || Number(item.quantity) || 1;
          const rate = Number(item.unitPrice) || Number(item.purchasePrice) || 0;
          const itemTotal = Number(item.totalAmount) || (returnQty * rate);

          await PurchaseReturnItem.create({
            purchaseReturnId: newReturn.id,
            itemId: item.itemId || item.id || null,
            itemName: item.itemName || item.name || 'Returned Item',
            unitType: item.unitType || 'PCS',
            returnQuantity: returnQty,
            unitPrice: rate,
            totalAmount: itemTotal
          }, { transaction: t });

          // Reduce Item Stock Level
          let dbItem = item.itemId ? await Item.findByPk(item.itemId, { transaction: t }) : null;
          if (!dbItem && item.itemName) {
            dbItem = await Item.findOne({ where: { name: item.itemName }, transaction: t });
          }
          if (dbItem) {
            const curStock = (dbItem.get('currentStock') as number) || 0;
            await dbItem.update({
              currentStock: Math.max(0, curStock - returnQty)
            }, { transaction: t });
          }
        }

        // 3. Update Supplier Account Balance in parties table (supplier.currentBalance -= totalReturnAmount)
        if (supplierId || supplierName) {
          let supplier = supplierId ? await Party.findByPk(supplierId, { transaction: t }) : null;
          if (!supplier && supplierName) {
            supplier = await Party.findOne({ where: { name: supplierName }, transaction: t });
          }
          if (supplier) {
            const curBal = (supplier.get('currentBalance') as number) || 0;
            await supplier.update({ currentBalance: Math.max(0, curBal - totalReturnAmount) }, { transaction: t });
          }
        }



        await t.commit();

        const fullReturn = await PurchaseReturn.findByPk(newReturn.id, {
          include: [{ model: PurchaseReturnItem, as: 'items' }]
        });

        return res.status(201).json({
          success: true,
          message: 'Purchase Return recorded in PostgreSQL. Stock and supplier payable reduced.',
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

// DELETE /api/v1/purchase-returns/:id - Delete Purchase Return / Debit Note
purchaseReturnsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (isDbConnected()) {
      await PurchaseReturn.destroy({ where: { id } });
      return res.json({ success: true, message: 'Purchase Return deleted' });
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting purchase return:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
