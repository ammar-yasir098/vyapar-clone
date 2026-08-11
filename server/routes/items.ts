import { Router, Request, Response } from 'express';
import { Item, isDbConnected } from '../db/sequelize.js';

export const itemsRouter = Router();

// GET /api/v1/items - Fetch product catalog using Sequelize
itemsRouter.get('/', async (req: Request, res: Response) => {
  try {
    if (isDbConnected()) {
      const items = await Item.findAll({ order: [['name', 'ASC']] });
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

    if (!name || salesPrice === undefined) {
      return res.status(400).json({ success: false, error: 'Product name and sales price are required' });
    }

    if (isDbConnected()) {
      const newItem = await Item.create({
        tenantId,
        name,
        skuCode: skuCode || null,
        barcode: barcode || null,
        hsnSacCode,
        unitType,
        purchasePrice,
        salesPrice,
        minStockAlert,
        currentStock,
        cgstRate,
        sgstRate,
        igstRate
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
      await Item.destroy({ where: { id: Number(id) } });
    }
    return res.json({ success: true, message: `Product ${id} deleted` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
