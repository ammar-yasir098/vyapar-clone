import { Router, Request, Response } from 'express';
import { Party, Invoice, isDbConnected } from '../db/sequelize.js';

export const partiesRouter = Router();

// GET /api/v1/parties - Fetch party accounts using Sequelize
partiesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { tenantId = 'default-tenant' } = req.query;
    if (isDbConnected()) {
      const tId = String(tenantId);
      let parties = await Party.findAll({ where: { tenantId: tId }, order: [['name', 'ASC']] });
      if (parties.length === 0) {
        const defaultWalkIn = await Party.create({
          tenantId: tId,
          name: 'Walk-in Retail Customer',
          phone: '03009999999',
          type: 'CUSTOMER',
          openingBalance: 0,
          balanceType: 'RECEIVABLE',
          currentBalance: 0
        });
        parties = [defaultWalkIn];
      }
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

    const cleanName = String(name || '').trim();
    const cleanPhone = String(phone || '').trim();
    const safeOpeningBal = Math.round((Number(openingBalance) || 0) * 100) / 100;

    if (!cleanName || !cleanPhone) {
      return res.status(400).json({ success: false, error: 'Party name and phone number are required' });
    }

    if (isDbConnected()) {
      const party = await Party.create({
        tenantId,
        name: cleanName,
        phone: cleanPhone,
        type,
        openingBalance: safeOpeningBal,
        balanceType,
        currentBalance: safeOpeningBal,
        gstin: String(gstin || '').trim(),
        address: String(address || '').trim()
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
    const { amount, remarks = '', partyType = 'CUSTOMER', partyName, tenantId = 'default-tenant' } = req.body;
    const paymentAmt = Math.round((Number(amount) || 0) * 100) / 100;

    if (paymentAmt <= 0) {
      return res.status(400).json({ success: false, error: 'Payment amount must be greater than 0' });
    }

    if (isDbConnected()) {
      let party = (id && !isNaN(Number(id))) ? await Party.findByPk(Number(id)) : null;
      if (!party && partyName) {
        party = await Party.findOne({ where: { name: partyName } });
      }
      if (party) {
        const cur = (party.get('currentBalance') as number) || 0;
        const newBal = cur - paymentAmt;
        await party.update({ currentBalance: newBal });

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
      await Invoice.update({ partyId: null }, { where: { partyId: Number(id) } });
      await Party.destroy({ where: { id: Number(id) } });
    }
    return res.json({ success: true, message: `Party ${id} deleted` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
