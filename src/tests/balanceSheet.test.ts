import { calculateBalanceSheet } from '../services/reportsService';
import { Invoice, PurchaseBill, Expense, Party, Item, SaleReturn } from '../types';

console.log('>>> Running Balance Sheet Calculation Tests...');

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
  }
] as unknown as Invoice[];

const mockPurchaseBills: PurchaseBill[] = [
  {
    id: 1,
    billId: 'bill-1',
    tenantId: 'tenant-1',
    billNumber: 'PB-001',
    billDate: '2026-09-02',
    grandTotal: 6000,
    taxTotal: 300,
    paidAmount: 6000,
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
    categoryName: 'General Store Overhead',
    amount: 1000,
    paymentMode: 'CASH'
  }
] as unknown as Expense[];

const mockParties: Party[] = [
  {
    id: 1,
    tenantId: 'tenant-1',
    name: 'Customer Due',
    type: 'CUSTOMER',
    currentBalance: 2000,
    balanceType: 'RECEIVABLE'
  },
  {
    id: 2,
    tenantId: 'tenant-1',
    name: 'Supplier Payable',
    type: 'SUPPLIER',
    currentBalance: 1500,
    balanceType: 'PAYABLE'
  }
] as unknown as Party[];

const mockItems: Item[] = [
  {
    id: 1,
    tenantId: 'tenant-1',
    name: 'Inventory Stock Item',
    currentStock: 50,
    purchasePrice: 100
  }
] as unknown as Item[];

// 2. Execute Balance Sheet
const bsReport = calculateBalanceSheet(
  mockInvoices,
  mockPurchaseBills,
  [],
  [],
  mockExpenses,
  [],
  [],
  mockParties,
  mockItems,
  [],
  '2026-09-30'
);

console.log(`Total Assets: Rs ${bsReport.assets.totalAssets.toFixed(2)} | Total Liab + Equity: Rs ${bsReport.liabilitiesAndEquity.totalLiabilitiesAndEquity.toFixed(2)}`);

// 3. Assertions
if (bsReport.isBalanced) {
  console.log('[PASS] Balance Sheet equation holds: Total Assets == Total Liabilities + Equity');
} else {
  console.error(`[FAIL] Balance Sheet not balanced! Difference: ${bsReport.difference}`);
  process.exit(1);
}

// Cash: +10,000 (sale) - 6,000 (purchase) - 1,000 (expense) = 3,000
const cashItem = bsReport.assets.currentAssets.find(a => a.id === 'asset-cash');
if (cashItem && cashItem.amount === 3000) {
  console.log('[PASS] Cash in hand is accurately computed at Rs 3,000');
} else {
  console.error(`[FAIL] Expected Cash 3000, got ${cashItem?.amount}`);
  process.exit(1);
}

// Inventory: 50 * 100 = 5000
const invItem = bsReport.assets.currentAssets.find(a => a.id === 'asset-stock');
if (invItem && invItem.amount === 5000) {
  console.log('[PASS] Stock on Hand is accurately computed at Rs 5,000');
} else {
  console.error(`[FAIL] Expected Stock 5000, got ${invItem?.amount}`);
  process.exit(1);
}

// Accounts Receivable: 2000
const arItem = bsReport.assets.currentAssets.find(a => a.id === 'asset-debtors');
if (arItem && arItem.amount === 2000) {
  console.log('[PASS] Accounts Receivable is accurately computed at Rs 2,000');
} else {
  console.error(`[FAIL] Expected Debtors 2000, got ${arItem?.amount}`);
  process.exit(1);
}

// Total Assets = 3000 (Cash) + 5000 (Stock) + 2000 (AR) = 10,000
if (bsReport.assets.totalAssets === 10000) {
  console.log('[PASS] Total Assets is exactly Rs 10,000');
} else {
  console.error(`[FAIL] Expected Total Assets 10000, got ${bsReport.assets.totalAssets}`);
  process.exit(1);
}

// Liabilities: 1500 (Creditors)
const apItem = bsReport.liabilitiesAndEquity.currentLiabilities.find(l => l.id === 'liab-creditors');
if (apItem && apItem.amount === 1500) {
  console.log('[PASS] Accounts Payable is accurately computed at Rs 1,500');
} else {
  console.error(`[FAIL] Expected Creditors 1500, got ${apItem?.amount}`);
  process.exit(1);
}

// Net Profit: Sales (10,000) - Purchases (6,000) - Expenses (1,000) = 3,000
if (bsReport.liabilitiesAndEquity.equity.currentPeriodNetProfit === 3000) {
  console.log('[PASS] Current Period Net Profit of Rs 3,000 is transferred to Owner Equity');
} else {
  console.error(`[FAIL] Expected Net Profit 3000, got ${bsReport.liabilitiesAndEquity.equity.currentPeriodNetProfit}`);
  process.exit(1);
}

// Net Worth = Assets (10,000) - Liabilities (1,500) = 8,500
if (bsReport.netWorth === 8500) {
  console.log('[PASS] Net Worth is accurately computed at Rs 8,500');
} else {
  console.error(`[FAIL] Expected Net Worth 8500, got ${bsReport.netWorth}`);
  process.exit(1);
}

console.log('All Balance Sheet tests passed successfully!\n');
