import { Router, Request, Response } from 'express';
import { query, isDbConnected } from '../db/postgres.js';

export const ledgerRouter = Router();

// GET /api/v1/ledger/accounts - Fetch Chart of Accounts from PostgreSQL
ledgerRouter.get('/accounts', async (req: Request, res: Response) => {
  try {
    if (isDbConnected()) {
      const result = await query(
        `SELECT id, tenant_id as "tenantId", account_code as "accountCode", 
                account_name as "accountName", account_type as "accountType", 
                COALESCE(balance, 0.00) as balance, description 
         FROM ledger_accounts ORDER BY account_code ASC`
      );
      return res.json({ success: true, count: result.rows.length, data: result.rows });
    }
    return res.json({ success: true, count: 0, data: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/ledger/journals - Fetch Journal Entries from PostgreSQL
ledgerRouter.get('/journals', async (req: Request, res: Response) => {
  try {
    if (isDbConnected()) {
      const result = await query(
        `SELECT id, tenant_id as "tenantId", entry_number as "entryNumber", 
                reference_id as "referenceId", transaction_date as "transactionDate", 
                description, total_debit as "totalDebit", total_credit as "totalCredit", 
                created_at as "createdAt"
         FROM journal_entries ORDER BY created_at DESC`
      );
      return res.json({ success: true, count: result.rows.length, data: result.rows });
    }
    return res.json({ success: true, count: 0, data: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
