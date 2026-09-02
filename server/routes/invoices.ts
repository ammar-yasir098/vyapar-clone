import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { Invoice, InvoiceItem, Item, Party, CashAccount, CashTransaction, ItemLocationMapping, InventoryLocation, isDbConnected, sequelize } from '../db/sequelize.js';

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
      tenantId: rawTenantId,
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

    const tenantId = rawTenantId || (req as any).user?.tenantId || 'default-tenant';

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
    const isCredit = (paymentMethod || '').toUpperCase() === 'CREDIT';
    const safeReceivedAmount = isCredit ? 0 : Math.max(0, Math.min(grandTotal, round2(receivedAmount)));
    const dueAmount = isCredit ? grandTotal : round2(Math.max(0, grandTotal - safeReceivedAmount));
    const paymentStatus = isCredit ? 'UNPAID' : (dueAmount === 0 ? 'PAID' : safeReceivedAmount > 0 ? 'PARTIAL' : 'UNPAID');
    const invoiceId = `INV-TXN-${Date.now()}`;

    // Execute atomic PostgreSQL ACID transaction
    if (isDbConnected()) {
      const t = await sequelize.transaction();
      try {
        const validPartyId = partyId ? String(partyId) : null;

        // 1. Create Master Invoice Record
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
          let validItemId: string | null = null;
          if (line.itemId) {
            const itemExists = await Item.findByPk(String(line.itemId), { transaction: t });
            if (itemExists) validItemId = String(itemExists.id);
          }
          if (!validItemId && line.itemName) {
            const itemByName = await Item.findOne({ where: { name: line.itemName, tenantId }, transaction: t })
              || await Item.findOne({ where: { name: line.itemName }, transaction: t });
            if (itemByName) validItemId = String(itemByName.id);
          }

          await InvoiceItem.create(
            {
              invoiceId: String((newInvoice as any).id),
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

          // 3. Decrement Product Stock Level & Store Front Mapping in PostgreSQL
          if (line.itemId || line.itemName) {
            let dbItem = line.itemId ? await Item.findOne({ where: { id: String(line.itemId), tenantId }, transaction: t }) : null;
            if (!dbItem && line.itemName) {
              dbItem = await Item.findOne({ where: { name: line.itemName, tenantId }, transaction: t });
            }
            if (!dbItem && line.itemId) {
              dbItem = await Item.findByPk(String(line.itemId), { transaction: t });
            }
            if (dbItem) {
              const curStock = Number(dbItem.get('currentStock')) || 0;
              await dbItem.update({ currentStock: Math.max(0, curStock - line.quantity) }, { transaction: t });

              // Decrement Store Front location mapping
              const storeLoc = await InventoryLocation.findOne({
                where: { tenantId, code: 'STORE-FRONT' },
                transaction: t
              });

              if (storeLoc) {
                const storeMap = await ItemLocationMapping.findOne({
                  where: { tenantId, itemId: String(dbItem.id), locationId: String((storeLoc as any).id) },
                  transaction: t
                });
                if (storeMap) {
                  const currentLocQty = Number(storeMap.get('quantity')) || 0;
                  await storeMap.update({ quantity: Math.max(0, currentLocQty - line.quantity) }, { transaction: t });
                }
              }
            }
          }
        }

        // 4. Update Party Balance if Sale has Unpaid Dues
        if (dueAmount > 0) {
          let party = partyId ? await Party.findByPk(String(partyId), { transaction: t }) : null;
          if (!party && partyName && partyName !== 'Walk-in Retail Customer') {
            party = await Party.findOne({ where: { name: partyName, tenantId }, transaction: t })
              || await Party.findOne({ where: { name: partyName }, transaction: t });
          }
          if (party) {
            const curBal = Number(party.get('currentBalance')) || 0;
            await party.update({ currentBalance: curBal + dueAmount }, { transaction: t });
          }
        }

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

// PUT /api/v1/invoices/:id - Update invoice payment status and amounts
invoicesRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId = 'default-tenant', receivedAmount, dueAmount, paymentStatus } = req.body;

    if (isDbConnected()) {
      let inv = await Invoice.findOne({
        where: {
          tenantId,
          [Op.or]: [
            { id: String(id) },
            { invoiceNumber: String(id) },
            { invoiceId: String(id) }
          ]
        }
      });

      if (!inv) {
        inv = await Invoice.findByPk(String(id));
      }

      if (inv) {
        const updateData: any = {};
        if (receivedAmount !== undefined) updateData.receivedAmount = Number(receivedAmount);
        if (dueAmount !== undefined) updateData.dueAmount = Number(dueAmount);
        if (paymentStatus !== undefined) updateData.paymentStatus = String(paymentStatus);

        await inv.update(updateData);
        return res.json({ success: true, message: 'Invoice updated successfully', data: inv });
      }
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    return res.json({ success: true, data: req.body });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
