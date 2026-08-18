import Dexie, { Table } from 'dexie';
import { Item, Party, Invoice, SyncJournal, BusinessDetails, ItemBatch, LedgerAccount, JournalEntry, CompanyProfileEntity, Estimate, PaymentIn, ItemRestock, PurchaseOrder, PurchaseBill, PaymentOut, Expense, PurchaseReturn, SaleReturn, CashAccount, CashTransaction } from '../types';

export class VyaparDatabase extends Dexie {
  items!: Table<Item, number>;
  parties!: Table<Party, number>;
  invoices!: Table<Invoice, number>;
  syncJournal!: Table<SyncJournal, number>;
  itemBatches!: Table<ItemBatch, number>;
  ledgerAccounts!: Table<LedgerAccount, number>;
  journalEntries!: Table<JournalEntry, number>;
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
    
    this.version(14).stores({
      items: '++id, skuCode, barcode, name, currentStock, tenantId',
      parties: '++id, name, phone, type, tenantId',
      invoices: '++id, invoiceId, invoiceNumber, invoiceDate, paymentStatus, partyId, syncStatus, tenantId',
      syncJournal: '++id, versionId, clientSequence, entityType, timestamp, synced',
      itemBatches: '++id, itemId, batchNumber, expiryDate',
      ledgerAccounts: '++id, accountCode, accountName, accountType, tenantId',
      journalEntries: '++id, entryNumber, referenceId, transactionDate, tenantId',
      companyProfiles: '++id, &tenantId, name',
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
 * Seeds standard 10 Chart of Accounts for a specific store tenant if not present.
 */
export async function seedLedgerAccountsForTenant(tenantId: string = 'default-tenant') {
  const existingAccounts = await db.ledgerAccounts.filter(a => (a.tenantId || 'default-tenant') === tenantId).toArray();
  if (existingAccounts.length === 0) {
    await db.ledgerAccounts.bulkAdd([
      { tenantId, accountCode: '1010', accountName: 'Cash in Hand', accountType: 'ASSET', balance: 0.00, description: 'Physical cash at POS counter' },
      { tenantId, accountCode: '1020', accountName: 'HDFC Bank Account', accountType: 'ASSET', balance: 0.00, description: 'Operating bank account for UPI/Card' },
      { tenantId, accountCode: '1030', accountName: 'Accounts Receivable', accountType: 'ASSET', balance: 0.00, description: 'Customer credit receivables' },
      { tenantId, accountCode: '1040', accountName: 'Merchandise Inventory Asset', accountType: 'ASSET', balance: 0.00, description: 'Total inventory stock value at cost' },
      { tenantId, accountCode: '2010', accountName: 'Accounts Payable', accountType: 'LIABILITY', balance: 0.00, description: 'Supplier payables' },
      { tenantId, accountCode: '2020', accountName: 'GST Output Tax Liability', accountType: 'LIABILITY', balance: 0.00, description: 'Collected GST payable to tax authority' },
      { tenantId, accountCode: '3010', accountName: 'Owner Equity Capital', accountType: 'EQUITY', balance: 0.00, description: 'Initial owner capital investment' },
      { tenantId, accountCode: '4010', accountName: 'Sales Revenue', accountType: 'REVENUE', balance: 0.00, description: 'Gross merchandise sales revenue' },
      { tenantId, accountCode: '5010', accountName: 'Cost of Goods Sold (COGS)', accountType: 'EXPENSE', balance: 0.00, description: 'Purchase cost of goods sold' },
      { tenantId, accountCode: '5020', accountName: 'Sales Discounts Allowed', accountType: 'EXPENSE', balance: 0.00, description: 'Discounts granted to customers' }
    ]);
  }
}

/**
 * Seeds default Walk-in Retail Customer for a specific store tenant if not present.
 * Automatically purges any duplicate Walk-in customer entries for that store.
 */
export async function seedWalkInCustomerForTenant(tenantId: string = 'default-tenant') {
  const walkIns = await db.parties
    .filter(p => (p.tenantId || 'default-tenant') === tenantId && p.name === 'Walk-in Retail Customer')
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
    // Delete duplicate entries, keeping only the first one
    for (let i = 1; i < walkIns.length; i++) {
      if (walkIns[i].id) {
        await db.parties.delete(walkIns[i].id!);
      }
    }
  }
}

/**
 * Initializes clean Chart of Accounts & default Walk-in customer with ZERO pre-loaded products or bills.
 */
export async function seedDatabaseIfEmpty() {
  await seedLedgerAccountsForTenant('default-tenant');
  await seedWalkInCustomerForTenant('default-tenant');

  // Clean up any dummy basmati items or test customers from local Dexie IndexedDB
  const basmatiItems = await db.items.filter(i => (i.name || '').toLowerCase().includes('basmati')).toArray();
  for (const item of basmatiItems) {
    if (item.id) await db.items.delete(item.id);
  }

  const testCustomers = await db.parties.filter(p => (p.name || '').toLowerCase().includes('test customer')).toArray();
  for (const party of testCustomers) {
    if (party.id) await db.parties.delete(party.id);
  }

  // Deduplicate any duplicate ledger accounts by accountCode
  const allLedgerAccs = await db.ledgerAccounts.toArray();
  const seenAccCodes = new Set<string>();
  for (const acc of allLedgerAccs) {
    if (seenAccCodes.has(acc.accountCode)) {
      if (acc.id) await db.ledgerAccounts.delete(acc.id);
    } else {
      seenAccCodes.add(acc.accountCode);
    }
  }
}

/**
 * Wipes all local store data (items, parties, invoices, journal entries) and resets to clean slate.
 */
export async function clearAllDatabaseData() {
  await db.items.clear();
  await db.parties.clear();
  await db.invoices.clear();
  await db.syncJournal.clear();
  await db.itemBatches.clear();
  await db.journalEntries.clear();
  await db.estimates.clear();
  await db.paymentIn.clear();
  await db.itemRestocks.clear();
  await db.purchaseOrders.clear();
  await db.purchaseBills.clear();
  await db.paymentOut.clear();
  await db.expenses.clear();
  await db.purchaseReturns.clear();
  await db.saleReturns.clear();
  
  // Reset account balances to 0 in local Dexie IndexedDB
  const accounts = await db.ledgerAccounts.toArray();
  for (const acc of accounts) {
    if (acc.id) {
      await db.ledgerAccounts.update(acc.id, { balance: 0 });
    }
  }

  // Call server API to reset PostgreSQL tables and reset ledger balances to 0
  try {
    await fetch('http://localhost:5000/api/v1/sync/reset', { method: 'POST' });
  } catch (err) {
    console.warn('Server reset notification warning:', err);
  }

  window.location.reload();
}
