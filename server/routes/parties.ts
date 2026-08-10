import { Router, Request, Response } from 'express';
import { query, isDbConnected } from '../db/postgres.js';

export const partiesRouter = Router();

// GET /api/v1/parties - Fetch party accounts from PostgreSQL
partiesRouter.get('/', async (req: Request, res: Response) => {
  try {
    if (isDbConnected()) {
      const result = await query(
        `SELECT id, tenant_id as "tenantId", name, phone, type, 
                opening_balance::float as "openingBalance", balance_type as "balanceType", 
                current_balance::float as "currentBalance", gstin, address, created_at as "createdAt"
         FROM parties ORDER BY name ASC`
      );
      return res.json({ success: true, count: result.rows.length, data: result.rows });
    }
    return res.json({ success: true, count: 0, data: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/parties - Insert new customer/supplier into PostgreSQL
partiesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      tenantId = 'default-tenant',
      name,
      phone,
      type = 'CUSTOMER',
      openingBalance = 0,
      balanceType = 'RECEIVABLE',
      gstin = '',
      address = ''
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, error: 'Party name and phone number are required' });
    }

    if (isDbConnected()) {
      const result = await query(
        `INSERT INTO parties 
          (tenant_id, name, phone, type, opening_balance, balance_type, current_balance, gstin, address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, tenant_id as "tenantId", name, phone, type, opening_balance::float as "openingBalance", balance_type as "balanceType", current_balance::float as "currentBalance", gstin, address`,
        [tenantId, name, phone, type, openingBalance, balanceType, openingBalance, gstin, address]
      );
      return res.status(201).json({ success: true, data: result.rows[0] });
    }

    return res.status(201).json({ success: true, data: req.body });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/parties/:id/payment - Record payment received/paid in PostgreSQL
partiesRouter.post('/:id/payment', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, remarks = '', partyType = 'CUSTOMER', tenantId = 'default-tenant' } = req.body;

    const paymentAmt = Number(amount) || 0;
    if (paymentAmt <= 0) {
      return res.status(400).json({ success: false, error: 'Valid payment amount required' });
    }

    if (isDbConnected()) {
      // Update Party current balance in PostgreSQL
      const result = await query(
        `UPDATE parties 
         SET current_balance = GREATEST(0, current_balance - $1) 
         WHERE id = $2 
         RETURNING id, name, current_balance::float as "currentBalance"`,
        [paymentAmt, id]
      );

      const partyName = result.rows[0]?.name || 'Party';

      // Insert Journal Entry in PostgreSQL
      await query(
        `INSERT INTO journal_entries 
          (tenant_id, entry_number, reference_id, transaction_date, description, total_debit, total_credit)
         VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6)`,
        [
          tenantId,
          `JE-PAY-${Date.now().toString().slice(-4)}`,
          `PAY-${partyName}`,
          `Payment ${partyType === 'CUSTOMER' ? 'Received from' : 'Made to'} ${partyName}: ${remarks}`,
          paymentAmt,
          paymentAmt
        ]
      );

      return res.json({ success: true, data: result.rows[0] });
    }

    return res.json({ success: true, data: { id, amount: paymentAmt } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/parties/:id - Delete party account from PostgreSQL
partiesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (isDbConnected()) {
      await query(`DELETE FROM parties WHERE id = $1`, [id]);
    }
    return res.json({ success: true, message: `Party ${id} deleted` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
