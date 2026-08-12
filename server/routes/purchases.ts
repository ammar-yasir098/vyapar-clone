import { Router, Request, Response } from 'express';
import { Item, Party, JournalEntry, isDbConnected, sequelize } from '../db/sequelize.js';

export const purchasesRouter = Router();

// POST /api/v1/purchases - Insert purchase bill & update stock/payables using Sequelize ORM
purchasesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      billNumber = `PUR-${Date.now().toString().slice(-4)}`,
      billDate = new Date().toISOString().split('T')[0],
      supplierId,
      supplierName,
      items = [],
      tenantId = 'default-tenant'
    } = req.body;

    if (!supplierName || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Supplier name and items are required' });
    }

    const totalCost = items.reduce((sum: number, item: any) => {
      const qty = Number(item.quantity) || 1;
      const rate = Number(item.unitPrice) || 0;
      return sum + qty * rate;
    }, 0);

    if (isDbConnected()) {
      const t = await sequelize.transaction();
      try {
        // Update Item Stock Levels & Purchase Rates in items table
        for (const item of items) {
          let dbItem = item.itemId ? await Item.findByPk(item.itemId, { transaction: t }) : null;
          if (!dbItem && item.itemName) {
            dbItem = await Item.findOne({ where: { name: item.itemName }, transaction: t });
          }
          if (dbItem) {
            const curStock = (dbItem.get('currentStock') as number) || 0;
            await dbItem.update({
              currentStock: curStock + (Number(item.quantity) || 1),
              purchasePrice: Number(item.unitPrice) || (dbItem.get('purchasePrice') as number) || 0
            }, { transaction: t });
          }
        }

        // Update Supplier Account Balance in parties table
        if (supplierId || supplierName) {
          let supplier = supplierId ? await Party.findByPk(supplierId, { transaction: t }) : null;
          if (!supplier && supplierName) {
            supplier = await Party.findOne({ where: { name: supplierName }, transaction: t });
          }
          if (supplier) {
            const curBal = (supplier.get('currentBalance') as number) || 0;
            await supplier.update({ currentBalance: curBal + totalCost }, { transaction: t });
          }
        }

        // Insert Journal Entry in journal_entries table
        await JournalEntry.create({
          tenantId,
          entryNumber: `JE-PUR-${Date.now().toString().slice(-4)}`,
          referenceId: billNumber,
          transactionDate: billDate,
          description: `Purchase Inward Bill ${billNumber} from ${supplierName}`,
          totalDebit: totalCost,
          totalCredit: totalCost
        }, { transaction: t });

        await t.commit();

        return res.status(201).json({
          success: true,
          message: 'Purchase committed to PostgreSQL. Stock and supplier payable updated.',
          data: { billNumber, supplierName, totalCost }
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
