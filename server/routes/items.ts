import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { Item, InvoiceItem, isDbConnected } from '../db/sequelize.js';

export const itemsRouter = Router();

// GET /api/v1/items - Fetch product catalog using Sequelize
itemsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;
    if (isDbConnected()) {
      const tId = tenantId ? String(tenantId) : 'default-tenant';
      const whereClause = {
        [Op.or]: [
          { tenantId: tId },
          { tenantId: 'default-tenant' },
          { tenantId: null as any }
        ]
      };
      const items = await Item.findAll({ where: whereClause, order: [['name', 'ASC']] });

      // Auto-migrate any default-tenant items to active store tenantId
      if (tId !== 'default-tenant' && items.length > 0) {
        for (const item of items) {
          if (!item.get('tenantId') || item.get('tenantId') === 'default-tenant') {
            await item.update({ tenantId: tId }).catch(() => {});
          }
        }
      }

      return res.json({ success: true, count: items.length, data: items });
    }
    return res.json({ success: true, count: 0, data: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/items - Create item using Sequelize
itemsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      tenantId = 'default-tenant',
      name,
      skuCode,
      barcode,
      hsnSacCode = '1000',
      unitType = 'PCS',
      purchasePrice = 0,
      salesPrice = 0,
      minStockAlert = 5,
      currentStock = 0,
      cgstRate = 9,
      sgstRate = 9,
      igstRate = 18
    } = req.body;

    const cleanName = String(name || '').trim();
    const safePurchasePrice = Math.max(0, Math.round((Number(purchasePrice) || 0) * 100) / 100);
    const safeSalesPrice = Math.max(0, Math.round((Number(salesPrice) || 0) * 100) / 100);
    const safeCurrentStock = Math.max(0, Number(currentStock) || 0);

    if (!cleanName || safeSalesPrice < 0) {
      return res.status(400).json({ success: false, error: 'Product name and valid sales price are required' });
    }

    if (isDbConnected()) {
      const newItem = await Item.create({
        tenantId,
        name: cleanName,
        skuCode: skuCode ? String(skuCode).trim() : null,
        barcode: barcode ? String(barcode).trim() : null,
        hsnSacCode: hsnSacCode || '1000',
        unitType: unitType || 'PCS',
        purchasePrice: safePurchasePrice,
        salesPrice: safeSalesPrice,
        minStockAlert: Math.max(0, Number(minStockAlert) || 5),
        currentStock: safeCurrentStock,
        cgstRate: Math.max(0, Number(cgstRate) || 0),
        sgstRate: Math.max(0, Number(sgstRate) || 0),
        igstRate: Math.max(0, Number(igstRate) || 0)
      });
      return res.status(201).json({ success: true, data: newItem });
    }

    return res.status(201).json({ success: true, data: req.body });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/items/:id - Update full item using Sequelize
itemsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (isDbConnected()) {
      const item = await Item.findByPk(Number(id));
      if (item) {
        await item.update(updateData);
        return res.json({ success: true, data: item });
      }
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    return res.json({ success: true, data: { id, ...updateData } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/items/:id/stock - Adjust stock using Sequelize
itemsRouter.put('/:id/stock', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { delta } = req.body;

    if (isDbConnected()) {
      const item = await Item.findByPk(Number(id));
      if (item) {
        const newStock = Math.max(0, (item.get('currentStock') as number || 0) + (Number(delta) || 0));
        await item.update({ currentStock: newStock });
        return res.json({ success: true, data: item });
      }
    }
    return res.json({ success: true, data: { id, delta } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/items/:id - Delete item using Sequelize
itemsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (isDbConnected()) {
      await InvoiceItem.destroy({ where: { itemId: Number(id) } });
      await Item.destroy({ where: { id: Number(id) } });
    }
    return res.json({ success: true, message: `Product ${id} deleted` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
