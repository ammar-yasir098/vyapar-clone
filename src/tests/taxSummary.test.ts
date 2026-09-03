import 'fake-indexeddb/auto';
import { calculateTaxSummary } from '../services/reportsService';
import { Invoice, PurchaseBill, SaleReturn } from '../types';

function runTaxSummaryTests() {
  console.log('>>> Running GST Tax Summary Tests...');
  let total = 0;
  let passed = 0;

  function assert(cond: boolean, desc: string) {
    total++;
    if (cond) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      throw new Error(`Failed test: ${desc}`);
    }
  }

  // 1. Basic Output Tax on Invoice
  const mockInvoice: Invoice = {
    invoiceId: 'inv-test-1',
    tenantId: 'test-tenant',
    invoiceNumber: 'INV-001',
    invoiceDate: '2026-09-01',
    partyName: 'Customer A',
    items: [
      {
        itemId: 1,
        itemName: 'Taxed Product 18%',
        hsnSacCode: '1000',
        unitType: 'PCS',
        quantity: 2,
        unitPrice: 1000,
        purchasePrice: 700,
        cgstRate: 9,
        sgstRate: 9,
        igstRate: 0,
        taxAmount: 360,
        discountAmount: 0,
        totalAmount: 2360
      }
    ],
    subtotal: 2000,
    cgstTotal: 180,
    sgstTotal: 180,
    igstTotal: 0,
    taxTotal: 360,
    discountTotal: 0,
    grandTotal: 2360,
    receivedAmount: 2360,
    dueAmount: 0,
    paymentStatus: 'PAID',
    paymentMethod: 'CASH',
    createdAt: '2026-09-01T10:00:00Z',
    syncStatus: 'SYNCED'
  };

  const report1 = calculateTaxSummary([mockInvoice], [], { startDate: '2026-09-01', endDate: '2026-09-30' });
  assert(report1.totalOutputTax === 360, 'Output tax is 360 for 18% slab on 2000 taxable');
  assert(report1.slabs.find(s => s.rate === 18)?.taxableSales === 2000, 'Taxable sales for 18% slab is 2000');
  assert(report1.netTaxPayable === 360, 'Net payable is 360 when no purchases exist');

  // 2. Input Tax on Purchase Bill
  const mockBill: PurchaseBill = {
    billId: 'pb-test-1',
    tenantId: 'test-tenant',
    billNumber: 'BILL-001',
    billDate: '2026-09-02',
    supplierName: 'Vendor X',
    items: [
      {
        itemId: 2,
        itemName: 'Raw Material 18%',
        quantity: 1,
        unitPrice: 1000,
        purchasePrice: 1000,
        cgstRate: 9,
        sgstRate: 9,
        igstRate: 0,
        taxAmount: 180,
        totalAmount: 1180
      }
    ],
    subtotal: 1000,
    taxTotal: 180,
    grandTotal: 1180
  };

  const report2 = calculateTaxSummary([mockInvoice], [mockBill], { startDate: '2026-09-01', endDate: '2026-09-30' });
  assert(report2.totalInputTax === 180, 'Input tax is 180');
  assert(report2.netTaxPayable === 180, 'Net payable is 360 - 180 = 180');

  // 3. Sale Return (Credit Note) deduction
  const mockSaleReturn: SaleReturn = {
    returnId: 'sr-test-1',
    tenantId: 'test-tenant',
    creditNoteNumber: 'CN-001',
    returnDate: '2026-09-03',
    partyName: 'Customer A',
    items: [
      {
        itemId: 1,
        itemName: 'Taxed Product 18%',
        returnQuantity: 1,
        unitPrice: 1000,
        taxAmount: 180,
        totalAmount: 1180
      }
    ],
    subtotal: 1000,
    taxTotal: 180,
    grandTotal: 1180
  };

  const report3 = calculateTaxSummary(
    [mockInvoice],
    [mockBill],
    { startDate: '2026-09-01', endDate: '2026-09-30' },
    [mockSaleReturn],
    []
  );
  assert(report3.totalOutputTax === 180, 'Output tax reduced from 360 to 180 after 1 item returned');
  assert(report3.netTaxPayable === 0, 'Net payable is 180 (Output) - 180 (Input) = 0');
  assert(report3.slabs.find(s => s.rate === 18)?.taxableSales === 1000, 'Taxable sales reduced to 1000 after return');

  console.log(`\nAll ${passed}/${total} GST Tax Summary tests passed successfully!`);
}

runTaxSummaryTests();
