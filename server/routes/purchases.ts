import { Router, Request, Response } from 'express';
import { Item, Party, PurchaseBill, PurchaseBillItem, CashAccount, CashTransaction, isDbConnected, sequelize } from '../db/sequelize.js';

export const purchasesRouter = Router();

// GET /api/v1/purchases - Fetch all purchase bills for active tenant
purchasesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { tenantId = 'default-tenant' } = req.query;

    if (isDbConnected()) {
      const tId = String(tenantId);
      const bills = await PurchaseBill.findAll({
        where: { tenantId: tId },
        include: [{ model: PurchaseBillItem, as: 'items' }],
        order: [['id', 'DESC']]
      });

      return res.json({ success: true, count: bills.length, data: bills });
    }

    return res.json({ success: true, data: [] });
  } catch (err: any) {
    console.error('Error fetching purchase bills:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/purchases - Insert purchase bill & update stock/payables using Sequelize ORM
purchasesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      billId,
      billNumber = `PUR-${Date.now().toString().slice(-4)}`,
      billDate = new Date().toISOString().split('T')[0],
      supplierId,
      supplierName,
      supplierPhone,
      supplierGstin,
      notes = '',
      items = [],
      paymentMethod = 'CASH',
      paidAmount,
      tenantId = 'default-tenant'
    } = req.body;

    if (!supplierName || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Supplier name and items are required' });
    }

    const totalCost = items.reduce((sum: number, item: any) => {
      const qty = Number(item.quantity) || 1;
      const rate = Number(item.unitPrice) || Number(item.purchasePrice) || 0;
      return sum + (Number(item.totalAmount) || (qty * rate));
    }, 0);

    if (isDbConnected()) {
      const t = await sequelize.transaction();
      try {
        const uniqueBillId = billId || `pur-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        // 1. Create PurchaseBill in purchase_bills
        const newBill = await PurchaseBill.create({
          billId: uniqueBillId,
          tenantId,
          billNumber,
          billDate,
          supplierId: supplierId || null,
          supplierName,
          supplierPhone: supplierPhone || '',
          supplierGstin: supplierGstin || '',
          subtotal: totalCost,
          taxTotal: 0,
          grandTotal: totalCost,
          notes
        }, { transaction: t });

        // 2. Create PurchaseBillItems in purchase_bill_items & update Item stock
        for (const item of items) {
          const qty = Number(item.quantity) || 1;
          const rate = Number(item.unitPrice) || Number(item.purchasePrice) || 0;
          const itemTotal = Number(item.totalAmount) || (qty * rate);

          await PurchaseBillItem.create({
            purchaseBillId: newBill.id,
            itemId: item.itemId || item.id || null,
            itemName: item.itemName || item.name || 'Item',
            hsnSacCode: item.hsnSacCode || '1000',
            unitType: item.unitType || 'PCS',
            quantity: qty,
            unitPrice: rate,
            purchasePrice: rate,
            taxAmount: 0,
            totalAmount: itemTotal
          }, { transaction: t });

          // Update Item Stock
          let dbItem = item.itemId ? await Item.findByPk(item.itemId, { transaction: t }) : null;
          if (!dbItem && item.itemName) {
            dbItem = await Item.findOne({ where: { name: item.itemName }, transaction: t });
          }
          if (dbItem) {
            const curStock = (dbItem.get('currentStock') as number) || 0;
            await dbItem.update({
              currentStock: curStock + qty,
              purchasePrice: rate || (dbItem.get('purchasePrice') as number) || 0
            }, { transaction: t });
          }
        }

        // 3. Update Supplier Account Balance in parties table (supplier.balance += total_bill_amount)
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



        await t.commit();

        const fullBill = await PurchaseBill.findByPk(newBill.id, {
          include: [{ model: PurchaseBillItem, as: 'items' }]
        });

        return res.status(201).json({
          success: true,
          message: 'Purchase committed to PostgreSQL. Stock and supplier payable updated.',
          data: fullBill
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

// DELETE /api/v1/purchases/:id - Delete purchase bill
purchasesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (isDbConnected()) {
      await PurchaseBill.destroy({ where: { id } });
      return res.json({ success: true, message: 'Purchase Bill deleted' });
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting purchase bill:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

