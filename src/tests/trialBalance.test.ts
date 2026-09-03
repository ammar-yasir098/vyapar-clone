import { calculateTrialBalance } from '../services/reportsService';
import { Invoice, PurchaseBill, Expense, Party, Item, SaleReturn } from '../types';

console.log('>>> Running Trial Balance Calculation Tests...');

// 1. Mock Data Setup
const mockInvoices: Invoice[] = [
  {
    id: 1,
    invoiceId: 'inv-1',
    tenantId: 'tenant-1',
    invoiceNumber: 'INV-001',
    invoiceDate: '2026-09-02',
    grandTotal: 10000,
    taxTotal: 500,
    receivedAmount: 10000,
    paymentStatus: 'PAID',
    items: []
  },
  {
    id: 2,
    invoiceId: 'inv-2',
    tenantId: 'tenant-1',
    invoiceNumber: 'INV-002',
    invoiceDate: '2026-09-03',
    grandTotal: 5000,
    taxTotal: 250,
    receivedAmount: 0,
    paymentStatus: 'UNPAID',
    items: []
  }
] as unknown as Invoice[];

const mockSaleReturns: SaleReturn[] = [
  {
    id: 1,
    tenantId: 'tenant-1',
    creditNoteNumber: 'CR-001',
    returnDate: '2026-09-03',
    grandTotal: 1000,
    taxTotal: 50,
    items: []
  }
] as unknown as SaleReturn[];

const mockPurchaseBills: PurchaseBill[] = [
  {
    id: 1,
    billId: 'bill-1',
    tenantId: 'tenant-1',
    billNumber: 'PB-001',
    billDate: '2026-09-02',
    grandTotal: 8000,
    taxTotal: 400,
    paidAmount: 8000,
    paymentStatus: 'PAID',
    items: []
  }
] as unknown as PurchaseBill[];

const mockExpenses: Expense[] = [
  {
    id: 1,
    tenantId: 'tenant-1',
    expenseNumber: 'EXP-001',
    expenseDate: '2026-09-02',
    categoryName: 'Shop Rent',
    amount: 2000,
    paymentMode: 'CASH'
  },
  {
    id: 2,
    tenantId: 'tenant-1',
    expenseNumber: 'EXP-002',
    expenseDate: '2026-09-03',
    categoryName: 'Electricity',
    amount: 1000,
    paymentMode: 'CASH'
  }
] as unknown as Expense[];

const mockParties: Party[] = [
  {
    id: 1,
    tenantId: 'tenant-1',
    name: 'Credit Customer',
    type: 'CUSTOMER',
    currentBalance: 5000,
    balanceType: 'RECEIVABLE'
  },
  {
    id: 2,
    tenantId: 'tenant-1',
    name: 'Raw Material Supplier',
    type: 'SUPPLIER',
    currentBalance: 3000,
    balanceType: 'PAYABLE'
  }
] as unknown as Party[];

const mockItems: Item[] = [
  {
    id: 1,
    tenantId: 'tenant-1',
    name: 'Item A',
    currentStock: 20,
    purchasePrice: 150
  },
  {
    id: 2,
    tenantId: 'tenant-1',
    name: 'Item B',
    currentStock: 10,
    purchasePrice: 200
  }
] as unknown as Item[];

// 2. Execute Trial Balance
const tbReport = calculateTrialBalance(
  mockInvoices,
  mockPurchaseBills,
  [],
  [],
  mockExpenses,
  mockSaleReturns,
  [],
  mockParties,
  mockItems,
  [],
  { startDate: '2026-09-01', endDate: '2026-09-30' }
);

// 3. Assertions
console.log(`Total Debits: Rs ${tbReport.totalDebits.toFixed(2)} | Total Credits: Rs ${tbReport.totalCredits.toFixed(2)}`);

if (tbReport.isMatched) {
  console.log('[PASS] Trial Balance is perfectly matched (Debits == Credits)');
} else {
  console.error(`[FAIL] Trial Balance mismatch! Difference: ${tbReport.difference}`);
  process.exit(1);
}

// Net Sales check: 15000 - 1000 = 14000
const salesAcc = tbReport.accounts.find(a => a.id === 'acc-sales');
if (salesAcc && salesAcc.credit === 14000) {
  console.log('[PASS] Sales Revenue Account correctly reflects net sales of Rs 14,000');
} else {
  console.error(`[FAIL] Expected Net Sales 14000, got ${salesAcc?.credit}`);
  process.exit(1);
}

// Purchases check: 8000
const purchAcc = tbReport.accounts.find(a => a.id === 'acc-purchases');
if (purchAcc && purchAcc.debit === 8000) {
  console.log('[PASS] Purchases Account correctly reflects Rs 8,000');
} else {
  console.error(`[FAIL] Expected Purchases 8000, got ${purchAcc?.debit}`);
  process.exit(1);
}

// Expenses check: Rent 2000, Electricity 1000
const rentAcc = tbReport.accounts.find(a => a.id.includes('rent'));
const elecAcc = tbReport.accounts.find(a => a.id.includes('electricity'));
if (rentAcc?.debit === 2000 && elecAcc?.debit === 1000) {
  console.log('[PASS] Operating Expenses correctly categorized under distinct accounts');
} else {
  console.error('[FAIL] Expense accounts incorrect');
  process.exit(1);
}

// Stock check: (20*150) + (10*200) = 3000 + 2000 = 5000
const stockAcc = tbReport.accounts.find(a => a.id === 'acc-inventory');
if (stockAcc && stockAcc.debit === 5000) {
  console.log('[PASS] Inventory valuation correctly reflects Rs 5,000');
} else {
  console.error(`[FAIL] Expected Inventory 5000, got ${stockAcc?.debit}`);
  process.exit(1);
}

console.log('All Trial Balance tests passed successfully!\n');
