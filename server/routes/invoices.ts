import { Router, Request, Response } from 'express';
import { Invoice, InvoiceItem, Item, Party, JournalEntry, isDbConnected, sequelize } from '../db/sequelize.js';

export const invoicesRouter = Router();

// GET /api/v1/invoices - Fetch invoices with line items using Sequelize
invoicesRouter.get('/', async (req: Request, res: Response) => {
  try {
    if (isDbConnected()) {
      const invoices = await Invoice.findAll({
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

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Invoice must contain at least 1 line item' });
    }

    // Server-Side Calculations
    let subtotal = 0;
    let taxTotal = 0;
    const formattedLineItems = items.map((line: any) => {
      const qty = Number(line.quantity) || 1;
      const price = Number(line.unitPrice) || 0;
      const cgst = Number(line.cgstRate) || 0;
      const sgst = Number(line.sgstRate) || 0;
      const lineSub = qty * price;
      const lineTax = (lineSub * (cgst + sgst)) / 100;
      const lineTotal = lineSub + lineTax;

      subtotal += lineSub;
      taxTotal += lineTax;

      return {
        itemId: line.itemId,
        itemName: line.itemName || 'Product Item',
        hsnSacCode: line.hsnSacCode || '1000',
        unitType: line.unitType || 'PCS',
        quantity: qty,
        unitPrice: price,
        purchasePrice: Number(line.purchasePrice) || 0,
        taxAmount: lineTax,
        totalAmount: lineTotal
      };
    });

    const grandTotal = subtotal + taxTotal;
    const dueAmount = Math.max(0, grandTotal - Number(receivedAmount));
    const paymentStatus = dueAmount === 0 ? 'PAID' : receivedAmount > 0 ? 'PARTIAL' : 'UNPAID';
    const invoiceId = `INV-TXN-${Date.now()}`;

    if (isDbConnected()) {
      const t = await sequelize.transaction();
      try {
        // 1. Create Invoice Header in PostgreSQL
        const newInvoice = await Invoice.create(
          {
            invoiceId,
            tenantId,
            invoiceNumber,
            invoiceDate,
            partyId,
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
          await InvoiceItem.create(
            {
              invoiceId: (newInvoice as any).id,
              ...line
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
