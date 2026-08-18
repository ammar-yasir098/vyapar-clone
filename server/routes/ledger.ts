import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { LedgerAccount, JournalEntry, isDbConnected, seedServerLedgerAccounts } from '../db/sequelize.js';

export const ledgerRouter = Router();

// GET /api/v1/ledger/accounts - Fetch Chart of Accounts using Sequelize
ledgerRouter.get('/accounts', async (req: Request, res: Response) => {
  try {
    const { tenantId = 'default-tenant' } = req.query;
    if (isDbConnected()) {
      const tId = String(tenantId);
      let accounts = await LedgerAccount.findAll({ where: { tenantId: tId }, order: [['accountCode', 'ASC']] });
      if (accounts.length === 0) {
        await seedServerLedgerAccounts(tId);
        accounts = await LedgerAccount.findAll({ where: { tenantId: tId }, order: [['accountCode', 'ASC']] });
      }
      return res.json({ success: true, count: accounts.length, data: accounts });
    }
    return res.json({ success: true, count: 0, data: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/ledger/journals - Fetch Journal Entries using Sequelize
ledgerRouter.get('/journals', async (req: Request, res: Response) => {
  try {
    const { tenantId = 'default-tenant' } = req.query;
    if (isDbConnected()) {
      const tId = String(tenantId);
      const whereClause = {
        [Op.or]: [
          { tenantId: tId },
          { tenantId: 'default-tenant' },
          { tenantId: null as any }
        ]
      };
      const journals = await JournalEntry.findAll({ where: whereClause, order: [['id', 'DESC']] });
      if (tId !== 'default-tenant' && journals.length > 0) {
        for (const je of journals) {
          if (!je.get('tenantId') || je.get('tenantId') === 'default-tenant') {
            await je.update({ tenantId: tId }).catch(() => {});
          }
        }
      }
      return res.json({ success: true, count: journals.length, data: journals });
    }
    return res.json({ success: true, count: 0, data: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
