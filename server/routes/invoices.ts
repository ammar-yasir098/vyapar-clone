import { Router, Request, Response } from 'express';
import { query, pool, isDbConnected } from '../db/postgres.js';

export const invoicesRouter = Router();

// GET /api/v1/invoices - Fetch sales invoice history from PostgreSQL
invoicesRouter.get('/', async (req: Request, res: Response) => {
  try {
    if (isDbConnected()) {
      const invoicesResult = await query(
        `SELECT id, invoice_id as "invoiceId", tenant_id as "tenantId", 
                invoice_number as "invoiceNumber", invoice_date as "invoiceDate", 
                party_id as "partyId", party_name as "partyName", party_phone as "partyPhone", 
                party_gstin as "partyGstin", subtotal, tax_total as "taxTotal", 
                discount_total as "discountTotal", grand_total as "grandTotal", 
                received_amount as "receivedAmount", due_amount as "dueAmount", 
                payment_status as "paymentStatus", payment_method as "paymentMethod", 
                created_at as "createdAt"
         FROM invoices ORDER BY created_at DESC`
      );

      return res.json({ success: true, count: invoicesResult.rows.length, data: invoicesResult.rows });
    }

    return res.json({ success: true, count: 0, data: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/invoices - Server-Side Calculations & Transaction Commit into PostgreSQL
invoicesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      invoiceId = `INV-${Date.now()}`,
      tenantId = 'default-tenant',
      invoiceNumber,
      invoiceDate = new Date().toISOString().split('T')[0],
      partyId,
      partyName,
      partyPhone,
      partyGstin,
      items = [],
      discountTotal = 0,
      receivedAmount = 0,
      paymentMethod = 'CASH'
    } = req.body;

    if (!invoiceNumber || !partyName || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Invoice number, party name, and items are required' });
    }

    // 1. SERVER-SIDE TAX & TOTAL CALCULATIONS
    let calculatedSubtotal = 0;
    let calculatedTaxTotal = 0;

    const processedItems = items.map((item: any) => {
      const qty = Number(item.quantity) || 1;
      const rate = Number(item.unitPrice) || 0;
      const itemSub = qty * rate;
      const taxRate = Number(item.cgstRate || 0) + Number(item.sgstRate || 0);
      const itemTax = (itemSub * taxRate) / 100;
      const itemTotal = itemSub + itemTax;

      calculatedSubtotal += itemSub;
      calculatedTaxTotal += itemTax;

      return {
        ...item,
        quantity: qty,
        unitPrice: rate,
        taxAmount: itemTax,
        totalAmount: itemTotal
      };
    });

    const calculatedGrandTotal = Math.max(0, calculatedSubtotal + calculatedTaxTotal - Number(discountTotal));
    const recAmtNum = Number(receivedAmount) > 0 ? Number(receivedAmount) : calculatedGrandTotal;
    const dueAmount = paymentMethod === 'CREDIT' ? calculatedGrandTotal : Math.max(0, calculatedGrandTotal - recAmtNum);
    const paymentStatus = dueAmount === 0 ? 'PAID' : dueAmount === calculatedGrandTotal ? 'UNPAID' : 'PARTIAL';

    if (isDbConnected()) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Insert Invoice Record
        const invResult = await client.query(
          `INSERT INTO invoices 
            (invoice_id, tenant_id, invoice_number, invoice_date, party_id, party_name, party_phone, party_gstin, subtotal, tax_total, discount_total, grand_total, received_amount, due_amount, payment_status, payment_method)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           RETURNING id`,
          [invoiceId, tenantId, invoiceNumber, invoiceDate, partyId || null, partyName, partyPhone || null, partyGstin || null, calculatedSubtotal, calculatedTaxTotal, discountTotal, calculatedGrandTotal, recAmtNum, dueAmount, paymentStatus, paymentMethod]
        );
        const dbInvoiceId = invResult.rows[0].id;

        // Insert Line Items & Decrement Inventory Stock in PostgreSQL
        for (const pItem of processedItems) {
          await client.query(
            `INSERT INTO invoice_items 
              (invoice_id, item_id, item_name, hsn_sac_code, unit_type, quantity, unit_price, purchase_price, tax_amount, total_amount)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [dbInvoiceId, pItem.itemId || null, pItem.itemName, pItem.hsnSacCode || '1000', pItem.unitType || 'PCS', pItem.quantity, pItem.unitPrice, pItem.purchasePrice || 0, pItem.taxAmount, pItem.totalAmount]
          );

          if (pItem.itemId) {
            await client.query(
              `UPDATE items SET current_stock = GREATEST(0, current_stock - $1) WHERE id = $2`,
              [pItem.quantity, pItem.itemId]
            );
          }
        }

        // Post Double-Entry Journal Entry in PostgreSQL
        await client.query(
          `INSERT INTO journal_entries 
            (tenant_id, entry_number, reference_id, transaction_date, description, total_debit, total_credit)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [tenantId, `JE-${Date.now().toString().slice(-4)}`, invoiceNumber, invoiceDate, `Sales Bill ${invoiceNumber} to ${partyName}`, calculatedGrandTotal, calculatedGrandTotal]
        );

        await client.query('COMMIT');
        client.release();

        return res.status(201).json({
          success: true,
          message: 'Invoice created with server-side calculations & committed to PostgreSQL',
          data: {
            invoiceId,
            invoiceNumber,
            subtotal: calculatedSubtotal,
            taxTotal: calculatedTaxTotal,
            discountTotal,
            grandTotal: calculatedGrandTotal,
            paymentStatus
          }
        });
      } catch (err: any) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    return res.status(201).json({
      success: true,
      data: {
        invoiceId,
        invoiceNumber,
        grandTotal: calculatedGrandTotal
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
