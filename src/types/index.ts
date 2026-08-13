export type Role = 'OWNER' | 'MANAGER' | 'BILLING_CLERK' | 'ACCOUNTANT';

export type UnitType = 'PCS' | 'KG' | 'LTR' | 'BOX' | 'PACK' | 'MTR';

export type PartyType = 'CUSTOMER' | 'SUPPLIER' | 'BOTH';

export type BalanceType = 'PAYABLE' | 'RECEIVABLE';

export type PaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'CREDIT';

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface Tenant {
  id: string;
  businessName: string;
  taxIdentifier: string; // GSTIN
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
}

export interface ItemBatch {
  id?: number;
  itemId: number;
  batchNumber: string;
  mrp: number;
  expiryDate: string; // YYYY-MM-DD
  purchasePrice: number;
  salesPrice: number;
  currentStock: number;
  updatedAt: string;
}

export interface Item {
  id?: number;
  tenantId: string;
  name: string;
  skuCode: string;
  barcode: string;
  hsnSacCode: string;
  unitType: UnitType;
  purchasePrice: number;
  salesPrice: number;
  minStockAlert: number;
  currentStock: number;
  cgstRate: number; // e.g. 9 for 9%
  sgstRate: number; // e.g. 9 for 9%
  igstRate: number; // e.g. 18 for 18%
  isActive: boolean;
  batchNumber?: string;
  expiryDate?: string;
  mrp?: number;
  updatedAt: string;
}

export interface Party {
  id?: number;
  tenantId: string;
  name: string;
  phone: string;
  email?: string;
  type: PartyType;
  gstin?: string;
  address?: string;
  openingBalance: number;
  balanceType: BalanceType;
  currentBalance: number;
  createdAt: string;
}

export interface InvoiceItem {
  itemId: number;
  itemName: string;
  hsnSacCode: string;
  unitType: UnitType;
  quantity: number;
  unitPrice: number;
  purchasePrice: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  taxAmount: number;
  totalAmount: number;
  batchNumber?: string;
  expiryDate?: string;
}

export interface Invoice {
  id?: number;
  invoiceId: string; // UUID
  tenantId: string;
  partyId?: number;
  partyName: string;
  partyPhone?: string;
  partyGstin?: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  items: InvoiceItem[];
  subtotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  taxTotal: number;
  discountTotal: number;
  grandTotal: number;
  receivedAmount: number;
  dueAmount: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  notes?: string;
  createdAt: string;
  syncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
}

export interface LedgerAccount {
  id?: number;
  tenantId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  balance: number; // Positive = Normal balance (Debit for Asset/Expense, Credit for Liab/Equity/Rev)
  description?: string;
}

export interface JournalLine {
  accountId: number;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id?: number;
  tenantId: string;
  entryNumber: string; // e.g. JE-2026-0001
  referenceId: string; // Invoice number or Payment ID
  transactionDate: string;
  description: string;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  createdAt: string;
}

export interface SyncJournal {
  id?: number;
  versionId: string;
  clientSequence: number;
  entityType: 'INVOICE' | 'ITEM' | 'PARTY' | 'JOURNAL' | 'ESTIMATE';
  entityId: string;
  mutationType: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: string; // JSON string
  timestamp: string;
  synced: boolean;
}

export interface BusinessDetails {
  tenantId?: string;
  name: string;
  gstin: string;
  phone: string;
  address: string;
  state: string;
  tagline: string;
  upiId?: string;
  email?: string;
  businessType?: string;
  businessCategory?: string;
  pincode?: string;
  logoUrl?: string | null;
  signatureUrl?: string | null;
}

export interface CompanyProfileEntity {
  id?: number;
  tenantId: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  businessType?: string;
  businessCategory?: string;
  pincode?: string;
  logoUrl?: string | null;
  signatureUrl?: string | null;
  booksBeginDate?: string;
  updatedAt?: string;
}

export interface EstimateItem {
  id?: number;
  itemId?: number;
  itemName: string;
  hsnSacCode?: string;
  unitType?: string;
  quantity: number;
  unitPrice: number;
  taxAmount?: number;
  totalAmount: number;
}

export interface Estimate {
  id?: number;
  estimateId: string;
  tenantId: string;
  estimateNumber: string;
  estimateDate: string;
  partyId?: number;
  partyName: string;
  partyPhone?: string;
  partyGstin?: string;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  grandTotal: number;
  status: 'OPEN' | 'CONVERTED' | 'EXPIRED';
  items: EstimateItem[];
  createdAt?: string;
}
