import { Router, Request, Response } from 'express';
import { query, pool, isDbConnected } from '../db/postgres.js';

export const purchasesRouter = Router();

// POST /api/v1/purchases - Insert purchase bill & update stock/payables in PostgreSQL
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
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Update Item Stock Levels & Purchase Rates in PostgreSQL items table
        for (const item of items) {
          if (item.itemId) {
            await client.query(
              `UPDATE items 
               SET current_stock = current_stock + $1, 
                   purchase_price = $2, 
                   updated_at = CURRENT_TIMESTAMP 
               WHERE id = $3`,
              [Number(item.quantity) || 1, Number(item.unitPrice) || 0, item.itemId]
            );
          }
        }

        // Update Supplier Account Balance in PostgreSQL parties table
        if (supplierId) {
          await client.query(
            `UPDATE parties SET current_balance = current_balance + $1 WHERE id = $2`,
            [totalCost, supplierId]
          );
        }

        // Insert Journal Entry in PostgreSQL journal_entries table
        await client.query(
          `INSERT INTO journal_entries 
            (tenant_id, entry_number, reference_id, transaction_date, description, total_debit, total_credit)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            tenantId,
            `JE-PUR-${Date.now().toString().slice(-4)}`,
            billNumber,
            billDate,
            `Purchase Inward Bill ${billNumber} from ${supplierName}`,
            totalCost,
            totalCost
          ]
        );

        await client.query('COMMIT');
        client.release();

        return res.status(201).json({
          success: true,
          message: 'Purchase committed to PostgreSQL. Stock and supplier payable updated.',
          data: { billNumber, supplierName, totalCost }
        });
      } catch (err: any) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    return res.status(201).json({ success: true, data: req.body });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
