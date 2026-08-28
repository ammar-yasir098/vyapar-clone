import { Router, Request, Response } from 'express';
import { cloudStore } from '../db/store.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { 
  sequelize, 
  isDbConnected, 
  InvoiceItem, 
  Invoice, 
  Item, 
  Party, 
  EstimateItem, 
  Estimate, 
  PaymentIn,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseBill,
  PurchaseBillItem,
  PaymentOut,
  Expense,
  PurchaseReturn,
  PurchaseReturnItem,
  SaleReturn,
  SaleReturnItem,
  CashAccount,
  CashTransaction,
  InventoryLocation,
  ItemLocationMapping,
  StockTransfer,
  StoreWarehouseAccess,
  CompanyProfile,
  User
} from '../db/sequelize.js';

export const syncRouter = Router();

// POST /api/v1/sync/reset - Wipe tenant-specific store records (EXCEPT users & company_profile)
syncRouter.post('/reset', async (req: Request, res: Response) => {
  try {
    const bodyTenantId = req.body?.tenantId || req.query?.tenantId;
    const authTenantId = (req as AuthenticatedRequest).user?.tenantId;
    const tenantId = (bodyTenantId || authTenantId || 'default-tenant') as string;
    const isResetAll = req.body?.resetAll === true || tenantId === 'ALL';

    if (isResetAll) {
      cloudStore.clear();
    } else {
      cloudStore.clearTenant(tenantId);
    }

    if (isDbConnected()) {
      const whereClause = isResetAll ? {} : { where: { tenantId } };

      // 1. Delete child line items associated with tenant's parent records
      try {
        const invoiceIds = (await Invoice.findAll({ ...whereClause, attributes: ['id'] })).map(i => i.id);
        if (invoiceIds.length > 0) {
          await InvoiceItem.destroy({ where: { invoiceId: invoiceIds }, force: true }).catch(() => {});
        }

        const estimateIds = (await Estimate.findAll({ ...whereClause, attributes: ['id'] })).map(e => e.id);
        if (estimateIds.length > 0) {
          await EstimateItem.destroy({ where: { estimateId: estimateIds }, force: true }).catch(() => {});
        }

        const poIds = (await PurchaseOrder.findAll({ ...whereClause, attributes: ['id'] })).map(po => po.id);
        if (poIds.length > 0) {
          await PurchaseOrderItem.destroy({ where: { purchaseOrderId: poIds }, force: true }).catch(() => {});
        }

        const pbIds = (await PurchaseBill.findAll({ ...whereClause, attributes: ['id'] })).map(pb => pb.id);
        if (pbIds.length > 0) {
          await PurchaseBillItem.destroy({ where: { purchaseBillId: pbIds }, force: true }).catch(() => {});
        }

        const prIds = (await PurchaseReturn.findAll({ ...whereClause, attributes: ['id'] })).map(pr => pr.id);
        if (prIds.length > 0) {
          await PurchaseReturnItem.destroy({ where: { purchaseReturnId: prIds }, force: true }).catch(() => {});
        }

        const srIds = (await SaleReturn.findAll({ ...whereClause, attributes: ['id'] })).map(sr => sr.id);
        if (srIds.length > 0) {
          await SaleReturnItem.destroy({ where: { saleReturnId: srIds }, force: true }).catch(() => {});
        }
      } catch (childErr) {
        console.warn('Child line items destroy fallback error:', childErr);
      }

      // 2. Delete main transactional & cash models for tenant
      await Invoice.destroy({ ...whereClause, force: true }).catch(() => {});
      await Estimate.destroy({ ...whereClause, force: true }).catch(() => {});
      await PaymentIn.destroy({ ...whereClause, force: true }).catch(() => {});
      await PurchaseOrder.destroy({ ...whereClause, force: true }).catch(() => {});
      await PurchaseBill.destroy({ ...whereClause, force: true }).catch(() => {});
      await PaymentOut.destroy({ ...whereClause, force: true }).catch(() => {});
      await Expense.destroy({ ...whereClause, force: true }).catch(() => {});
      await PurchaseReturn.destroy({ ...whereClause, force: true }).catch(() => {});
      await SaleReturn.destroy({ ...whereClause, force: true }).catch(() => {});
      await CashTransaction.destroy({ ...whereClause, force: true }).catch(() => {});
      await CashAccount.destroy({ ...whereClause, force: true }).catch(() => {});

      // 3. Delete inventory, locations, warehouses, stock transfers & mappings for tenant
      await StockTransfer.destroy({ ...whereClause, force: true }).catch(() => {});
      await ItemLocationMapping.destroy({ ...whereClause, force: true }).catch(() => {});
      await InventoryLocation.destroy({ ...whereClause, force: true }).catch(() => {});

      // 4. Delete core item catalog and party records for tenant
      await Item.destroy({ ...whereClause, force: true }).catch(() => {});
      await Party.destroy({ ...whereClause, force: true }).catch(() => {});
    }

    console.log(`🧹 [RESET] Successfully wiped operational & inventory store data for tenant: ${tenantId}`);

    return res.json({
      success: true,
      tenantId,
      message: `Operational and inventory store data for tenant '${tenantId}' wiped successfully.`
    });
  } catch (err: any) {
    console.error('Reset error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/sync/health
syncRouter.get('/health', (req: Request, res: Response) => {
  return res.json({
    status: 'ONLINE',
    service: 'Vyapar Cloud Sync Engine',
    serverVersion: cloudStore.getLatestVersion(),
    timestamp: new Date().toISOString()
  });
});

// GET /api/v1/sync/pull - Pull latest cloud records for tenant (Bidirectional Sync)
syncRouter.get('/pull', async (req: Request, res: Response) => {
  try {
    const authTenantId = (req as AuthenticatedRequest).user?.tenantId;
    const queryTenantId = req.query.tenantId as string;
    const tenantId = queryTenantId || authTenantId || 'default-tenant';

    if (!tenantId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Valid authentication token with tenant ID required for pull' });
    }

    if (!isDbConnected()) {
      return res.json({ success: true, serverVersion: cloudStore.getLatestVersion(), data: {} });
    }

    const [items, parties, invoices, estimates, paymentsIn, purchaseOrders, purchaseBills, paymentsOut, expenses, purchaseReturns, saleReturns, cashAccounts, cashTransactions, rawLocations, rawItemLocations, rawStockTransfers, storeWarehouseAccess] = await Promise.all([
      Item.findAll({ where: { tenantId } }),
      Party.findAll({ where: { tenantId } }),
      Invoice.findAll({ where: { tenantId } }),
      Estimate.findAll({ where: { tenantId } }),
      PaymentIn.findAll({ where: { tenantId } }),
      PurchaseOrder.findAll({ where: { tenantId } }),
      PurchaseBill.findAll({ where: { tenantId } }),
      PaymentOut.findAll({ where: { tenantId } }),
      Expense.findAll({ where: { tenantId } }),
      PurchaseReturn.findAll({ where: { tenantId } }),
      SaleReturn.findAll({ where: { tenantId } }),
      CashAccount.findAll({ where: { tenantId } }),
      CashTransaction.findAll({ where: { tenantId } }),
      InventoryLocation.findAll(),
      ItemLocationMapping.findAll(),
      StockTransfer.findAll(),
      StoreWarehouseAccess.findAll()
    ]);

    // Resolve accessible warehouses for tenant (ownership, store_warehouse_access join, or allowedTenantIds)
    const accessibleWhIds = new Set<string>();
    storeWarehouseAccess.forEach(acc => {
      const sId = acc.get('storeId') as string;
      const whId = String(acc.get('warehouseId'));
      if (sId === tenantId) accessibleWhIds.add(whId);
    });

    rawLocations.forEach(loc => {
      const locTenant = loc.get('tenantId') as string;
      const isShared = loc.get('isShared') === true;
      const allowedTenantIds = (loc.get('allowedTenantIds') as string[]) || [];
      if (locTenant === tenantId || isShared || (Array.isArray(allowedTenantIds) && allowedTenantIds.includes(tenantId))) {
        accessibleWhIds.add(String(loc.get('id')));
      }
    });

    // Accessible locations include root warehouses and their child zones/shelves
    const locations = rawLocations.filter(loc => {
      const lId = String(loc.get('id'));
      const pId = loc.get('parentId') ? String(loc.get('parentId')) : null;
      if (accessibleWhIds.has(lId)) return true;
      if (pId && accessibleWhIds.has(pId)) return true;
      return false;
    });

    const accessibleLocIdSet = new Set(locations.map(l => String(l.get('id'))));

    // Accessible item locations and stock transfers matching accessible locations
    const itemLocations = rawItemLocations.filter(m => {
      const mTenant = m.get('tenantId') as string;
      const locId = String(m.get('locationId'));
      return mTenant === tenantId || accessibleLocIdSet.has(locId);
    });

    const stockTransfers = rawStockTransfers.filter(st => {
      const stTenant = st.get('tenantId') as string;
      const srcId = String(st.get('sourceLocationId'));
      const dstId = String(st.get('destinationLocationId'));
      return stTenant === tenantId || accessibleLocIdSet.has(srcId) || accessibleLocIdSet.has(dstId);
    });

    const relevantAccess = storeWarehouseAccess.filter(acc => {
      const tId = acc.get('tenantId') as string;
      const sId = acc.get('storeId') as string;
      return tId === tenantId || sId === tenantId;
    });

    return res.json({
      success: true,
      tenantId,
      serverVersion: cloudStore.getLatestVersion(),
      data: {
        items,
        parties,
        invoices,
        estimates,
        paymentsIn,
        purchaseOrders,
        purchaseBills,
        paymentsOut,
        expenses,
        purchaseReturns,
        saleReturns,
        cashAccounts,
        cashTransactions,
        locations,
        itemLocations,
        stockTransfers,
        storeWarehouseAccess: relevantAccess
      }
    });
  } catch (err: any) {
    console.error('Error pulling server updates:', err);
    return res.status(500).json({ success: false, error: 'Failed to pull cloud updates' });
  }
});

// POST /api/v1/sync/push
syncRouter.post('/push', async (req: Request, res: Response) => {
  const authTenantId = (req as AuthenticatedRequest).user?.tenantId;
  const { tenantId: bodyTenantId, mutations } = req.body;
  const tenantId = bodyTenantId || authTenantId || 'default-tenant';

  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant ID required for push sync' });
  }

  if (!Array.isArray(mutations)) {
    return res.status(400).json({ error: 'Invalid push payload' });
  }

  const result = cloudStore.pushMutations(tenantId, mutations);

  // Persist mutations directly into PostgreSQL Database using Sequelize ORM
  if (isDbConnected()) {
    const { sequelize, Item, Party, Invoice, InvoiceItem, PurchaseBill, Expense, PaymentIn, PaymentOut, CashAccount, CashTransaction, InventoryLocation, ItemLocationMapping, StockTransfer, StoreWarehouseAccess } = await import('../db/sequelize.js');
    const dbTx = await sequelize.transaction();

    try {
      for (const m of mutations) {
        try {
          const payload = typeof m.payload === 'string' ? JSON.parse(m.payload) : m.payload;
          const entityType = m.entityType;
          const mutationType = m.mutationType;

        if (entityType === 'ITEM') {
          if (mutationType === 'DELETE') {
            if (payload.skuCode && payload.skuCode.trim()) await Item.destroy({ where: { tenantId, skuCode: payload.skuCode.trim() } });
            else if (payload.name) await Item.destroy({ where: { tenantId, name: payload.name.trim() } });
          } else if (payload.name) {
            let existing = null;
            if (payload.skuCode && payload.skuCode.trim()) {
              existing = await Item.findOne({ where: { tenantId, skuCode: payload.skuCode.trim() } });
            }
            if (!existing && payload.name) {
              existing = await Item.findOne({ where: { tenantId, name: payload.name.trim() } });
            }

            const itemData = {
              tenantId,
              name: (payload.name || '').trim(),
              skuCode: (payload.skuCode || '').trim(),
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
          if (mutationType === 'DELETE' && payload.name) {
            await Party.destroy({ where: { tenantId, name: payload.name.trim() } });
          } else if (payload.name) {
            let existing = await Party.findOne({ where: { tenantId, name: payload.name.trim() } });

            const partyData = {
              tenantId,
              name: (payload.name || '').trim(),
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
          if (mutationType === 'DELETE' && payload.invoiceNumber) {
            await Invoice.destroy({ where: { tenantId, invoiceNumber: payload.invoiceNumber } });
          } else if (payload.invoiceNumber) {
            let existingInvoice = await Invoice.findOne({
              where: { tenantId, invoiceNumber: payload.invoiceNumber }
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
        } else if (entityType === 'PAYMENT_IN') {
          if (mutationType === 'DELETE' && payload.id) {
            await PaymentIn.destroy({ where: { id: payload.id } });
          } else if (payload.receiptNumber) {
            let existing = await PaymentIn.findOne({ where: { receiptNumber: payload.receiptNumber } });
            const payData = {
              receiptNumber: payload.receiptNumber,
              tenantId: tenantId || 'default-tenant',
              partyId: payload.partyId || null,
              partyName: payload.partyName || '',
              paymentDate: payload.paymentDate || new Date().toISOString().split('T')[0],
              paymentMethod: payload.paymentMethod || 'CASH',
              amount: payload.amount || 0,
              notes: payload.notes || ''
            };
            if (existing) {
              await existing.update(payData);
            } else {
              await PaymentIn.create(payData);
            }
          }
        } else if (entityType === 'PURCHASE_ORDER') {
          if (mutationType === 'DELETE' && payload.id) {
            await PurchaseOrder.destroy({ where: { id: payload.id } });
          } else if (payload.poId || payload.poNumber) {
            let existingPO = payload.poId ? await PurchaseOrder.findOne({ where: { poId: payload.poId } }) : null;
            if (!existingPO && payload.poNumber) {
              existingPO = await PurchaseOrder.findOne({ where: { poNumber: payload.poNumber } });
            }
            const poData = {
              poId: payload.poId || `PO-${Date.now()}`,
              tenantId: tenantId || 'default-tenant',
              poNumber: payload.poNumber || `PO-${Math.floor(1000 + Math.random() * 9000)}`,
              poDate: payload.poDate || new Date().toISOString().split('T')[0],
              supplierId: payload.supplierId || null,
              supplierName: payload.supplierName || 'Supplier',
              supplierPhone: payload.supplierPhone || '',
              supplierGstin: payload.supplierGstin || '',
              subtotal: payload.subtotal || 0,
              taxTotal: payload.taxTotal || 0,
              grandTotal: payload.grandTotal || 0,
              status: payload.status || 'PENDING',
              notes: payload.notes || ''
            };
            let targetPO: any;
            if (existingPO) {
              await existingPO.update(poData);
              targetPO = existingPO;
              await PurchaseOrderItem.destroy({ where: { purchaseOrderId: existingPO.get('id') as number } });
            } else {
              targetPO = await PurchaseOrder.create(poData);
            }
            if (payload.items && Array.isArray(payload.items)) {
              for (const item of payload.items) {
                await PurchaseOrderItem.create({
                  purchaseOrderId: targetPO.id,
                  itemId: item.itemId || item.id || null,
                  itemName: item.itemName || item.name || 'Order Product',
                  unitType: item.unitType || 'PCS',
                  quantity: item.quantity || 1,
                  purchasePrice: item.purchasePrice || item.unitPrice || 0,
                  totalAmount: item.totalAmount || ((item.quantity || 1) * (item.purchasePrice || item.unitPrice || 0))
                });
              }
            }
          }
        } else if (entityType === 'PURCHASE_BILL') {
          if (mutationType === 'DELETE' && payload.id) {
            await PurchaseBill.destroy({ where: { id: payload.id } });
          } else if (payload.billId || payload.billNumber) {
            let existingBill = payload.billId ? await PurchaseBill.findOne({ where: { billId: payload.billId } }) : null;
            if (!existingBill && payload.billNumber) {
              existingBill = await PurchaseBill.findOne({ where: { billNumber: payload.billNumber } });
            }
            const billData = {
              billId: payload.billId || `PB-${Date.now()}`,
              tenantId: tenantId || 'default-tenant',
              billNumber: payload.billNumber || `PB-${Math.floor(1000 + Math.random() * 9000)}`,
              billDate: payload.billDate || new Date().toISOString().split('T')[0],
              supplierId: payload.supplierId || null,
              supplierName: payload.supplierName || 'Supplier',
              supplierPhone: payload.supplierPhone || '',
              supplierGstin: payload.supplierGstin || '',
              subtotal: payload.subtotal || 0,
              taxTotal: payload.taxTotal || 0,
              grandTotal: payload.grandTotal || 0,
              notes: payload.notes || ''
            };
            let targetBill: any;
            if (existingBill) {
              await existingBill.update(billData);
              targetBill = existingBill;
              await PurchaseBillItem.destroy({ where: { purchaseBillId: existingBill.get('id') as number } });
            } else {
              targetBill = await PurchaseBill.create(billData);
            }
            if (payload.items && Array.isArray(payload.items)) {
              for (const item of payload.items) {
                await PurchaseBillItem.create({
                  purchaseBillId: targetBill.id,
                  itemId: item.itemId || item.id || null,
                  itemName: item.itemName || item.name || 'Purchased Product',
                  hsnSacCode: item.hsnSacCode || '1000',
                  unitType: item.unitType || 'PCS',
                  quantity: item.quantity || 1,
                  unitPrice: item.unitPrice || item.purchasePrice || 0,
                  purchasePrice: item.purchasePrice || item.unitPrice || 0,
                  taxAmount: item.taxAmount || 0,
                  totalAmount: item.totalAmount || ((item.quantity || 1) * (item.unitPrice || 0))
                });
              }
            }
          }
        } else if (entityType === 'PAYMENT_OUT') {
          if (mutationType === 'DELETE' && payload.id) {
            await PaymentOut.destroy({ where: { id: payload.id } });
          } else if (payload.receiptNumber) {
            let existing = await PaymentOut.findOne({ where: { receiptNumber: payload.receiptNumber } });
            const payData = {
              receiptNumber: payload.receiptNumber,
              tenantId: tenantId || 'default-tenant',
              partyId: payload.partyId || null,
              partyName: payload.partyName || '',
              partyPhone: payload.partyPhone || '',
              paymentDate: payload.paymentDate || new Date().toISOString().split('T')[0],
              paymentMethod: payload.paymentMethod || 'CASH',
              amount: payload.amount || 0,
              notes: payload.notes || ''
            };
            if (existing) {
              await existing.update(payData);
            } else {
              await PaymentOut.create(payData);
            }
          }
        } else if (entityType === 'EXPENSE') {
          if (mutationType === 'DELETE' && payload.id) {
            await Expense.destroy({ where: { id: payload.id } });
          } else if (payload.expenseNumber) {
            let existing = await Expense.findOne({ where: { expenseNumber: payload.expenseNumber } });
            const expData = {
              expenseNumber: payload.expenseNumber,
              tenantId: tenantId || 'default-tenant',
              categoryName: payload.categoryName || 'Miscellaneous',
              expenseDate: payload.expenseDate || new Date().toISOString().split('T')[0],
              paymentMode: payload.paymentMode || 'CASH',
              amount: payload.amount || 0,
              notes: payload.notes || ''
            };
            if (existing) {
              await existing.update(expData);
            } else {
              await Expense.create(expData);
            }
          }
        } else if (entityType === 'PURCHASE_RETURN') {
          if (mutationType === 'DELETE' && payload.id) {
            await PurchaseReturn.destroy({ where: { id: payload.id } });
          } else if (payload.returnId || payload.debitNoteNumber) {
            let existingReturn = payload.returnId ? await PurchaseReturn.findOne({ where: { returnId: payload.returnId } }) : null;
            if (!existingReturn && payload.debitNoteNumber) {
              existingReturn = await PurchaseReturn.findOne({ where: { debitNoteNumber: payload.debitNoteNumber } });
            }
            const retData = {
              returnId: payload.returnId || `PR-${Date.now()}`,
              tenantId: tenantId || 'default-tenant',
              debitNoteNumber: payload.debitNoteNumber || `DN-${Math.floor(1000 + Math.random() * 9000)}`,
              returnDate: payload.returnDate || new Date().toISOString().split('T')[0],
              supplierId: payload.supplierId || null,
              supplierName: payload.supplierName || 'Supplier',
              supplierPhone: payload.supplierPhone || '',
              subtotal: payload.subtotal || 0,
              taxTotal: payload.taxTotal || 0,
              grandTotal: payload.grandTotal || 0,
              notes: payload.notes || ''
            };
            let targetReturn: any;
            if (existingReturn) {
              await existingReturn.update(retData);
              targetReturn = existingReturn;
              await PurchaseReturnItem.destroy({ where: { purchaseReturnId: existingReturn.get('id') as number } });
            } else {
              targetReturn = await PurchaseReturn.create(retData);
            }
            if (payload.items && Array.isArray(payload.items)) {
              for (const item of payload.items) {
                await PurchaseReturnItem.create({
                  purchaseReturnId: targetReturn.id,
                  itemId: item.itemId || item.id || null,
                  itemName: item.itemName || item.name || 'Returned Item',
                  hsnSacCode: item.hsnSacCode || '1000',
                  unitType: item.unitType || 'PCS',
                  quantity: item.quantity || 1,
                  unitPrice: item.unitPrice || item.purchasePrice || 0,
                  totalAmount: item.totalAmount || ((item.quantity || 1) * (item.unitPrice || 0))
                });
              }
            }
          }
        } else if (entityType === 'SALE_RETURN') {
          if (mutationType === 'DELETE' && payload.id) {
            await SaleReturn.destroy({ where: { id: payload.id } });
          } else if (payload.returnId || payload.creditNoteNumber) {
            let existingReturn = payload.returnId ? await SaleReturn.findOne({ where: { returnId: payload.returnId } }) : null;
            if (!existingReturn && payload.creditNoteNumber) {
              existingReturn = await SaleReturn.findOne({ where: { creditNoteNumber: payload.creditNoteNumber } });
            }
            const retData = {
              returnId: payload.returnId || `CR-${Date.now()}`,
              tenantId: tenantId || 'default-tenant',
              creditNoteNumber: payload.creditNoteNumber || `CR-${Math.floor(1000 + Math.random() * 9000)}`,
              returnDate: payload.returnDate || new Date().toISOString().split('T')[0],
              invoiceNumber: payload.invoiceNumber || '',
              partyId: payload.partyId || null,
              partyName: payload.partyName || 'Customer',
              partyPhone: payload.partyPhone || '',
              subtotal: payload.subtotal || 0,
              taxTotal: payload.taxTotal || 0,
              grandTotal: payload.grandTotal || 0,
              refundAmount: payload.refundAmount || 0,
              notes: payload.notes || ''
            };
            let targetReturn: any;
            if (existingReturn) {
              await existingReturn.update(retData);
              targetReturn = existingReturn;
              await SaleReturnItem.destroy({ where: { saleReturnId: existingReturn.get('id') as number } });
            } else {
              targetReturn = await SaleReturn.create(retData);
            }
            if (payload.items && Array.isArray(payload.items)) {
              for (const item of payload.items) {
                await SaleReturnItem.create({
                  saleReturnId: targetReturn.id,
                  itemId: item.itemId || item.id || null,
                  itemName: item.itemName || item.name || 'Returned Item',
                  hsnSacCode: item.hsnSacCode || '1000',
                  unitType: item.unitType || 'PCS',
                  returnQuantity: item.returnQuantity || item.quantity || 1,
                  unitPrice: item.unitPrice || item.price || 0,
                  taxAmount: item.taxAmount || 0,
                  totalAmount: item.totalAmount || ((item.returnQuantity || item.quantity || 1) * (item.unitPrice || item.price || 0))
                });
              }
            }
          }
        } else if (entityType === 'CASH_ACCOUNT') {
          if (mutationType === 'DELETE' && payload.id) {
            await CashAccount.destroy({ where: { id: payload.id } });
          } else if (payload.name) {
            let existing = payload.id ? await CashAccount.findByPk(payload.id) : null;
            if (!existing) {
              existing = await CashAccount.findOne({ where: { tenantId: tenantId || 'default-tenant' } });
            }
            const accData = {
              tenantId: tenantId || 'default-tenant',
              name: payload.name || 'Main Cash Drawer',
              openingBalance: payload.openingBalance || 0
            };
            if (existing) {
              await existing.update(accData);
            } else {
              await CashAccount.create(accData);
            }
          }
        } else if (entityType === 'CASH_TRANSACTION') {
          if (mutationType === 'DELETE' && payload.id) {
            await CashTransaction.destroy({ where: { id: payload.id } });
          } else if (payload.amount && payload.type) {
            let cAcc = await CashAccount.findOne({ where: { tenantId: tenantId || 'default-tenant' } });
            if (!cAcc) {
              cAcc = await CashAccount.create({ tenantId: tenantId || 'default-tenant', name: 'Main Cash Drawer', openingBalance: 0 });
            }
            let existingTx = payload.referenceId ? await CashTransaction.findOne({ where: { referenceId: payload.referenceId, tenantId: tenantId || 'default-tenant' } }) : null;
            const txData = {
              cashAccountId: (cAcc as any).id,
              tenantId: tenantId || 'default-tenant',
              type: payload.type,
              amount: payload.amount,
              source: payload.source || 'MANUAL_ADJUSTMENT',
              referenceId: payload.referenceId || `TXN-${Date.now()}`,
              description: payload.description || 'Synced Cash Transaction',
              transactionDate: payload.transactionDate || new Date().toISOString()
            };
            if (existingTx) {
              await existingTx.update(txData);
            } else {
              await CashTransaction.create(txData);
            }
          }
        } else if (entityType === 'LOCATION') {
          if (mutationType === 'DELETE' && payload.id) {
            await InventoryLocation.destroy({ where: { id: String(payload.id) } });
          } else if (payload.name || payload.code) {
            const locId = payload.id ? String(payload.id) : `wh-${Date.now()}`;
            await InventoryLocation.upsert({
              id: locId,
              tenantId: payload.tenantId || tenantId || 'default-tenant',
              name: payload.name || 'Warehouse',
              code: payload.code || `WH-${Date.now()}`,
              type: payload.type || 'WAREHOUSE',
              parentId: payload.parentId ? String(payload.parentId) : null,
              capacity: payload.capacity || 500,
              description: payload.description || '',
              isShared: !!payload.isShared,
              allowedTenantIds: payload.allowedTenantIds || []
            });
          }
        } else if (entityType === 'ITEM_LOCATION') {
          if (mutationType === 'DELETE' && payload.id) {
            await ItemLocationMapping.destroy({ where: { id: String(payload.id) } });
          } else if (payload.itemId && payload.locationId) {
            const mapId = payload.id ? String(payload.id) : `map-${payload.itemId}-${payload.locationId}`;
            await ItemLocationMapping.upsert({
              id: mapId,
              tenantId: payload.tenantId || tenantId || 'default-tenant',
              itemId: String(payload.itemId),
              locationId: String(payload.locationId),
              quantity: payload.quantity || 0,
              maxCapacity: payload.maxCapacity || 100
            });
          }
        } else if (entityType === 'STOCK_TRANSFER') {
          if (mutationType === 'DELETE' && payload.id) {
            await StockTransfer.destroy({ where: { id: String(payload.id) } });
          } else if (payload.sourceLocationId && payload.destinationLocationId) {
            const trfId = payload.id ? String(payload.id) : `trf-${Date.now()}`;
            await StockTransfer.upsert({
              id: trfId,
              transferNumber: payload.transferNumber || `TRF-${Date.now()}`,
              tenantId: payload.tenantId || tenantId || 'default-tenant',
              sourceLocationId: String(payload.sourceLocationId),
              destinationLocationId: String(payload.destinationLocationId),
              itemId: String(payload.itemId),
              quantity: payload.quantity || 1,
              transferDate: payload.transferDate || new Date().toISOString().split('T')[0],
              notes: payload.notes || ''
            });
          }
        } else if (entityType === 'STORE_WAREHOUSE_ACCESS') {
          if (mutationType === 'DELETE' && (payload.id || (payload.storeId && payload.warehouseId))) {
            if (payload.id) await StoreWarehouseAccess.destroy({ where: { id: String(payload.id) } });
            else await StoreWarehouseAccess.destroy({ where: { storeId: payload.storeId, warehouseId: String(payload.warehouseId) } });
          } else if (payload.storeId && payload.warehouseId) {
            const accessId = payload.id ? String(payload.id) : `access-${payload.storeId}-${payload.warehouseId}`;
            await StoreWarehouseAccess.upsert({
              id: accessId,
              tenantId: payload.tenantId || tenantId || 'default-tenant',
              storeId: payload.storeId,
              warehouseId: String(payload.warehouseId)
            });
          }
        }
      } catch (err) {
        console.error('Error persisting individual sync mutation to PostgreSQL:', err);
      }
    }
    await dbTx.commit();
  } catch (txErr) {
    await dbTx.rollback();
    console.error('Sequelize transaction rolled back due to push sync failure:', txErr);
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
