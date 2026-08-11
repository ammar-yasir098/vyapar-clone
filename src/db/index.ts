import Dexie, { Table } from 'dexie';
import { Item, Party, Invoice, SyncJournal, BusinessDetails, ItemBatch, LedgerAccount, JournalEntry } from '../types';

export class VyaparDatabase extends Dexie {
  items!: Table<Item, number>;
  parties!: Table<Party, number>;
  invoices!: Table<Invoice, number>;
  syncJournal!: Table<SyncJournal, number>;
  itemBatches!: Table<ItemBatch, number>;
  ledgerAccounts!: Table<LedgerAccount, number>;
  journalEntries!: Table<JournalEntry, number>;

  constructor() {
    super('VyaparOfflineDB');
    
    this.version(2).stores({
      items: '++id, skuCode, barcode, name, currentStock, tenantId',
      parties: '++id, name, phone, type, tenantId',
      invoices: '++id, invoiceNumber, invoiceDate, paymentStatus, partyId, syncStatus, tenantId',
      syncJournal: '++id, versionId, clientSequence, entityType, timestamp, synced',
      itemBatches: '++id, itemId, batchNumber, expiryDate',
      ledgerAccounts: '++id, accountCode, accountName, accountType, tenantId',
      journalEntries: '++id, entryNumber, referenceId, transactionDate, tenantId'
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
 * Initializes clean Chart of Accounts & default Walk-in customer with ZERO pre-loaded products or bills.
 */
export async function seedDatabaseIfEmpty() {
  const accountCount = await db.ledgerAccounts.count();
  if (accountCount === 0) {
    console.log('Initializing fresh Chart of Accounts...');

    // Standard Chart of Accounts (All Balances starting at 0)
    await db.ledgerAccounts.bulkAdd([
      { tenantId: 'default-tenant', accountCode: '1010', accountName: 'Cash in Hand', accountType: 'ASSET', balance: 0.00, description: 'Physical cash at POS counter' },
      { tenantId: 'default-tenant', accountCode: '1020', accountName: 'Bank / JazzCash / EasyPaisa', accountType: 'ASSET', balance: 0.00, description: 'Operating bank account for digital payments' },
      { tenantId: 'default-tenant', accountCode: '1030', accountName: 'Accounts Receivable', accountType: 'ASSET', balance: 0.00, description: 'Customer credit receivables' },
      { tenantId: 'default-tenant', accountCode: '1040', accountName: 'Merchandise Inventory Asset', accountType: 'ASSET', balance: 0.00, description: 'Total inventory stock value at cost' },
      { tenantId: 'default-tenant', accountCode: '2010', accountName: 'Accounts Payable', accountType: 'LIABILITY', balance: 0.00, description: 'Supplier payables' },
      { tenantId: 'default-tenant', accountCode: '2020', accountName: 'Sales Tax / FBR Liability', accountType: 'LIABILITY', balance: 0.00, description: 'Collected Sales Tax payable to FBR / PRA' },
      { tenantId: 'default-tenant', accountCode: '3010', accountName: 'Owner Equity Capital', accountType: 'EQUITY', balance: 0.00, description: 'Initial owner capital investment' },
      { tenantId: 'default-tenant', accountCode: '4010', accountName: 'Sales Revenue', accountType: 'REVENUE', balance: 0.00, description: 'Gross merchandise sales revenue' },
      { tenantId: 'default-tenant', accountCode: '5010', accountName: 'Cost of Goods Sold (COGS)', accountType: 'EXPENSE', balance: 0.00, description: 'Purchase cost of goods sold' },
      { tenantId: 'default-tenant', accountCode: '5020', accountName: 'Sales Discounts Allowed', accountType: 'EXPENSE', balance: 0.00, description: 'Discounts granted to customers' }
    ]);
  }

  const existingWalkIn = await db.parties.where('name').equals('Walk-in Retail Customer').first();
  if (!existingWalkIn) {
    // Upsert default Walk-in Customer with explicit id to prevent React 18 StrictMode race condition
    await db.parties.put({
      id: 1,
      tenantId: 'default-tenant',
      name: 'Walk-in Retail Customer',
      phone: '03009999999',
      type: 'CUSTOMER',
      openingBalance: 0,
      balanceType: 'RECEIVABLE',
      currentBalance: 0,
      createdAt: new Date().toISOString()
    });
  }

  // Deduplicate any accidental duplicate Walk-in Customer entries
  const allWalkIns = await db.parties.where('name').equals('Walk-in Retail Customer').toArray();
  if (allWalkIns.length > 1) {
    // Keep first, delete extra duplicates
    for (let i = 1; i < allWalkIns.length; i++) {
      if (allWalkIns[i].id) {
        await db.parties.delete(allWalkIns[i].id!);
      }
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
  
  // Reset account balances to 0
  const accounts = await db.ledgerAccounts.toArray();
  for (const acc of accounts) {
    if (acc.id) {
      await db.ledgerAccounts.update(acc.id, { balance: 0 });
    }
  }

  // Re-add default Walk-in Customer (will be seeded by initializeDefaultData on next reload)
  // Removed manual re-add here to prevent duplicate entries on sync

  window.location.reload();
}
