import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { CashAccount, CashTransaction, JournalEntry, LedgerAccount, isDbConnected, sequelize } from '../db/sequelize.js';

export const cashRouter = Router();

// Helper financial rounding
const round2 = (val: any) => {
  const n = Number(val);
  return isNaN(n) || !isFinite(n) ? 0 : Math.round((n + Number.EPSILON) * 100) / 100;
};

// Helper: Ensure default Main Cash Drawer exists for tenant
async function getOrCreateCashAccount(tId: string = 'default-tenant', transaction?: any) {
  let account = await CashAccount.findOne({
    where: { tenantId: tId },
    transaction
  });

  if (!account) {
    account = await CashAccount.create(
      {
        tenantId: tId,
        name: 'Main Cash Drawer',
        openingBalance: 0.00
      },
      { transaction }
    );
  }
  return account;
}

// Helper: Deduplicate cash transactions by referenceId or signature across tenant drawers
async function deduplicateCashTransactions(cId: number, tenantId?: string, transaction?: any) {
  try {
    // Purge orphaned default-tenant rows if present for the same referenceId
    if (tenantId && tenantId !== 'default-tenant') {
      const activeTxns = await CashTransaction.findAll({
        where: { tenantId },
        transaction
      });
      const activeRefs = new Set(activeTxns.map(t => t.get('referenceId')).filter(Boolean));

      if (activeRefs.size > 0) {
        await CashTransaction.destroy({
          where: {
            tenantId: 'default-tenant',
            referenceId: Array.from(activeRefs)
          },
          transaction
        }).catch(() => {});
      }
    }

    const txs = await CashTransaction.findAll({
      where: { cashAccountId: cId },
      order: [['id', 'ASC']],
      transaction
    });

    const seen = new Set<string>();
    const toDeleteIds: number[] = [];

    const payoutAmounts = new Set<number>();
    for (const t of txs) {
      if (t.get('source') === 'PAYMENT_OUT') {
        payoutAmounts.add(round2(t.get('amount')));
      }
    }

    for (const t of txs) {
      const ref = t.get('referenceId');
      const type = t.get('type');
      const source = t.get('source');
      const amount = round2(t.get('amount'));
      const tTenant = t.get('tenantId') || tenantId || 'default-tenant';
      const key = ref ? `${tTenant}-${ref}-${type}` : `sig-${tTenant}-${source}-${amount}-${t.get('description')}`;

      if (source === 'PURCHASE_BILL' && payoutAmounts.has(amount)) {
        toDeleteIds.push(t.get('id') as number);
      } else if (seen.has(key)) {
        toDeleteIds.push(t.get('id') as number);
      } else {
        seen.add(key);
      }
    }

    if (toDeleteIds.length > 0) {
      await CashTransaction.destroy({
        where: { id: toDeleteIds },
        transaction
      });
    }
  } catch (err) {
    console.error('Error deduplicating cash transactions:', err);
  }
}

// GET /api/v1/cash/balance - Derived cash balance (Opening + IN - OUT)
cashRouter.get('/balance', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;
    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'tenantId parameter is required' });
    }
    const tId = String(tenantId);

    if (isDbConnected()) {
      const cashAcc = await getOrCreateCashAccount(tId);
      const cId = cashAcc.get('id') as number;
      await deduplicateCashTransactions(cId, tId);
      const openingBal = round2(cashAcc.get('openingBalance') || 0);

      const inSum = (await CashTransaction.sum('amount', {
        where: { cashAccountId: cId, type: 'IN' }
      })) || 0;

      const outSum = (await CashTransaction.sum('amount', {
        where: { cashAccountId: cId, type: 'OUT' }
      })) || 0;

      const totalIn = round2(inSum);
      const totalOut = round2(outSum);
      const currentBalance = round2(openingBal + totalIn - totalOut);

      return res.json({
        success: true,
        data: {
          accountId: cId,
          name: cashAcc.get('name'),
          openingBalance: openingBal,
          totalIn,
          totalOut,
          currentBalance
        }
      });
    }

    return res.json({
      success: true,
      data: { accountId: 1, name: 'Main Cash Drawer', openingBalance: 0, totalIn: 0, totalOut: 0, currentBalance: 0 }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/cash/transactions - Paginated transaction history with running balances
cashRouter.get('/transactions', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;
    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'tenantId parameter is required' });
    }
    const tId = String(tenantId);
    const { type, source, startDate, endDate, search, page = '1', limit = '50' } = req.query;

    if (isDbConnected()) {
      const cashAcc = await getOrCreateCashAccount(tId);
      const cId = cashAcc.get('id') as number;
      await deduplicateCashTransactions(cId, tId);
      const openingBal = round2(cashAcc.get('openingBalance') || 0);

      const whereClause: any = { cashAccountId: cId };
      if (type && (type === 'IN' || type === 'OUT')) {
        whereClause.type = type;
      }
      if (source && String(source).trim()) {
        whereClause.source = String(source).trim();
      }
      if (startDate && endDate) {
        whereClause.transactionDate = {
          [Op.between]: [new Date(String(startDate)), new Date(String(endDate))]
        };
      }
      if (search && String(search).trim()) {
        whereClause[Op.or] = [
          { description: { [Op.iLike]: `%${search}%` } },
          { referenceId: { [Op.iLike]: `%${search}%` } },
          { source: { [Op.iLike]: `%${search}%` } }
        ];
      }

      // Fetch all transactions sorted ASC to calculate correct running balances
      const allTxns = await CashTransaction.findAll({
        where: { cashAccountId: cId },
        order: [['transactionDate', 'ASC'], ['id', 'ASC']]
      });

      let balanceTracker = openingBal;
      let totalIn = 0;
      let totalOut = 0;

      const txnsWithRunningBal = allTxns.map((t: any) => {
        const amt = round2(t.get('amount'));
        const tType = t.get('type');
        if (tType === 'IN') {
          balanceTracker = round2(balanceTracker + amt);
          totalIn = round2(totalIn + amt);
        } else {
          balanceTracker = round2(balanceTracker - amt);
          totalOut = round2(totalOut + amt);
        }
        return {
          id: t.get('id'),
          cashAccountId: t.get('cashAccountId'),
          tenantId: t.get('tenantId'),
          type: tType,
          amount: amt,
          source: t.get('source'),
          referenceId: t.get('referenceId'),
          description: t.get('description'),
          transactionDate: t.get('transactionDate'),
          createdAt: t.get('createdAt'),
          runningBalance: balanceTracker
        };
      });

      // Reverse array so latest transactions appear first in UI
      const sortedLatestFirst = [...txnsWithRunningBal].reverse();

      // Apply filtering to processed list
      const filtered = sortedLatestFirst.filter(t => {
        if (type && type !== 'ALL' && t.type !== type) return false;
        if (source && source !== 'ALL' && t.source !== source) return false;
        if (startDate && endDate) {
          const txTime = new Date(t.transactionDate || t.createdAt || 0).getTime();
          const sTime = new Date(String(startDate)).getTime();
          const eTime = new Date(String(endDate)).setHours(23, 59, 59, 999);
          if (isNaN(sTime) || isNaN(eTime) || txTime < sTime || txTime > eTime) return false;
        }
        if (search && String(search).trim()) {
          const s = String(search).toLowerCase();
          const matchesDesc = (t.description || '').toLowerCase().includes(s);
          const matchesRef = (t.referenceId || '').toLowerCase().includes(s);
          const matchesSource = (t.source || '').toLowerCase().includes(s);
          if (!matchesDesc && !matchesRef && !matchesSource) return false;
        }
        return true;
      });

      const isUnpaginated = limit === 'all' || limit === '0' || req.query.limit === undefined;
      const p = Math.max(1, parseInt(String(page), 10));
      const l = Math.max(1, parseInt(String(limit), 10));
      const startIndex = (p - 1) * l;
      const paginated = isUnpaginated ? filtered : filtered.slice(startIndex, startIndex + l);

      return res.json({
        success: true,
        count: filtered.length,
        data: {
          transactions: paginated,
          openingBalance: openingBal,
          currentBalance: balanceTracker,
          totalIn,
          totalOut,
          page: p,
          totalPages: Math.ceil(filtered.length / l) || 1
        }
      });
    }

    return res.json({
      success: true,
      count: 0,
      data: { transactions: [], openingBalance: 0, currentBalance: 0, totalIn: 0, totalOut: 0, page: 1, totalPages: 1 }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/cash/entry - Record Cash In / Cash Out transaction
cashRouter.post('/entry', async (req: Request, res: Response) => {
  try {
    const {
      tenantId,
      cashAccountId,
      type,
      amount,
      source = 'MANUAL_ADJUSTMENT',
      referenceId,
      description,
      transactionDate = new Date().toISOString()
    } = req.body;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'tenantId parameter is required' });
    }

    const safeAmt = round2(amount);
    if (safeAmt <= 0) {
      return res.status(400).json({ success: false, error: 'Transaction amount must be greater than 0' });
    }
    if (type !== 'IN' && type !== 'OUT') {
      return res.status(400).json({ success: false, error: 'Transaction type must be IN or OUT' });
    }

    if (isDbConnected()) {
      const t = await sequelize.transaction();
      try {
        const cashAcc = await getOrCreateCashAccount(tenantId, t);
        const cId = cashAcc.get('id') as number;

        let existingTx = referenceId ? await CashTransaction.findOne({
          where: { referenceId, tenantId },
          transaction: t
        }) : null;

        if (existingTx) {
          await existingTx.update({
            cashAccountId: cId,
            tenantId,
            type,
            amount: safeAmt,
            source,
            description: description || `Cash ${type === 'IN' ? 'Inflow' : 'Outflow'} Entry`,
            transactionDate
          }, { transaction: t });
          await t.commit();
          return res.status(200).json({ success: true, data: existingTx });
        }

        const newTx = await CashTransaction.create(
          {
            cashAccountId: cId,
            tenantId,
            type,
            amount: safeAmt,
            source,
            referenceId: referenceId || `TXN-${Date.now()}`,
            description: description || `Cash ${type === 'IN' ? 'Inflow' : 'Outflow'} Entry`,
            transactionDate
          },
          { transaction: t }
        );

        await t.commit();
        return res.status(201).json({ success: true, data: newTx });
      } catch (err: any) {
        await t.rollback();
        throw err;
      }
    }

    return res.status(201).json({ success: true, data: req.body });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/cash/transfer-to-bank - Deposit Cash into Bank
cashRouter.post('/transfer-to-bank', async (req: Request, res: Response) => {
  try {
    const { tenantId = 'default-tenant', cashAccountId, amount, description, date = new Date().toISOString() } = req.body;
    const safeAmt = round2(amount);

    if (safeAmt <= 0) {
      return res.status(400).json({ success: false, error: 'Transfer amount must be greater than 0' });
    }

    if (isDbConnected()) {
      const t = await sequelize.transaction();
      try {
        let cashAcc = cashAccountId ? await CashAccount.findByPk(cashAccountId, { transaction: t }) : null;
        if (!cashAcc) {
          cashAcc = await getOrCreateCashAccount(tenantId, t);
        }
        const cId = cashAcc.get('id') as number;

        const refId = `DEP-${Date.now().toString().slice(-6)}`;
        const txDesc = description || `Cash deposit from Main Cash Drawer to Bank Account`;

        const cashTx = await CashTransaction.create(
          {
            cashAccountId: cId,
            tenantId,
            type: 'OUT',
            amount: safeAmt,
            source: 'BANK_DEPOSIT',
            referenceId: refId,
            description: txDesc,
            transactionDate: date
          },
          { transaction: t }
        );

        // Update Ledger Accounts in PostgreSQL (Debit Bank 1020, Credit Cash 1010)
        const cashAccountLedger = await LedgerAccount.findOne({ where: { accountCode: '1010' }, transaction: t });
        if (cashAccountLedger) {
          const cur = round2(cashAccountLedger.get('balance') || 0);
          await cashAccountLedger.update({ balance: round2(cur - safeAmt) }, { transaction: t });
        }

        const bankAccountLedger = await LedgerAccount.findOne({ where: { accountCode: '1020' }, transaction: t });
        if (bankAccountLedger) {
          const cur = round2(bankAccountLedger.get('balance') || 0);
          await bankAccountLedger.update({ balance: round2(cur + safeAmt) }, { transaction: t });
        }

        const validDateStr = (date && typeof date === 'string' ? date : new Date().toISOString()).split('T')[0];

        await JournalEntry.create(
          {
            tenantId,
            entryNumber: `JE-DEP-${Date.now().toString().slice(-4)}`,
            referenceId: refId,
            transactionDate: validDateStr,
            description: txDesc,
            totalDebit: safeAmt,
            totalCredit: safeAmt
          },
          { transaction: t }
        );

        await t.commit();
        return res.status(201).json({ success: true, message: 'Cash successfully deposited into bank account', data: cashTx });
      } catch (err: any) {
        await t.rollback();
        throw err;
      }
    }

    return res.status(201).json({ success: true, message: 'Cash transfer recorded' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/cash/transfer-from-bank - Withdraw Cash from Bank to Drawer
cashRouter.post('/transfer-from-bank', async (req: Request, res: Response) => {
  try {
    const { tenantId = 'default-tenant', cashAccountId, amount, description, date = new Date().toISOString() } = req.body;
    const safeAmt = round2(amount);

    if (safeAmt <= 0) {
      return res.status(400).json({ success: false, error: 'Transfer amount must be greater than 0' });
    }

    if (isDbConnected()) {
      const t = await sequelize.transaction();
      try {
        let cashAcc = cashAccountId ? await CashAccount.findByPk(cashAccountId, { transaction: t }) : null;
        if (!cashAcc) {
          cashAcc = await getOrCreateCashAccount(tenantId, t);
        }
        const cId = cashAcc.get('id') as number;

        const refId = `WTH-${Date.now().toString().slice(-6)}`;
        const txDesc = description || `Cash withdrawal from Bank Account to Main Cash Drawer`;

        const cashTx = await CashTransaction.create(
          {
            cashAccountId: cId,
            tenantId,
            type: 'IN',
            amount: safeAmt,
            source: 'BANK_WITHDRAWAL',
            referenceId: refId,
            description: txDesc,
            transactionDate: date
          },
          { transaction: t }
        );

        // Update Ledger Accounts in PostgreSQL (Debit Cash 1010, Credit Bank 1020)
        const cashAccountLedger = await LedgerAccount.findOne({ where: { accountCode: '1010' }, transaction: t });
        if (cashAccountLedger) {
          const cur = round2(cashAccountLedger.get('balance') || 0);
          await cashAccountLedger.update({ balance: round2(cur + safeAmt) }, { transaction: t });
        }

        const bankAccountLedger = await LedgerAccount.findOne({ where: { accountCode: '1020' }, transaction: t });
        if (bankAccountLedger) {
          const cur = round2(bankAccountLedger.get('balance') || 0);
          await bankAccountLedger.update({ balance: round2(cur - safeAmt) }, { transaction: t });
        }

        const validDateStr = (date && typeof date === 'string' ? date : new Date().toISOString()).split('T')[0];

        await JournalEntry.create(
          {
            tenantId,
            entryNumber: `JE-WTH-${Date.now().toString().slice(-4)}`,
            referenceId: refId,
            transactionDate: validDateStr,
            description: txDesc,
            totalDebit: safeAmt,
            totalCredit: safeAmt
          },
          { transaction: t }
        );

        await t.commit();
        return res.status(201).json({ success: true, message: 'Cash successfully withdrawn from bank into cash drawer', data: cashTx });
      } catch (err: any) {
        await t.rollback();
        throw err;
      }
    }

    return res.status(201).json({ success: true, message: 'Cash withdrawal recorded' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/cash/adjust - Physical cash reconciliation adjustment
cashRouter.post('/adjust', async (req: Request, res: Response) => {
  try {
    const { tenantId = 'default-tenant', cashAccountId, physicalCount, reason = '', date = new Date().toISOString() } = req.body;
    const safePhysical = Math.max(0, round2(physicalCount));

    if (isDbConnected()) {
      const t = await sequelize.transaction();
      try {
        let cashAcc = cashAccountId ? await CashAccount.findByPk(cashAccountId, { transaction: t }) : null;
        if (!cashAcc) {
          cashAcc = await getOrCreateCashAccount(tenantId, t);
        }
        const cId = cashAcc.get('id') as number;

        const openingBal = round2(cashAcc.get('openingBalance') || 0);
        const inSum = (await CashTransaction.sum('amount', { where: { cashAccountId: cId, type: 'IN' }, transaction: t })) || 0;
        const outSum = (await CashTransaction.sum('amount', { where: { cashAccountId: cId, type: 'OUT' }, transaction: t })) || 0;
        const currentBal = round2(openingBal + inSum - outSum);

        const discrepancy = round2(safePhysical - currentBal);
        if (Math.abs(discrepancy) < 0.01) {
          await t.commit();
          return res.json({ success: true, message: 'Physical cash matches system balance exactly. No adjustment needed.' });
        }

        const isGain = discrepancy > 0;
        const adjAmount = Math.abs(discrepancy);
        const refId = `ADJ-${Date.now().toString().slice(-6)}`;
        const desc = `Physical Cash Reconciliation: ${isGain ? 'Excess Cash Gain' : 'Cash Shortage Deficit'} of Rs ${adjAmount.toFixed(2)}. ${reason ? `Note: ${reason}` : ''}`;

        const adjTx = await CashTransaction.create(
          {
            cashAccountId: cId,
            tenantId,
            type: isGain ? 'IN' : 'OUT',
            amount: adjAmount,
            source: 'MANUAL_ADJUSTMENT',
            referenceId: refId,
            description: desc,
            transactionDate: date
          },
          { transaction: t }
        );

        await t.commit();
        return res.status(201).json({
          success: true,
          message: `Physical cash reconciled. Adjusted ${isGain ? '+' : '-'}Rs ${adjAmount.toFixed(2)}`,
          data: {
            adjustment: adjTx,
            previousBalance: currentBal,
            physicalCount: safePhysical,
            discrepancy
          }
        });
      } catch (err: any) {
        await t.rollback();
        throw err;
      }
    }

    return res.status(201).json({ success: true, message: 'Reconciliation adjustment recorded' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
