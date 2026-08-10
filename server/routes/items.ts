import { Router, Request, Response } from 'express';
import { query, isDbConnected } from '../db/postgres.js';
import { localStore } from '../db/store.js';

export const itemsRouter = Router();

// GET /api/v1/items - Fetch product catalog
itemsRouter.get('/', async (req: Request, res: Response) => {
  try {
    if (isDbConnected()) {
      const result = await query(
        `SELECT id, tenant_id as "tenantId", name, sku_code as "skuCode", barcode, 
                hsn_sac_code as "hsnSacCode", unit_type as "unitType", 
                purchase_price as "purchasePrice", sales_price as "salesPrice", 
                min_stock_alert as "minStockAlert", current_stock as "currentStock", 
                cgst_rate as "cgstRate", sgst_rate as "sgstRate", igst_rate as "igstRate", 
                is_active as "isActive" 
         FROM items ORDER BY name ASC`
      );
      return res.json({ success: true, count: result.rows.length, data: result.rows });
    }

    // Fallback store
    return res.json({ success: true, count: 0, data: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/items - Insert new product
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
      const result = await query(
        `INSERT INTO items 
          (tenant_id, name, sku_code, barcode, hsn_sac_code, unit_type, purchase_price, sales_price, min_stock_alert, current_stock, cgst_rate, sgst_rate, igst_rate)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id, name, sku_code as "skuCode", sales_price as "salesPrice", current_stock as "currentStock"`,
        [tenantId, name, skuCode, barcode, hsnSacCode, unitType, purchasePrice, salesPrice, minStockAlert, currentStock, cgstRate, sgstRate, igstRate]
      );
      return res.status(201).json({ success: true, data: result.rows[0] });
    }

    return res.status(201).json({ success: true, data: req.body });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
