import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { Invoice, InvoiceItem, Item, Party, JournalEntry, CashAccount, CashTransaction, isDbConnected, sequelize } from '../db/sequelize.js';

export const invoicesRouter = Router();

// GET /api/v1/invoices - Fetch invoices with line items using Sequelize
invoicesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;
    if (isDbConnected()) {
      const tId = tenantId ? String(tenantId) : 'default-tenant';
      const invoices = await Invoice.findAll({
        where: { tenantId: tId },
        include: [{ model: InvoiceItem, as: 'items' }],
        order: [['id', 'DESC']]
      });

      return res.json({ success: true, count: invoices.length, data: invoices });
    }
    return res.json({ success: true, count: 0, data: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/invoices - Create sales invoice transaction using Sequelize
invoicesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      tenantId = 'default-tenant',
      invoiceNumber = `INV-${Date.now().toString().slice(-4)}`,
      invoiceDate = new Date().toISOString().split('T')[0],
      partyId,
      partyName = 'Walk-in Retail Customer',
      partyPhone = '',
      partyGstin = '',
      items = [],
      receivedAmount = 0,
      paymentMethod = 'CASH'
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Invoice must contain at least 1 line item' });
    }

    // Helper currency rounding
    const round2 = (val: any) => {
      const n = Number(val);
      return isNaN(n) || !isFinite(n) ? 0 : Math.round((n + Number.EPSILON) * 100) / 100;
    };

    // Server-Side Calculations with Edge Case Protection
    let rawSubtotal = 0;
    let rawTaxTotal = 0;
    const formattedLineItems = [];

    for (const line of items) {
      const qty = Math.max(0.001, round2(line.quantity) || 1);
      const price = Math.max(0, round2(line.unitPrice));
      const cgst = Math.max(0, round2(line.cgstRate));
      const sgst = Math.max(0, round2(line.sgstRate));
      const lineSub = round2(qty * price);
      const lineTax = round2((lineSub * (cgst + sgst)) / 100);
      const lineTotal = round2(lineSub + lineTax);

      rawSubtotal += lineSub;
      rawTaxTotal += lineTax;

      formattedLineItems.push({
        itemId: line.itemId,
        itemName: line.itemName || 'Product Item',
        hsnSacCode: line.hsnSacCode || '1000',
        unitType: line.unitType || 'PCS',
        quantity: qty,
        unitPrice: price,
        purchasePrice: round2(line.purchasePrice),
        taxAmount: lineTax,
        totalAmount: lineTotal
      });
    }

    const subtotal = round2(rawSubtotal);
    const taxTotal = round2(rawTaxTotal);
    const grandTotal = round2(subtotal + taxTotal);
    const safeReceivedAmount = Math.max(0, Math.min(grandTotal, round2(receivedAmount)));
    const dueAmount = round2(Math.max(0, grandTotal - safeReceivedAmount));
    const paymentStatus = dueAmount === 0 ? 'PAID' : safeReceivedAmount > 0 ? 'PARTIAL' : 'UNPAID';
    const invoiceId = `INV-TXN-${Date.now()}`;

    if (isDbConnected()) {
      const t = await sequelize.transaction();
      try {
        // Verify partyId foreign key in PostgreSQL
        let validPartyId: number | null = null;
        if (partyId && typeof partyId === 'number') {
          const partyExists = await Party.findByPk(partyId, { transaction: t });
          if (partyExists) validPartyId = partyId;
        }

        // 1. Create Invoice Header in PostgreSQL
        const newInvoice = await Invoice.create(
          {
            invoiceId,
            tenantId,
            invoiceNumber,
            invoiceDate,
            partyId: validPartyId,
            partyName,
            partyPhone,
            partyGstin,
            subtotal,
            taxTotal,
            discountTotal: 0,
            grandTotal,
            receivedAmount: Number(receivedAmount),
            dueAmount,
            paymentStatus,
            paymentMethod
          },
          { transaction: t }
        );

        // 2. Create Invoice Line Items
        for (const line of formattedLineItems) {
          let validItemId: number | null = null;
          if (line.itemId && typeof line.itemId === 'number') {
            const itemExists = await Item.findByPk(line.itemId, { transaction: t });
            if (itemExists) validItemId = line.itemId;
          }
          if (!validItemId && line.itemName) {
            const itemByName = await Item.findOne({ where: { name: line.itemName }, transaction: t });
            if (itemByName) validItemId = itemByName.id;
          }

          await InvoiceItem.create(
            {
              invoiceId: (newInvoice as any).id,
              itemId: validItemId,
              itemName: line.itemName,
              hsnSacCode: line.hsnSacCode,
              unitType: line.unitType,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              purchasePrice: line.purchasePrice,
              taxAmount: line.taxAmount,
              totalAmount: line.totalAmount
            },
            { transaction: t }
          );

          // 3. Decrement Product Stock Level in PostgreSQL
          if (line.itemId || line.itemName) {
            let dbItem = (line.itemId && typeof line.itemId === 'number') ? await Item.findByPk(line.itemId, { transaction: t }) : null;
            if (!dbItem && line.itemName) {
              dbItem = await Item.findOne({ where: { name: line.itemName }, transaction: t });
            }
            if (dbItem) {
              const curStock = (dbItem.get('currentStock') as number) || 0;
              await dbItem.update({ currentStock: Math.max(0, curStock - line.quantity) }, { transaction: t });
            }
          }
        }

        // 4. Update Party Balance if Sale has Unpaid Dues
        if (dueAmount > 0) {
          let party = (partyId && typeof partyId === 'number') ? await Party.findByPk(partyId, { transaction: t }) : null;
          if (!party && partyName && partyName !== 'Walk-in Retail Customer') {
            party = await Party.findOne({ where: { name: partyName }, transaction: t });
          }
          if (party) {
            const curBal = (party.get('currentBalance') as number) || 0;
            await party.update({ currentBalance: curBal + dueAmount }, { transaction: t });
          }
        }

        // 5. Post Journal Entry
        await JournalEntry.create(
          {
            tenantId,
            entryNumber: `JE-SAL-${Date.now().toString().slice(-4)}`,
            referenceId: invoiceNumber,
            transactionDate: invoiceDate,
            description: `Sales Invoice ${invoiceNumber} to ${partyName}`,
            totalDebit: grandTotal,
            totalCredit: grandTotal
          },
          { transaction: t }
        );

        // 6. Post Cash Inflow Entry if Cash Payment Received
        if (paymentMethod === 'CASH' && safeReceivedAmount > 0) {
          let cAccount = await CashAccount.findOne({ where: { tenantId }, transaction: t });
          if (!cAccount) {
            cAccount = await CashAccount.create({ tenantId, name: 'Main Cash Drawer', openingBalance: 0 }, { transaction: t });
          }
          await CashTransaction.create(
            {
              cashAccountId: (cAccount as any).id,
              tenantId,
              type: 'IN',
              amount: safeReceivedAmount,
              source: 'POS_SALE',
              referenceId: invoiceNumber,
              description: `Cash payment received for Sales Invoice ${invoiceNumber} (${partyName})`,
              transactionDate: invoiceDate
            },
            { transaction: t }
          );
        }

        await t.commit();

        return res.status(201).json({
          success: true,
          message: 'Sales invoice saved to PostgreSQL via Sequelize.',
          data: {
            id: (newInvoice as any).id,
            invoiceNumber,
            grandTotal,
            dueAmount,
            paymentStatus
          }
        });
      } catch (err: any) {
        await t.rollback();
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    return res.status(201).json({ success: true, data: req.body });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
