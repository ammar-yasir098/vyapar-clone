import Dexie, { Table } from 'dexie';
import { Item, Party, Invoice, SyncJournal, BusinessDetails, CompanyProfileEntity, Estimate, PaymentIn, ItemRestock, PurchaseOrder, PurchaseBill, PaymentOut, Expense, PurchaseReturn, SaleReturn, CashAccount, CashTransaction, InventoryLocation, ItemLocationMapping, StockTransfer, StoreWarehouseAccess } from '../types';

export class VyaparDatabase extends Dexie {
  items!: Table<Item, any>;
  parties!: Table<Party, any>;
  invoices!: Table<Invoice, any>;
  syncJournal!: Table<SyncJournal, any>;
  companyProfiles!: Table<CompanyProfileEntity, any>;
  estimates!: Table<Estimate, any>;
  paymentIn!: Table<PaymentIn, any>;
  itemRestocks!: Table<ItemRestock, any>;
  purchaseOrders!: Table<PurchaseOrder, any>;
  purchaseBills!: Table<PurchaseBill, any>;
  paymentOut!: Table<PaymentOut, any>;
  expenses!: Table<Expense, any>;
  purchaseReturns!: Table<PurchaseReturn, any>;
  saleReturns!: Table<SaleReturn, any>;
  cashAccounts!: Table<CashAccount, any>;
  cashTransactions!: Table<CashTransaction, any>;
  locations!: Table<InventoryLocation, any>;
  itemLocations!: Table<ItemLocationMapping, any>;
  stockTransfers!: Table<StockTransfer, any>;
  storeWarehouseAccess!: Table<StoreWarehouseAccess, any>;

  constructor() {
    super('VyaparOfflineDB');
    
    this.version(18).stores({
      items: '++id, skuCode, barcode, name, currentStock, tenantId',
      parties: '++id, name, phone, type, tenantId',
      invoices: '++id, invoiceId, invoiceNumber, invoiceDate, paymentStatus, partyId, syncStatus, tenantId',
      syncJournal: '++id, versionId, clientSequence, entityType, timestamp, synced, [synced+timestamp]',
      companyProfiles: '++id, userId, tenantId, name',
      estimates: '++id, estimateId, estimateNumber, estimateDate, partyId, tenantId',
      paymentIn: '++id, receiptNumber, partyId, paymentDate, tenantId',
      itemRestocks: '++id, itemId, supplierId, restockDate, tenantId',
      purchaseOrders: '++id, poId, poNumber, poDate, supplierId, status, tenantId',
      purchaseBills: '++id, billId, billNumber, billDate, supplierId, tenantId',
      paymentOut: '++id, receiptNumber, partyId, paymentDate, tenantId',
      expenses: '++id, expenseNumber, categoryName, expenseDate, tenantId',
      purchaseReturns: '++id, returnId, debitNoteNumber, returnDate, supplierId, tenantId',
      saleReturns: '++id, returnId, creditNoteNumber, returnDate, partyId, tenantId',
      cashAccounts: '++id, name, tenantId',
      cashTransactions: '++id, cashAccountId, type, source, transactionDate, tenantId',
      locations: '++id, tenantId, name, code, type, parentId, [tenantId+type], [tenantId+parentId]',
      itemLocations: '++id, tenantId, itemId, locationId, [itemId+locationId], [tenantId+locationId]',
      stockTransfers: '++id, tenantId, transferNumber, sourceLocationId, destinationLocationId, itemId, transferDate, [tenantId+sourceLocationId], [tenantId+destinationLocationId]',
      storeWarehouseAccess: '++id, tenantId, storeId, warehouseId, [tenantId+storeId], [storeId+warehouseId]'
    });
  }
}

export const db = new VyaparDatabase();

export const DEFAULT_BUSINESS: BusinessDetails = {
  name: 'SuperMarket Retail & Traders',
  gstin: 'NTN: 7654321-0',
  phone: '+92 300 xxxxxxx',
  address: 'Shop #12, Commercial Market, Main Boulevard, Gulberg, Lahore',
  state: 'Punjab, Pakistan',
  tagline: 'Quality Products at Everyday Low Prices',
  upiId: '03001234567@jazzcash'
};

/**
 * Returns the currently active store tenant ID from business prop or localStorage
 */
export function getActiveTenantId(business?: { tenantId?: string }): string {
  return business?.tenantId || (typeof localStorage !== 'undefined' ? localStorage.getItem('vyapar_current_tenant') : null) || 'default-tenant';
}


/**
 * Seeds default Walk-in Retail Customer for a specific store tenant if not present.
 * Automatically purges any duplicate Walk-in customer entries for that store.
 */
export async function seedWalkInCustomerForTenant(tenantId: string) {
  if (!tenantId) return;
  const walkIns = await db.parties
    .filter(p => (p.tenantId || 'default-tenant') === tenantId && (p.name === 'Walk-in Customer' || p.name === 'Walk-in Retail Customer'))
    .toArray();

  let targetParty: Party | null = null;

  if (walkIns.length === 0) {
    const partyData: Party = {
      tenantId,
      name: 'Walk-in Customer',
      phone: '03009999999',
      type: 'CUSTOMER',
      openingBalance: 0,
      balanceType: 'RECEIVABLE',
      currentBalance: 0,
      createdAt: new Date().toISOString()
    };
    const id = await db.parties.add(partyData);
    targetParty = { ...partyData, id };
  } else {
    targetParty = walkIns[0];
    if (walkIns.length > 1) {
      for (let i = 1; i < walkIns.length; i++) {
        if (walkIns[i].id) {
          await db.parties.delete(walkIns[i].id!);
        }
      }
    }
  }

  if (targetParty && targetParty.id) {
    try {
      const { syncManager } = await import('../services/sync');
      await syncManager.logMutation('PARTY', String(targetParty.id), 'INSERT', {
        id: targetParty.id,
        tenantId,
        name: targetParty.name || 'Walk-in Customer',
        phone: targetParty.phone || '03009999999',
        type: 'CUSTOMER',
        openingBalance: 0,
        balanceType: 'RECEIVABLE',
        currentBalance: 0
      });
    } catch {}
  }
}

/**
 * Seeds default Main Cash Drawer for a specific store tenant if not present.
 */
export async function seedCashAccountForTenant(tenantId: string) {
  if (!tenantId) return;
  const existing = await db.cashAccounts.filter(a => a.tenantId === tenantId).first();
  if (!existing) {
    await db.cashAccounts.add({
      tenantId,
      name: 'Main Cash Drawer',
      openingBalance: 0.00,
      createdAt: new Date().toISOString()
    });
  }
}

/**
 * Seeds default Warehouse & Shelf Location structure for a store tenant if not present.
 */
export async function seedDefaultLocationsForTenant(tenantId: string) {
  if (!tenantId) return;
  const count = await db.locations.filter(l => l.tenantId === tenantId).count();
  if (count === 0) {
    const mainStoreId = `wh-main-${tenantId}`;
    await db.locations.put({
      id: mainStoreId,
      tenantId,
      name: 'Main Store / Godown',
      code: 'WH-MAIN',
      type: 'WAREHOUSE',
      capacity: 5000,
      description: 'Primary retail storefront warehouse',
      createdAt: new Date().toISOString()
    });

    const aisleAId = `zone-a1-${tenantId}`;
    await db.locations.put({
      id: aisleAId,
      tenantId,
      name: 'Aisle 1 - General FMCG',
      code: 'ZONE-A1',
      type: 'ZONE',
      parentId: mainStoreId,
      capacity: 1500,
      description: 'Front store fast moving items',
      createdAt: new Date().toISOString()
    });

    const shelfAId = `shelf-a1-01-${tenantId}`;
    await db.locations.put({
      id: shelfAId,
      tenantId,
      name: 'Shelf A1-Bin 01',
      code: 'SH-A1-01',
      type: 'SHELF',
      parentId: aisleAId,
      capacity: 250,
      description: 'Top shelf for packaged goods',
      createdAt: new Date().toISOString()
    });
  }
}

/**
 * Initializes structural necessities: Walk-in customer and Main Cash Drawer for a store tenant.
 * (Locations remain blank for new stores so owners can build their custom physical space layout).
 */
export async function seedDatabaseIfEmpty(tenantId?: string) {
  const tId = tenantId || (typeof localStorage !== 'undefined' ? localStorage.getItem('vyapar_current_tenant') : null) || 'default-tenant';

  await seedWalkInCustomerForTenant(tId);
  await seedCashAccountForTenant(tId);
}

/**
 * Automatically allocates or updates stock to the store's primary Warehouse location mapping.
 */
export async function allocateStockToMainWarehouse(
  tenantId: string,
  itemId: string | number,
  deltaQty: number,
  skuCode?: string,
  itemName?: string
) {
  if (!tenantId || !itemId || deltaQty === 0) return;

  try {
    const locs = await db.locations.filter(l => (l.tenantId || 'default-tenant') === tenantId && l.type === 'WAREHOUSE').toArray();
    let mainWh = locs[0];

    if (!mainWh) {
      const mainWhId = `wh-main-${tenantId}`;
      mainWh = {
        id: mainWhId,
        tenantId,
        name: 'Main Store / Godown',
        code: 'WH-MAIN',
        type: 'WAREHOUSE',
        capacity: 5000,
        description: 'Primary retail storefront warehouse',
        createdAt: new Date().toISOString()
      };
      await db.locations.put(mainWh);
    }

    const whId = String(mainWh.id);
    const existingMap = await db.itemLocations
      .filter(il => (il.tenantId || 'default-tenant') === tenantId && String(il.itemId) === String(itemId) && String(il.locationId) === whId)
      .first();

    const { syncManager } = await import('../services/sync');
    const { saveServerItemLocation } = await import('../services/api');

    if (existingMap && existingMap.id) {
      const newQty = Math.max(0, (existingMap.quantity || 0) + deltaQty);
      await db.itemLocations.update(existingMap.id, {
        quantity: newQty,
        updatedAt: new Date().toISOString()
      });
      syncManager.logMutation('ITEM_LOCATION', String(existingMap.id), 'UPDATE', { ...existingMap, quantity: newQty, updatedAt: new Date().toISOString() });
      saveServerItemLocation({ tenantId, itemId: Number(itemId) || 0, skuCode: skuCode || '', name: itemName || '', locationId: Number(whId) || 0, quantity: newQty }).catch(() => {});
    } else {
      const initialQty = Math.max(0, deltaQty);
      const newMapId = `map-${itemId}-${whId}`;
      const newPayload = {
        id: newMapId,
        tenantId,
        itemId: String(itemId),
        locationId: whId,
        quantity: initialQty,
        maxCapacity: 10000,
        skuCode: skuCode || '',
        updatedAt: new Date().toISOString()
      };
      await db.itemLocations.put(newPayload);
      syncManager.logMutation('ITEM_LOCATION', newMapId, 'INSERT', newPayload);
      saveServerItemLocation({ tenantId, itemId: Number(itemId) || 0, skuCode: skuCode || '', name: itemName || '', locationId: Number(whId) || 0, quantity: initialQty }).catch(() => {});
    }
  } catch (err) {
    console.error('Error in allocateStockToMainWarehouse:', err);
  }
}

/**
 * Wipes operational and inventory store data specifically for a user/tenant from IndexedDB and cloud PostgreSQL.
 * (EXCEPT user accounts and company profiles).
 */
export async function clearAllDatabaseData(tenantId?: string) {
  const targetTenantId = tenantId || (typeof localStorage !== 'undefined' ? localStorage.getItem('vyapar_current_tenant') : null) || 'default-tenant';

  // Helper to delete records for target tenant from a Dexie table
  const clearTenantRecords = async (table: Table<any, any>) => {
    try {
      const keysToDelete = await table
        .filter(item => targetTenantId === 'ALL' || item.tenantId === targetTenantId || (!item.tenantId && targetTenantId === 'default-tenant'))
        .primaryKeys();
      if (keysToDelete.length > 0) {
        await table.bulkDelete(keysToDelete as any[]);
      }
    } catch (err) {
      console.warn('Failed clearing tenant records for table:', err);
    }
  };

  await clearTenantRecords(db.items);
  await clearTenantRecords(db.parties);
  await clearTenantRecords(db.invoices);
  await clearTenantRecords(db.syncJournal);
  await clearTenantRecords(db.estimates);
  await clearTenantRecords(db.paymentIn);
  await clearTenantRecords(db.itemRestocks);
  await clearTenantRecords(db.purchaseOrders);
  await clearTenantRecords(db.purchaseBills);
  await clearTenantRecords(db.paymentOut);
  await clearTenantRecords(db.expenses);
  await clearTenantRecords(db.purchaseReturns);
  await clearTenantRecords(db.saleReturns);
  await clearTenantRecords(db.cashTransactions);
  await clearTenantRecords(db.cashAccounts);
  await clearTenantRecords(db.locations);
  await clearTenantRecords(db.itemLocations);
  await clearTenantRecords(db.stockTransfers);

  // EXPLICITLY PRESERVED: db.companyProfiles and user sessions remain intact!

  // Call server API to reset PostgreSQL tables for targetTenantId
  try {
    const { fetchWithTimeout, API_BASE_URL } = await import('../services/api');
    await fetchWithTimeout(`${API_BASE_URL}/sync/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: targetTenantId, resetAll: targetTenantId === 'ALL' })
    });
  } catch (err) {
    console.warn('Server reset notification warning:', err);
  }

  // Re-seed essential defaults for the reset tenant
  await seedDatabaseIfEmpty(targetTenantId);

  if (typeof window !== 'undefined') {
    window.location.reload();
  }
}
