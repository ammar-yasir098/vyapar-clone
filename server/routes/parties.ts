import { Router, Request, Response } from 'express';
import { Party, JournalEntry, isDbConnected } from '../db/sequelize.js';

export const partiesRouter = Router();

// GET /api/v1/parties - Fetch party accounts using Sequelize
partiesRouter.get('/', async (req: Request, res: Response) => {
  try {
    if (isDbConnected()) {
      const parties = await Party.findAll({ order: [['name', 'ASC']] });
      return res.json({ success: true, count: parties.length, data: parties });
    }
    return res.json({ success: true, count: 0, data: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/parties - Create party using Sequelize
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
      const party = await Party.create({
        tenantId,
        name,
        phone,
        type,
        openingBalance,
        balanceType,
        currentBalance: openingBalance,
        gstin,
        address
      });
      return res.status(201).json({ success: true, data: party });
    }

    return res.status(201).json({ success: true, data: req.body });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/parties/:id/payment - Record payment using Sequelize
partiesRouter.post('/:id/payment', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, remarks = '', partyType = 'CUSTOMER', tenantId = 'default-tenant' } = req.body;
    const paymentAmt = Number(amount) || 0;

    if (isDbConnected()) {
      const party = await Party.findByPk(Number(id));
      if (party) {
        const cur = (party.get('currentBalance') as number) || 0;
        const newBal = Math.max(0, cur - paymentAmt);
        await party.update({ currentBalance: newBal });

        await JournalEntry.create({
          tenantId,
          entryNumber: `JE-PAY-${Date.now().toString().slice(-4)}`,
          referenceId: `PAY-${party.get('name')}`,
          transactionDate: new Date().toISOString().split('T')[0],
          description: `Payment ${partyType === 'CUSTOMER' ? 'Received from' : 'Made to'} ${party.get('name')}: ${remarks}`,
          totalDebit: paymentAmt,
          totalCredit: paymentAmt
        });

        return res.json({ success: true, data: party });
      }
    }
    return res.json({ success: true, data: { id, amount: paymentAmt } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/parties/:id - Delete party using Sequelize
partiesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (isDbConnected()) {
      await Party.destroy({ where: { id: Number(id) } });
    }
    return res.json({ success: true, message: `Party ${id} deleted` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
