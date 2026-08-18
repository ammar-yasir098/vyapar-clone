import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { PaymentIn, PaymentOut, Party, CashAccount, CashTransaction, isDbConnected } from '../db/sequelize.js';

export const paymentsRouter = Router();

// GET /api/v1/payments/in - Fetch all Payment-In receipts for tenant
paymentsRouter.get('/in', async (req: Request, res: Response) => {
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
      const payments = await PaymentIn.findAll({
        where: whereClause,
        order: [['id', 'DESC']]
      });

      if (tId !== 'default-tenant' && payments.length > 0) {
        for (const p of payments) {
          if (!p.get('tenantId') || p.get('tenantId') === 'default-tenant') {
            await p.update({ tenantId: tId }).catch(() => {});
          }
        }
      }

      return res.json({ success: true, data: payments });
    }

    return res.json({ success: true, data: [] });
  } catch (err: any) {
    console.error('Error fetching Payment-In receipts:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/payments/in - Create new Payment-In receipt
paymentsRouter.post('/in', async (req: Request, res: Response) => {
  try {
    const {
      tenantId = 'default-tenant',
      receiptNumber,
      partyId,
      partyName,
      partyPhone,
      paymentDate,
      paymentMethod = 'CASH',
      amount = 0,
      notes = ''
    } = req.body;

    if (isDbConnected()) {
      const recNum = receiptNumber || `PAYIN-${Date.now()}`;

      const newPayment = await PaymentIn.create({
        receiptNumber: recNum,
        tenantId,
        partyId: partyId || null,
        partyName: partyName || 'Walk-in Customer',
        partyPhone: partyPhone || '',
        paymentDate: paymentDate || new Date().toISOString().split('T')[0],
        paymentMethod,
        amount,
        notes
      });

      // Update party balance in PostgreSQL
      if (partyId) {
        const party = await Party.findByPk(partyId);
        if (party) {
          const curBal = Number(party.get('currentBalance')) || 0;
          const newBal = Math.max(0, curBal - Number(amount));
          await party.update({ currentBalance: newBal });
        }
      }

      // Post Cash Inflow Entry if Payment-In is in CASH
      if (paymentMethod === 'CASH' && Number(amount) > 0) {
        let cAccount = await CashAccount.findOne({ where: { tenantId } });
        if (!cAccount) {
          cAccount = await CashAccount.create({ tenantId, name: 'Main Cash Drawer', openingBalance: 0 });
        }
        await CashTransaction.create({
          cashAccountId: (cAccount as any).id,
          tenantId,
          type: 'IN',
          amount: Number(amount),
          source: 'PAYMENT_IN',
          referenceId: recNum,
          description: `Payment-In received from ${partyName || 'Customer'}: ${notes || 'Cash Receipt'}`,
          transactionDate: paymentDate || new Date().toISOString()
        });
      }

      return res.status(201).json({
        success: true,
        message: 'Payment-In recorded in PostgreSQL',
        data: newPayment
      });
    }

    return res.status(201).json({ success: true, data: req.body });
  } catch (err: any) {
    console.error('Error creating Payment-In:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/payments/in/:id - Delete Payment-In receipt
paymentsRouter.delete('/in/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (isDbConnected()) {
      await PaymentIn.destroy({ where: { id } });
      return res.json({ success: true, message: 'Payment-In receipt deleted' });
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting Payment-In:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/payments/out - Fetch all Payment-Out vouchers for tenant
paymentsRouter.get('/out', async (req: Request, res: Response) => {
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
      const payments = await PaymentOut.findAll({
        where: whereClause,
        order: [['id', 'DESC']]
      });

      if (tId !== 'default-tenant' && payments.length > 0) {
        for (const p of payments) {
          if (!p.get('tenantId') || p.get('tenantId') === 'default-tenant') {
            await p.update({ tenantId: tId }).catch(() => {});
          }
        }
      }

      return res.json({ success: true, data: payments });
    }

    return res.json({ success: true, data: [] });
  } catch (err: any) {
    console.error('Error fetching Payment-Out vouchers:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/payments/out - Create new Payment-Out voucher
paymentsRouter.post('/out', async (req: Request, res: Response) => {
  try {
    const {
      tenantId = 'default-tenant',
      receiptNumber,
      partyId,
      partyName,
      partyPhone,
      paymentDate,
      paymentMethod = 'CASH',
      amount = 0,
      notes = ''
    } = req.body;

    if (isDbConnected()) {
      const recNum = receiptNumber || `PAYOUT-${Date.now()}`;

      const newPayment = await PaymentOut.create({
        receiptNumber: recNum,
        tenantId,
        partyId: partyId || null,
        partyName: partyName || 'Supplier',
        partyPhone: partyPhone || '',
        paymentDate: paymentDate || new Date().toISOString().split('T')[0],
        paymentMethod,
        amount,
        notes
      });

      // Reduce supplier payable balance in PostgreSQL
      if (partyId) {
        const party = await Party.findByPk(partyId);
        if (party) {
          const curBal = Number(party.get('currentBalance')) || 0;
          const newBal = Math.max(0, curBal - Number(amount));
          await party.update({ currentBalance: newBal });
        }
      }

      // Post Cash Outflow Entry if Payment-Out is in CASH
      if (paymentMethod === 'CASH' && Number(amount) > 0) {
        let cAccount = await CashAccount.findOne({ where: { tenantId } });
        if (!cAccount) {
          cAccount = await CashAccount.create({ tenantId, name: 'Main Cash Drawer', openingBalance: 0 });
        }
        await CashTransaction.create({
          cashAccountId: (cAccount as any).id,
          tenantId,
          type: 'OUT',
          amount: Number(amount),
          source: 'PAYMENT_OUT',
          referenceId: recNum,
          description: `Payment-Out paid to ${partyName || 'Supplier'}: ${notes || 'Cash Voucher'}`,
          transactionDate: paymentDate || new Date().toISOString()
        });
      }

      return res.status(201).json({
        success: true,
        message: 'Payment-Out recorded in PostgreSQL',
        data: newPayment
      });
    }

    return res.status(201).json({ success: true, data: req.body });
  } catch (err: any) {
    console.error('Error creating Payment-Out:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/payments/out/:id - Delete Payment-Out voucher
paymentsRouter.delete('/out/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (isDbConnected()) {
      await PaymentOut.destroy({ where: { id } });
      return res.json({ success: true, message: 'Payment-Out voucher deleted' });
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting Payment-Out:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

