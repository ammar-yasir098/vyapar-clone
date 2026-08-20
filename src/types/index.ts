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

export interface SyncJournal {
  id?: number;
  versionId: string;
  clientSequence: number;
  entityType: 'INVOICE' | 'ITEM' | 'PARTY' | 'ESTIMATE' | 'PAYMENT_IN' | 'PURCHASE_ORDER' | 'PURCHASE_BILL' | 'PAYMENT_OUT' | 'EXPENSE' | 'PURCHASE_RETURN' | 'SALE_RETURN' | 'CASH_ACCOUNT' | 'CASH_TRANSACTION';
  entityId: string;
  mutationType: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: string; // JSON string
  timestamp: string;
  synced: boolean;
}

export interface BusinessDetails {
  userId?: string;
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
  userId?: string;
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

export interface PaymentIn {
  id?: number;
  receiptNumber: string;
  tenantId: string;
  partyId?: number;
  partyName: string;
  partyPhone?: string;
  paymentDate: string;
  paymentMethod: 'CASH' | 'DIGITAL / APP' | 'CARD' | 'CHEQUE';
  amount: number;
  notes?: string;
  createdAt?: string;
}

export interface ItemRestock {
  id?: number;
  itemId: number;
  itemName: string;
  tenantId: string;
  supplierId?: number;
  supplierName: string;
  supplierPhone?: string;
  billNumber: string;
  restockDate: string;
  quantityAdded: number;
  purchasePrice: number;
  totalCost: number;
  source: 'PURCHASE_BILL' | 'MANUAL_ADJUSTMENT';
  createdAt: string;
}

export type POStatus = 'PENDING' | 'CONVERTED' | 'CANCELLED';

export interface PurchaseOrderItem {
  id?: number;
  itemId?: number;
  itemName: string;
  unitType?: string;
  quantity: number;
  purchasePrice: number;
  totalAmount: number;
}

export interface PurchaseOrder {
  id?: number;
  poId: string;
  tenantId: string;
  poNumber: string;
  poDate: string;
  supplierId?: number;
  supplierName: string;
  supplierPhone?: string;
  supplierGstin?: string;
  items: PurchaseOrderItem[];
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  status: POStatus;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PurchaseBillItem {
  id?: number;
  itemId?: number;
  itemName: string;
  hsnSacCode?: string;
  unitType?: string;
  quantity: number;
  unitPrice: number;
  purchasePrice: number;
  taxAmount?: number;
  totalAmount: number;
}

export interface PurchaseBill {
  id?: number;
  billId: string;
  tenantId: string;
  billNumber: string;
  billDate: string;
  supplierId?: number;
  supplierName: string;
  supplierPhone?: string;
  supplierGstin?: string;
  items: PurchaseBillItem[];
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  paidAmount?: number;
  dueAmount?: number;
  paymentStatus?: 'PAID' | 'UNPAID' | 'PARTIAL';
  paymentMethod?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaymentOut {
  id?: number;
  receiptNumber: string;
  tenantId: string;
  partyId?: number;
  partyName: string;
  partyPhone?: string;
  paymentDate: string;
  paymentMethod: 'CASH' | 'DIGITAL / APP' | 'CARD' | 'CHEQUE';
  amount: number;
  notes?: string;
  createdAt?: string;
}

export interface Expense {
  id?: number;
  expenseNumber: string;
  tenantId: string;
  categoryName: string;
  expenseDate: string;
  paymentMode: 'CASH' | 'DIGITAL / APP' | 'CARD' | 'CHEQUE';
  amount: number;
  notes?: string;
  createdAt?: string;
}

export interface PurchaseReturnItem {
  id?: number;
  itemId?: number;
  itemName: string;
  unitType?: string;
  returnQuantity: number;
  unitPrice: number;
  totalAmount: number;
}

export interface PurchaseReturn {
  id?: number;
  returnId: string;
  tenantId: string;
  debitNoteNumber: string;
  returnDate: string;
  purchaseBillNumber?: string;
  supplierId?: number;
  supplierName: string;
  supplierPhone?: string;
  items: PurchaseReturnItem[];
  subtotal: number;
  grandTotal: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SaleReturnItem {
  id?: number;
  itemId?: number;
  itemName: string;
  hsnSacCode?: string;
  unitType?: string;
  returnQuantity: number;
  unitPrice: number;
  taxAmount?: number;
  totalAmount: number;
}

export interface SaleReturn {
  id?: number;
  returnId: string;
  tenantId: string;
  creditNoteNumber: string;
  returnDate: string;
  invoiceNumber?: string;
  partyId?: number;
  partyName: string;
  partyPhone?: string;
  items: SaleReturnItem[];
  subtotal: number;
  taxTotal?: number;
  grandTotal: number;
  refundAmount?: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type CashTransactionSource =
  | 'POS_SALE'
  | 'SALE_INVOICE'
  | 'PAYMENT_IN'
  | 'PURCHASE_BILL'
  | 'PAYMENT_OUT'
  | 'EXPENSE'
  | 'BANK_DEPOSIT'
  | 'BANK_WITHDRAWAL'
  | 'SALE_RETURN_REFUND'
  | 'PURCHASE_RETURN_REFUND'
  | 'MANUAL_ADJUSTMENT';

export interface CashAccount {
  id?: number | string;
  tenantId?: string;
  name: string;
  openingBalance: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CashTransaction {
  id?: number | string;
  cashAccountId?: number | string;
  tenantId?: string;
  type: 'IN' | 'OUT';
  amount: number;
  source: CashTransactionSource;
  referenceId?: string;
  description?: string;
  transactionDate?: string;
  createdAt?: string;
  runningBalance?: number;
}





