import { calculateCashFlow } from '../services/reportsService';
import { Invoice, PurchaseBill, PaymentIn, PaymentOut, Expense, SaleReturn, CashTransaction } from '../types';

console.log('>>> Running Cash Flow Calculation Tests...');

// 1. Inflow Test: Cash sale and payment in
const sampleInvoices = [
  {
    id: 1,
    invoiceId: 'inv-1',
    tenantId: 'tenant-1',
    invoiceNumber: 'INV-101',
    invoiceDate: '2026-09-02',
    partyName: 'Retail Buyer',
    subtotal: 5000,
    taxTotal: 0,
    grandTotal: 5000,
    receivedAmount: 5000,
    dueAmount: 0,
    paymentStatus: 'PAID',
    paymentMethod: 'CASH',
    items: []
  },
  {
    id: 2,
    invoiceId: 'inv-2',
    tenantId: 'tenant-1',
    invoiceNumber: 'INV-102',
    invoiceDate: '2026-09-03',
    partyName: 'Credit Buyer',
    subtotal: 3000,
    taxTotal: 0,
    grandTotal: 3000,
    receivedAmount: 1000, // Partial cash received
    dueAmount: 2000,
    paymentStatus: 'PARTIAL',
    paymentMethod: 'CASH',
    items: []
  }
] as unknown as Invoice[];

const samplePaymentsIn = [
  {
    id: 1,
    tenantId: 'tenant-1',
    receiptNumber: 'REC-001',
    paymentDate: '2026-09-04',
    partyName: 'Old Customer',
    amount: 2000,
    paymentMethod: 'DIGITAL / APP',
    createdAt: '2026-09-04T10:00:00Z'
  }
] as unknown as PaymentIn[];

// Outflows
const samplePurchases = [
  {
    id: 1,
    billId: 'bill-1',
    tenantId: 'tenant-1',
    billNumber: 'PB-201',
    billDate: '2026-09-02',
    supplierName: 'Main Supplier',
    subtotal: 3000,
    taxTotal: 0,
    grandTotal: 3000,
    paidAmount: 3000,
    dueAmount: 0,
    paymentStatus: 'PAID',
    paymentMethod: 'CASH',
    items: []
  }
] as unknown as PurchaseBill[];

const sampleExpenses = [
  {
    id: 1,
    tenantId: 'tenant-1',
    expenseNumber: 'EXP-501',
    expenseDate: '2026-09-03',
    categoryName: 'Shop Rent',
    amount: 1500,
    paymentMode: 'CASH',
    createdAt: '2026-09-03T12:00:00Z'
  }
] as unknown as Expense[];

const report = calculateCashFlow(
  sampleInvoices,
  samplePurchases,
  samplePaymentsIn,
  [],
  sampleExpenses,
  [],
  [],
  { startDate: '2026-09-01', endDate: '2026-09-30' },
  1000 // Initial opening cash
);

// Assertions
// Inflows: 5000 (INV-101) + 1000 (INV-102 received) + 2000 (REC-001) = 8000
if (report.totalInflows === 8000) {
  console.log('[PASS] Total Inflows is exactly Rs 8,000');
} else {
  console.error(`[FAIL] Expected Inflows 8000, got ${report.totalInflows}`);
  process.exit(1);
}

// Outflows: 3000 (PB-201) + 1500 (EXP-501) = 4500
if (report.totalOutflows === 4500) {
  console.log('[PASS] Total Outflows is exactly Rs 4,500');
} else {
  console.error(`[FAIL] Expected Outflows 4500, got ${report.totalOutflows}`);
  process.exit(1);
}

// Net Cash Flow: 8000 - 4500 = 3500
if (report.netCashFlow === 3500) {
  console.log('[PASS] Net Cash Flow is Rs 3,500');
} else {
  console.error(`[FAIL] Expected Net Flow 3500, got ${report.netCashFlow}`);
  process.exit(1);
}

// Closing Balance: 1000 (Opening) + 3500 (Net Flow) = 4500
if (report.closingBalance === 4500) {
  console.log('[PASS] Closing Balance is Rs 4,500');
} else {
  console.error(`[FAIL] Expected Closing 4500, got ${report.closingBalance}`);
  process.exit(1);
}

// Opening balance date shift test: If startDate is 2026-09-03:
// Prior to 2026-09-03:
// Inflows: 5000 (INV-101 on 2026-09-02)
// Outflows: 3000 (PB-201 on 2026-09-02)
// Prior Net: 5000 - 3000 = +2000
// Opening for 2026-09-03 should be initial (1000) + 2000 = 3000!
const shiftedReport = calculateCashFlow(
  sampleInvoices,
  samplePurchases,
  samplePaymentsIn,
  [],
  sampleExpenses,
  [],
  [],
  { startDate: '2026-09-03', endDate: '2026-09-30' },
  1000
);

if (shiftedReport.openingBalance === 3000) {
  console.log('[PASS] Historical Opening Balance prior to startDate is Rs 3,000');
} else {
  console.error(`[FAIL] Expected Opening 3000, got ${shiftedReport.openingBalance}`);
  process.exit(1);
}

console.log('\nAll Cash Flow calculation tests passed successfully!');
