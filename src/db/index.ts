import Dexie, { Table } from 'dexie';
import { Item, Party, Invoice, SyncJournal, BusinessDetails, CompanyProfileEntity, Estimate, PaymentIn, ItemRestock, PurchaseOrder, PurchaseBill, PaymentOut, Expense, PurchaseReturn, SaleReturn, CashAccount, CashTransaction } from '../types';

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

  constructor() {
    super('VyaparOfflineDB');
    
    this.version(16).stores({
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
      cashTransactions: '++id, cashAccountId, type, source, transactionDate, tenantId'
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
 * Initializes structural necessities: Walk-in customer and Main Cash Drawer for a store tenant.
 */
export async function seedDatabaseIfEmpty(tenantId?: string) {
  const tId = tenantId || (typeof localStorage !== 'undefined' ? localStorage.getItem('vyapar_current_tenant') : null) || 'default-tenant';

  await seedWalkInCustomerForTenant(tId);
  await seedCashAccountForTenant(tId);
}

/**
 * Wipes all local store data and resets to clean slate.
 */
export async function clearAllDatabaseData() {
  await db.items.clear();
  await db.parties.clear();
  await db.invoices.clear();
  await db.syncJournal.clear();
  await db.estimates.clear();
  await db.paymentIn.clear();
  await db.itemRestocks.clear();
  await db.purchaseOrders.clear();
  await db.purchaseBills.clear();
  await db.paymentOut.clear();
  await db.expenses.clear();
  await db.purchaseReturns.clear();
  await db.saleReturns.clear();
  await db.cashTransactions.clear();
  await db.cashAccounts.clear();

  // Call server API to reset PostgreSQL tables
  try {
    await fetch('http://localhost:5000/api/v1/sync/reset', { method: 'POST' });
  } catch (err) {
    console.warn('Server reset notification warning:', err);
  }

  if (typeof window !== 'undefined') {
    window.location.reload();
  }
}
