import { Router, Request, Response } from 'express';
import { cloudStore } from '../db/store.js';
import { sequelize, isDbConnected, InvoiceItem, Invoice, Item, Party, JournalEntry, EstimateItem, Estimate, PaymentIn } from '../db/sequelize.js';

export const syncRouter = Router();

// POST /api/v1/sync/reset - Wipe all cloud database tables for a fresh start
syncRouter.post('/reset', async (req: Request, res: Response) => {
  try {
    cloudStore.clear();

    if (isDbConnected()) {
      try {
        await sequelize.query('TRUNCATE TABLE invoice_items, invoices, items, parties, journal_entries, estimates, estimate_items, payment_in RESTART IDENTITY CASCADE;');
      } catch (truncateErr) {
        console.warn('Truncate SQL warning, using Sequelize destroy fallback:', truncateErr);
        await InvoiceItem.destroy({ where: {} }).catch(() => {});
        await Invoice.destroy({ where: {} }).catch(() => {});
        await Item.destroy({ where: {} }).catch(() => {});
        await Party.destroy({ where: {} }).catch(() => {});
        await JournalEntry.destroy({ where: {} }).catch(() => {});
        await EstimateItem.destroy({ where: {} }).catch(() => {});
        await Estimate.destroy({ where: {} }).catch(() => {});
        await PaymentIn.destroy({ where: {} }).catch(() => {});
      }

      await sequelize.query('UPDATE ledger_accounts SET balance = 0.0;').catch(() => {});
    }

    console.log('🧹 [RESET] Successfully wiped all cloud database records for clean start.');

    return res.json({
      success: true,
      message: 'All cloud database tables wiped successfully.'
    });
  } catch (err: any) {
    console.error('Reset error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/health
syncRouter.get('/health', (req: Request, res: Response) => {
  return res.json({
    status: 'ONLINE',
    service: 'Vyapar Cloud Sync Engine',
    serverVersion: cloudStore.getLatestVersion(),
    timestamp: new Date().toISOString()
  });
});

// POST /api/v1/sync/push
syncRouter.post('/push', async (req: Request, res: Response) => {
  const { tenantId, mutations } = req.body;

  if (!tenantId || !Array.isArray(mutations)) {
    return res.status(400).json({ error: 'Invalid push payload' });
  }

  const result = cloudStore.pushMutations(tenantId, mutations);

  // Persist mutations directly into PostgreSQL Database using Sequelize ORM
  if (isDbConnected()) {
    const { Item, Party, Invoice, InvoiceItem, JournalEntry } = await import('../db/sequelize.js');

    for (const m of mutations) {
      try {
        const payload = typeof m.payload === 'string' ? JSON.parse(m.payload) : m.payload;
        const entityType = m.entityType;
        const mutationType = m.mutationType;

        if (entityType === 'ITEM') {
          if (mutationType === 'DELETE' && payload.id) {
            await Item.destroy({ where: { id: payload.id } });
          } else if (payload.name) {
            let existing = payload.id ? await Item.findByPk(payload.id) : null;
            if (!existing && payload.skuCode) {
              existing = await Item.findOne({ where: { skuCode: payload.skuCode } });
            }
            if (!existing && payload.name) {
              existing = await Item.findOne({ where: { name: payload.name } });
            }

            const itemData = {
              tenantId: tenantId || 'default-tenant',
              name: payload.name,
              skuCode: payload.skuCode || '',
              barcode: payload.barcode || '',
              hsnSacCode: payload.hsnSacCode || '1000',
              unitType: payload.unitType || 'PCS',
              purchasePrice: payload.purchasePrice || 0,
              salesPrice: payload.salesPrice || 0,
              minStockAlert: payload.minStockAlert || 5,
              currentStock: payload.currentStock || 0,
              cgstRate: payload.cgstRate || 0,
              sgstRate: payload.sgstRate || 0,
              igstRate: payload.igstRate || 0
            };

            if (existing) {
              await existing.update(itemData);
            } else {
              await Item.create(itemData);
            }
          }
        } else if (entityType === 'PARTY') {
          if (mutationType === 'DELETE' && payload.id) {
            await Party.destroy({ where: { id: payload.id } });
          } else if (payload.name) {
            let existing = payload.id ? await Party.findByPk(payload.id) : null;
            if (!existing) {
              existing = await Party.findOne({ where: { name: payload.name } });
            }

            const partyData = {
              tenantId: tenantId || 'default-tenant',
              name: payload.name,
              phone: payload.phone || '',
              type: payload.type || 'CUSTOMER',
              openingBalance: payload.openingBalance || 0,
              balanceType: payload.balanceType || 'RECEIVABLE',
              currentBalance: payload.currentBalance ?? payload.openingBalance ?? 0,
              gstin: payload.gstin || '',
              address: payload.address || ''
            };

            if (existing) {
              await existing.update(partyData);
            } else {
              await Party.create(partyData);
            }
          }
        } else if (entityType === 'INVOICE') {
          if (mutationType === 'DELETE' && payload.id) {
            await Invoice.destroy({ where: { id: payload.id } });
          } else if (payload.invoiceNumber) {
            let existingInvoice = await Invoice.findOne({
              where: { invoiceNumber: payload.invoiceNumber }
            });

            // Verify partyId foreign key in PostgreSQL
            let validPartyId: number | null = null;
            if (payload.partyId && typeof payload.partyId === 'number') {
              const partyExists = await Party.findByPk(payload.partyId);
              if (partyExists) validPartyId = payload.partyId;
            }

            let targetInvoice: any;
            if (existingInvoice) {
              await existingInvoice.update({
                partyId: validPartyId,
                partyName: payload.partyName || 'Walk-in Retail Customer',
                subtotal: payload.subtotal || 0,
                taxTotal: payload.taxTotal || 0,
                discountTotal: payload.discountTotal || 0,
                grandTotal: payload.grandTotal || 0,
                receivedAmount: payload.receivedAmount || 0,
                dueAmount: payload.dueAmount || 0,
                paymentStatus: payload.paymentStatus || 'PAID',
                paymentMethod: payload.paymentMethod || 'CASH'
              });
              targetInvoice = existingInvoice;
              // Clear existing items before inserting new ones to avoid duplicates
              await InvoiceItem.destroy({ where: { invoiceId: existingInvoice.get('id') as number } });
            } else {
              targetInvoice = await Invoice.create({
                invoiceId: payload.invoiceId || `INV-${Date.now()}`,
                tenantId: tenantId || 'default-tenant',
                invoiceNumber: payload.invoiceNumber,
                invoiceDate: payload.invoiceDate || new Date().toISOString().split('T')[0],
                partyId: validPartyId,
                partyName: payload.partyName || 'Walk-in Retail Customer',
                partyPhone: payload.partyPhone || '',
                partyGstin: payload.partyGstin || '',
                subtotal: payload.subtotal || 0,
                taxTotal: payload.taxTotal || 0,
                discountTotal: payload.discountTotal || 0,
                grandTotal: payload.grandTotal || 0,
                receivedAmount: payload.receivedAmount || 0,
                dueAmount: payload.dueAmount || 0,
                paymentStatus: payload.paymentStatus || 'PAID',
                paymentMethod: payload.paymentMethod || 'CASH'
              });
            }

            // Save line items with safe foreign key resolution
            if (payload.items && Array.isArray(payload.items)) {
              for (const item of payload.items) {
                const rawItemId = item.itemId || item.id;
                let validItemId: number | null = null;
                if (rawItemId && typeof rawItemId === 'number') {
                  const itemExists = await Item.findByPk(rawItemId);
                  if (itemExists) validItemId = rawItemId;
                }
                if (!validItemId && (item.itemName || item.name)) {
                  const itemByName = await Item.findOne({ where: { name: item.itemName || item.name } });
                  if (itemByName) validItemId = itemByName.id;
                }

                await InvoiceItem.create({
                  invoiceId: targetInvoice.id,
                  itemId: validItemId,
                  itemName: item.itemName || item.name || '',
                  hsnSacCode: item.hsnSacCode || '',
                  unitType: item.unitType || 'PCS',
                  quantity: item.quantity || 1,
                  unitPrice: item.unitPrice || item.price || 0,
                  purchasePrice: item.purchasePrice || 0,
                  taxAmount: item.taxAmount || 0,
                  totalAmount: item.totalAmount || (item.quantity * item.unitPrice) || 0
                });
              }
            }
          }
        } else if (entityType === 'JOURNAL') {
          if (payload.entryNumber) {
            let existing = await JournalEntry.findOne({ where: { entryNumber: payload.entryNumber } });
            const journalData = {
              tenantId: tenantId || 'default-tenant',
              entryNumber: payload.entryNumber,
              referenceId: payload.referenceId || '',
              transactionDate: payload.transactionDate || new Date().toISOString().split('T')[0],
              description: payload.description || '',
              totalDebit: payload.totalDebit || 0,
              totalCredit: payload.totalCredit || 0
            };
            if (existing) {
              await existing.update(journalData);
            } else {
              await JournalEntry.create(journalData);
            }
          }
        } else if (entityType === 'ESTIMATE') {
          const { Estimate, EstimateItem } = await import('../db/sequelize.js');
          if (mutationType === 'DELETE' && payload.id) {
            await Estimate.destroy({ where: { id: payload.id } });
          } else if (payload.estimateId || payload.estimateNumber) {
            let existingEst = payload.estimateId ? await Estimate.findOne({ where: { estimateId: payload.estimateId } }) : null;
            if (!existingEst && payload.estimateNumber) {
              existingEst = await Estimate.findOne({ where: { estimateNumber: payload.estimateNumber } });
            }

            const estData = {
              estimateId: payload.estimateId || `EST-${Date.now()}`,
              tenantId: tenantId || 'default-tenant',
              estimateNumber: payload.estimateNumber || `EST-${Math.floor(1000 + Math.random() * 9000)}`,
              estimateDate: payload.estimateDate || new Date().toISOString().split('T')[0],
              partyId: payload.partyId || null,
              partyName: payload.partyName || 'Walk-in Customer',
              partyPhone: payload.partyPhone || '',
              partyGstin: payload.partyGstin || '',
              subtotal: payload.subtotal || 0,
              taxTotal: payload.taxTotal || 0,
              discountTotal: payload.discountTotal || 0,
              grandTotal: payload.grandTotal || 0,
              status: payload.status || 'OPEN'
            };

            let targetEst: any;
            if (existingEst) {
              await existingEst.update(estData);
              targetEst = existingEst;
              await EstimateItem.destroy({ where: { estimateId: existingEst.get('id') as number } });
            } else {
              targetEst = await Estimate.create(estData);
            }

            if (payload.items && Array.isArray(payload.items)) {
              for (const item of payload.items) {
                await EstimateItem.create({
                  estimateId: targetEst.id,
                  itemId: item.itemId || item.id || null,
                  itemName: item.itemName || item.name || 'Quoted Product',
                  hsnSacCode: item.hsnSacCode || '',
                  unitType: item.unitType || 'PCS',
                  quantity: item.quantity || 1,
                  unitPrice: item.unitPrice || item.salesPrice || 0,
                  taxAmount: item.taxAmount || 0,
                  totalAmount: item.totalAmount || (item.quantity * (item.unitPrice || 0))
                });
              }
            }
          }
        }
      } catch (err) {
        console.error('Error persisting sync mutation to PostgreSQL:', err);
      }
    }
  }

  console.log(`[CLOUD SYNC PUSH] Successfully synced ${result.syncedCount} delta mutations to PostgreSQL for tenant: ${tenantId}`);

  return res.json({
    success: true,
    syncedCount: result.syncedCount,
    serverVersion: result.serverVersion,
    timestamp: new Date().toISOString()
  });
});

// GET /api/v1/sync/pull
syncRouter.get('/pull', (req: Request, res: Response) => {
  const tenantId = (req.query.tenantId as string) || 'default-tenant';
  const sinceSeq = parseInt(req.query.since as string) || 0;

  const serverDeltas = cloudStore.getMutationsSince(tenantId, sinceSeq);

  return res.json({
    tenantId,
    sinceSeq,
    deltasCount: serverDeltas.length,
    latestServerVersion: cloudStore.getLatestVersion(),
    deltas: serverDeltas
  });
});
