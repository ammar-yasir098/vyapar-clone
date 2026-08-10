import { Router, Request, Response } from 'express';
import { query, isDbConnected } from '../db/postgres.js';

export const partiesRouter = Router();

// GET /api/v1/parties - Fetch parties catalog
partiesRouter.get('/', async (req: Request, res: Response) => {
  try {
    if (isDbConnected()) {
      const result = await query(
        `SELECT id, tenant_id as "tenantId", name, phone, type, 
                opening_balance as "openingBalance", balance_type as "balanceType", 
                current_balance as "currentBalance", gstin, address, created_at as "createdAt"
         FROM parties ORDER BY name ASC`
      );
      return res.json({ success: true, count: result.rows.length, data: result.rows });
    }

    return res.json({ success: true, count: 0, data: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/parties - Insert new customer/supplier
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
         RETURNING id, name, phone, type, current_balance as "currentBalance"`,
        [tenantId, name, phone, type, openingBalance, balanceType, openingBalance, gstin, address]
      );
      return res.status(201).json({ success: true, data: result.rows[0] });
    }

    return res.status(201).json({ success: true, data: req.body });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
