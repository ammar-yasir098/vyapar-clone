import Dexie, { Table } from 'dexie';
import { Item, Party, Invoice, SyncJournal, BusinessDetails, CompanyProfileEntity, Estimate, PaymentIn, ItemRestock, PurchaseOrder, PurchaseBill, PaymentOut, Expense, PurchaseReturn, SaleReturn, CashAccount, CashTransaction, InventoryLocation, ItemLocationMapping, StockTransfer } from '../types';

export class VyaparDatabase extends Dexie {
  items!: Table<Item, number>;
  parties!: Table<Party, number>;
  invoices!: Table<Invoice, number>;
  syncJournal!: Table<SyncJournal, number>;
  companyProfiles!: Table<CompanyProfileEntity, number>;
  estimates!: Table<Estimate, number>;
  paymentIn!: Table<PaymentIn, number>;
  itemRestocks!: Table<ItemRestock, number>;
  purchaseOrders!: Table<PurchaseOrder, number>;
  purchaseBills!: Table<PurchaseBill, number>;
  paymentOut!: Table<PaymentOut, number>;
  expenses!: Table<Expense, number>;
  purchaseReturns!: Table<PurchaseReturn, number>;
  saleReturns!: Table<SaleReturn, number>;
  cashAccounts!: Table<CashAccount, number>;
  cashTransactions!: Table<CashTransaction, number>;
  locations!: Table<InventoryLocation, number>;
  itemLocations!: Table<ItemLocationMapping, number>;
  stockTransfers!: Table<StockTransfer, number>;

  constructor() {
    super('VyaparOfflineDB');
    
    this.version(17).stores({
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
      locations: '++id, tenantId, name, code, type, parentId',
      itemLocations: '++id, tenantId, itemId, locationId, [itemId+locationId]',
      stockTransfers: '++id, tenantId, transferNumber, sourceLocationId, destinationLocationId, itemId, transferDate'
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
    .filter(p => p.tenantId === tenantId && p.name === 'Walk-in Retail Customer')
    .toArray();

  if (walkIns.length === 0) {
    await db.parties.add({
      tenantId,
      name: 'Walk-in Retail Customer',
      phone: '03009999999',
      type: 'CUSTOMER',
      openingBalance: 0,
      balanceType: 'RECEIVABLE',
      currentBalance: 0,
      createdAt: new Date().toISOString()
    });
  } else if (walkIns.length > 1) {
    for (let i = 1; i < walkIns.length; i++) {
      if (walkIns[i].id) {
        await db.parties.delete(walkIns[i].id!);
      }
    }
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
    const mainStoreId = await db.locations.add({
      tenantId,
      name: 'Main Store / Godown',
      code: 'WH-MAIN',
      type: 'WAREHOUSE',
      capacity: 5000,
      description: 'Primary retail storefront warehouse',
      createdAt: new Date().toISOString()
    });

    const aisleAId = await db.locations.add({
      tenantId,
      name: 'Aisle 1 - General FMCG',
      code: 'ZONE-A1',
      type: 'ZONE',
      parentId: mainStoreId,
      capacity: 1500,
      description: 'Front store fast moving items',
      createdAt: new Date().toISOString()
    });

    await db.locations.add({
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
 * Wipes operational and inventory store data specifically for a user/tenant from IndexedDB and cloud PostgreSQL.
 * (EXCEPT user accounts and company profiles).
 */
export async function clearAllDatabaseData(tenantId?: string) {
  const targetTenantId = tenantId || (typeof localStorage !== 'undefined' ? localStorage.getItem('vyapar_current_tenant') : null) || 'default-tenant';

  // Helper to delete records for target tenant from a Dexie table
  const clearTenantRecords = async (table: Table<any, number>) => {
    try {
      const keysToDelete = await table
        .filter(item => targetTenantId === 'ALL' || item.tenantId === targetTenantId || (!item.tenantId && targetTenantId === 'default-tenant'))
        .primaryKeys();
      if (keysToDelete.length > 0) {
        await table.bulkDelete(keysToDelete as number[]);
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
