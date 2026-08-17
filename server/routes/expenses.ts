import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { Expense, JournalEntry, isDbConnected, sequelize } from '../db/sequelize.js';

export const expensesRouter = Router();

// GET /api/v1/expenses - Fetch all operational expenses for tenant
expensesRouter.get('/', async (req: Request, res: Response) => {
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
      const expensesList = await Expense.findAll({
        where: whereClause,
        order: [['id', 'DESC']]
      });

      if (tId !== 'default-tenant' && expensesList.length > 0) {
        for (const exp of expensesList) {
          if (!exp.get('tenantId') || exp.get('tenantId') === 'default-tenant') {
            await exp.update({ tenantId: tId }).catch(() => {});
          }
        }
      }

      return res.json({ success: true, data: expensesList });
    }

    return res.json({ success: true, data: [] });
  } catch (err: any) {
    console.error('Error fetching expenses:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/expenses - Record new operational expense in PostgreSQL & log journal entry
expensesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      tenantId = 'default-tenant',
      expenseNumber,
      categoryName = 'Miscellaneous',
      expenseDate,
      paymentMode = 'CASH',
      amount = 0,
      notes = ''
    } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, error: 'Valid expense amount is required' });
    }

    if (isDbConnected()) {
      const expNum = expenseNumber || `EXP-${Date.now().toString().slice(-6)}`;

      const t = await sequelize.transaction();
      try {
        const newExpense = await Expense.create({
          expenseNumber: expNum,
          tenantId,
          categoryName,
          expenseDate: expenseDate || new Date().toISOString().split('T')[0],
          paymentMode,
          amount: Number(amount),
          notes
        }, { transaction: t });

        // Post Journal Entry in PostgreSQL
        await JournalEntry.create({
          tenantId,
          entryNumber: `JE-EXP-${Date.now().toString().slice(-4)}`,
          referenceId: expNum,
          transactionDate: expenseDate || new Date().toISOString().split('T')[0],
          description: `Operating Expense (${categoryName}): ${notes || 'Voucher ' + expNum}`,
          totalDebit: Number(amount),
          totalCredit: Number(amount)
        }, { transaction: t });

        await t.commit();

        return res.status(201).json({
          success: true,
          message: 'Expense recorded in PostgreSQL database',
          data: newExpense
        });
      } catch (err: any) {
        await t.rollback();
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    return res.status(201).json({ success: true, data: req.body });
  } catch (err: any) {
    console.error('Error creating expense:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/expenses/:id - Delete expense record
expensesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (isDbConnected()) {
      await Expense.destroy({ where: { id } });
      return res.json({ success: true, message: 'Expense record deleted' });
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting expense:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
