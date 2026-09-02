import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { PaymentIn, PaymentOut, Party, Invoice, CashAccount, CashTransaction, isDbConnected, sequelize } from '../db/sequelize.js';

export const paymentsRouter = Router();

// GET /api/v1/payments/in - Fetch all Payment-In receipts for tenant
paymentsRouter.get('/in', async (req: Request, res: Response) => {
  try {
    const { tenantId = 'default-tenant' } = req.query;

    if (isDbConnected()) {
      const tId = String(tenantId);
      const payments = await PaymentIn.findAll({
        where: { tenantId: tId },
        order: [['id', 'DESC']]
      });

      return res.json({ success: true, data: payments });
    }

    return res.json({ success: true, data: [] });
  } catch (err: any) {
    console.error('Error fetching Payment-In receipts:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/payments/in - Create new Payment-In receipt with automatic invoice reconciliation
paymentsRouter.post('/in', async (req: Request, res: Response) => {
  try {
    const {
      tenantId: rawTenantId,
      receiptNumber,
      partyId,
      partyName,
      partyPhone,
      paymentDate,
      paymentMethod = 'CASH',
      amount = 0,
      notes = ''
    } = req.body;

    const tenantId = rawTenantId || (req as any).user?.tenantId || 'default-tenant';
    const numAmount = Number(amount) || 0;

    if (isDbConnected()) {
      const t = await sequelize.transaction();

      try {
        const recNum = receiptNumber || `PAYIN-${Date.now()}`;

        const newPayment = await PaymentIn.create({
          receiptNumber: recNum,
          tenantId,
          partyId: partyId ? String(partyId) : null,
          partyName: partyName || 'Walk-in Customer',
          partyPhone: partyPhone || '',
          paymentDate: paymentDate || new Date().toISOString().split('T')[0],
          paymentMethod,
          amount: numAmount,
          notes
        }, { transaction: t });

        // 1. Update party balance in PostgreSQL
        let party = partyId ? await Party.findByPk(String(partyId), { transaction: t }) : null;
        if (!party && partyName) {
          party = await Party.findOne({ where: { name: partyName, tenantId }, transaction: t })
            || await Party.findOne({ where: { name: partyName }, transaction: t });
        }
        if (party) {
          const curBal = Number(party.get('currentBalance')) || 0;
          const newBal = Math.max(0, curBal - numAmount);
          await party.update({ currentBalance: newBal }, { transaction: t });
        }

        // 2. Automatically apply payment towards unpaid invoices for this party (oldest first)
        if (numAmount > 0) {
          const partyCriteria: any[] = [];
          if (party && party.id) partyCriteria.push({ partyId: String(party.id) });
          if (partyId) partyCriteria.push({ partyId: String(partyId) });
          if (partyName) partyCriteria.push({ partyName });

          const whereClause: any = {
            tenantId,
            [Op.and]: [
              {
                [Op.or]: partyCriteria.length > 0 ? partyCriteria : [{ partyName: partyName || 'Customer' }]
              },
              {
                [Op.or]: [
                  { paymentStatus: { [Op.ne]: 'PAID' } },
                  { dueAmount: { [Op.gt]: 0 } }
                ]
              }
            ]
          };

          const unpaidInvoices = await Invoice.findAll({
            where: whereClause,
            order: [['invoiceDate', 'ASC'], ['id', 'ASC']],
            transaction: t
          });

          let remainingPay = numAmount;
          for (const inv of unpaidInvoices) {
            if (remainingPay <= 0) break;
            const currentDue = Number(inv.get('dueAmount')) !== undefined && Number(inv.get('dueAmount')) > 0
              ? Number(inv.get('dueAmount'))
              : Math.max(0, Number(inv.get('grandTotal')) - Number(inv.get('receivedAmount')));

            if (remainingPay >= currentDue) {
              remainingPay -= currentDue;
              await inv.update({
                receivedAmount: Number(inv.get('grandTotal')),
                dueAmount: 0,
                paymentStatus: 'PAID'
              }, { transaction: t });
            } else {
              const curRec = Number(inv.get('receivedAmount')) || 0;
              const newRec = curRec + remainingPay;
              const newDue = Math.max(0, currentDue - remainingPay);
              remainingPay = 0;
              await inv.update({
                receivedAmount: newRec,
                dueAmount: newDue,
                paymentStatus: newDue === 0 ? 'PAID' : 'PARTIAL'
              }, { transaction: t });
            }
          }
        }

        // 3. Post Cash Inflow Entry if Payment-In is in CASH
        if (paymentMethod === 'CASH' && numAmount > 0) {
          let cAccount = await CashAccount.findOne({ where: { tenantId }, transaction: t });
          if (!cAccount) {
            cAccount = await CashAccount.create({ tenantId, name: 'Main Cash Drawer', openingBalance: 0 }, { transaction: t });
          }
          await CashTransaction.create({
            cashAccountId: (cAccount as any).id,
            tenantId,
            type: 'IN',
            amount: numAmount,
            source: 'PAYMENT_IN',
            referenceId: recNum,
            description: `Payment-In received from ${partyName || 'Customer'}: ${notes || 'Cash Receipt'}`,
            transactionDate: paymentDate || new Date().toISOString()
          }, { transaction: t });
        }

        await t.commit();

        return res.status(201).json({
          success: true,
          message: 'Payment-In recorded in PostgreSQL and customer invoices reconciled.',
          data: newPayment
        });
      } catch (dbErr: any) {
        await t.rollback();
        console.error('Error in POST /payments/in transaction:', dbErr);
        return res.status(500).json({ success: false, error: dbErr.message });
      }
    }

    return res.status(201).json({ success: true, data: req.body });
  } catch (err: any) {
    console.error('Error recording Payment-In receipt:', err);
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
      const payments = await PaymentOut.findAll({
        where: { tenantId: tId },
        order: [['id', 'DESC']]
      });

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

