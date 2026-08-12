import { Router, Request, Response } from 'express';
import { LedgerAccount, JournalEntry, isDbConnected, seedServerLedgerAccounts } from '../db/sequelize.js';

export const ledgerRouter = Router();

// GET /api/v1/ledger/accounts - Fetch Chart of Accounts using Sequelize
ledgerRouter.get('/accounts', async (req: Request, res: Response) => {
  try {
    if (isDbConnected()) {
      let accounts = await LedgerAccount.findAll({ order: [['accountCode', 'ASC']] });
      if (accounts.length === 0) {
        await seedServerLedgerAccounts();
        accounts = await LedgerAccount.findAll({ order: [['accountCode', 'ASC']] });
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
    if (isDbConnected()) {
      const journals = await JournalEntry.findAll({ order: [['id', 'DESC']] });
      return res.json({ success: true, count: journals.length, data: journals });
    }
    return res.json({ success: true, count: 0, data: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
