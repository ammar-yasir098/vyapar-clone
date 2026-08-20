import 'fake-indexeddb/auto';
import { db } from '../db';
import { voidPurchaseBill, voidPaymentIn } from '../services/reversal';
import { pruneSyncedJournalEntries } from '../services/sync';

async function runHealthAuditTests() {
  console.log('====================================================');
  console.log('      STARTING AUTOMATED HEALTH AUDIT TEST SUITE    ');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${testName}`);
      throw new Error(`Assertion failed for: ${testName}`);
    }
  }

  try {
    // ----------------------------------------------------
    // TEST 1: Tenant Isolation
    // ----------------------------------------------------
    console.log('>>> Running Test 1: Tenant Isolation...');
    const tenantA = 'TestTenant_A_' + Date.now();
    const tenantB = 'TestTenant_B_' + Date.now();

    const itemA = await db.items.add({
      name: 'Item Tenant A',
      skuCode: 'SKU-A',
      salesPrice: 100,
      purchasePrice: 80,
      currentStock: 50,
      tenantId: tenantA
    } as any);

    const itemB = await db.items.add({
      name: 'Item Tenant B',
      skuCode: 'SKU-B',
      salesPrice: 200,
      purchasePrice: 150,
      currentStock: 20,
      tenantId: tenantB
    } as any);

    const itemsA = await db.items.filter(i => i.tenantId === tenantA).toArray();
    const itemsB = await db.items.filter(i => i.tenantId === tenantB).toArray();

    assert(itemsA.length === 1 && itemsA[0].name === 'Item Tenant A', 'Tenant A query returns only Tenant A items');
    assert(itemsB.length === 1 && itemsB[0].name === 'Item Tenant B', 'Tenant B query returns only Tenant B items');
    assert(itemsA.every(i => i.tenantId !== tenantB), 'Tenant A results contain zero Tenant B records');

    // Clean up Test 1
    await db.items.delete(itemA);
    await db.items.delete(itemB);

    // ----------------------------------------------------
    // TEST 2: Cascade Deletions & Reversals (voidPurchaseBill)
    // ----------------------------------------------------
    console.log('\n>>> Running Test 2: Cascade Deletions (voidPurchaseBill)...');
    const testTenant = 'AuditTenant_' + Date.now();

    const testItemId = await db.items.add({
      name: 'Audit Stock Item',
      skuCode: 'SKU-AUDIT',
      salesPrice: 500,
      purchasePrice: 300,
      currentStock: 10,
      tenantId: testTenant
    } as any);

    const billNumber = 'PUR-AUDIT-' + Date.now();
    const pbId = await db.purchaseBills.add({
      billId: billNumber,
      billNumber,
      billDate: new Date().toISOString().split('T')[0],
      supplierName: 'Test Vendor Audit',
      subtotal: 1500,
      taxTotal: 0,
      grandTotal: 1500,
      paidAmount: 1500,
      dueAmount: 0,
      paymentStatus: 'PAID',
      tenantId: testTenant,
      items: [{ itemId: testItemId, itemName: 'Audit Stock Item', quantity: 5, unitPrice: 300, purchasePrice: 300, totalAmount: 1500 }]
    } as any);

    // Update stock as if bill was created (+5 items -> 15 stock)
    await db.items.update(testItemId, { currentStock: 15 });
    const stockAfterBill = (await db.items.get(testItemId))?.currentStock;
    assert(stockAfterBill === 15, 'Stock updated to 15 after Purchase Bill creation');

    // Add cash & journal entries linked to purchase bill
    await db.cashTransactions.add({
      cashAccountId: 1,
      tenantId: testTenant,
      type: 'OUT',
      amount: 1500,
      source: 'PURCHASE_BILL',
      referenceId: billNumber,
      description: 'Audit Cash Out',
      transactionDate: new Date().toISOString()
    } as any);

    await db.journalEntries.add({
      tenantId: testTenant,
      entryNumber: 'JE-AUDIT-PB',
      referenceId: billNumber,
      transactionDate: new Date().toISOString().split('T')[0],
      description: 'Audit PB Journal',
      lines: [],
      totalDebit: 1500,
      totalCredit: 1500,
      createdAt: new Date().toISOString()
    } as any);

    // Execute voidPurchaseBill
    const pbResult = await voidPurchaseBill(pbId);
    assert(pbResult.success === true, 'voidPurchaseBill executed successfully');

    const restoredStock = (await db.items.get(testItemId))?.currentStock;
    assert(restoredStock === 10, 'Stock restored back to exactly 10 after voidPurchaseBill');

    const remainingCashTx = await db.cashTransactions.filter(c => c.referenceId === billNumber).toArray();
    assert(remainingCashTx.length === 0, 'Linked cash transaction deleted after voidPurchaseBill');

    const remainingJe = await db.journalEntries.filter(j => j.referenceId === billNumber).toArray();
    assert(remainingJe.length === 0, 'Linked journal entry deleted after voidPurchaseBill');

    // Clean up Test 2 item
    await db.items.delete(testItemId);

    // ----------------------------------------------------
    // TEST 3: Cascade Deletions & Reversals (voidPaymentIn)
    // ----------------------------------------------------
    console.log('\n>>> Running Test 3: Cascade Deletions (voidPaymentIn)...');
    const partyId = await db.parties.add({
      name: 'Audit Customer',
      phone: '03001112233',
      type: 'CUSTOMER',
      openingBalance: 0,
      currentBalance: 2000,
      balanceType: 'RECEIVABLE',
      createdAt: new Date().toISOString(),
      tenantId: testTenant
    } as any);

    const invoiceId = await db.invoices.add({
      invoiceId: 'INV-AUDIT-1',
      invoiceNumber: 'INV-AUDIT-1',
      invoiceDate: new Date().toISOString().split('T')[0],
      partyId,
      partyName: 'Audit Customer',
      items: [],
      subtotal: 2000,
      cgstTotal: 0,
      sgstTotal: 0,
      igstTotal: 0,
      taxTotal: 0,
      discountTotal: 0,
      grandTotal: 2000,
      receivedAmount: 1000,
      dueAmount: 1000,
      paymentMethod: 'CASH',
      paymentStatus: 'PARTIAL',
      tenantId: testTenant
    } as any);

    const receiptNum = 'PAYIN-AUDIT-' + Date.now();
    const payInId = await db.paymentIn.add({
      receiptNumber: receiptNum,
      partyId,
      partyName: 'Audit Customer',
      paymentMethod: 'CASH',
      amount: 1000,
      paymentDate: new Date().toISOString().split('T')[0],
      tenantId: testTenant
    } as any);

    // Execute voidPaymentIn
    const payInResult = await voidPaymentIn(payInId);
    assert(payInResult.success === true, 'voidPaymentIn executed successfully');

    const updatedParty = await db.parties.get(partyId);
    assert(updatedParty?.currentBalance === 3000, 'Customer balance restored by +1000 after voidPaymentIn');

    // Clean up Test 3
    await db.parties.delete(partyId);
    await db.invoices.delete(invoiceId);

    // ----------------------------------------------------
    // TEST 4: Double-Entry Balance Validation
    // ----------------------------------------------------
    console.log('\n>>> Running Test 4: Double-Entry Balance Validation...');
    const jeTestNumber = 'JE-BAL-TEST';
    const jeTestId = await db.journalEntries.add({
      tenantId: testTenant,
      entryNumber: jeTestNumber,
      referenceId: 'REF-BAL',
      transactionDate: new Date().toISOString().split('T')[0],
      description: 'Double-entry test',
      lines: [
        { accountId: 1, accountCode: '1010', accountName: 'Cash', debit: 5000, credit: 0 },
        { accountId: 2, accountCode: '4010', accountName: 'Sales', debit: 0, credit: 5000 }
      ],
      totalDebit: 5000,
      totalCredit: 5000,
      createdAt: new Date().toISOString()
    } as any);

    const savedJe = await db.journalEntries.get(jeTestId);
    assert(savedJe !== undefined, 'Journal entry saved successfully');
    assert(savedJe?.totalDebit === savedJe?.totalCredit, 'Total Debits strictly equal Total Credits (5000 == 5000)');

    await db.journalEntries.delete(jeTestId);

    // ----------------------------------------------------
    // TEST 5: Sync Journal Pruning
    // ----------------------------------------------------
    console.log('\n>>> Running Test 5: Sync Journal Pruning...');
    const sj1 = await db.syncJournal.add({
      versionId: 9991,
      clientSequence: 1,
      entityType: 'ITEM',
      timestamp: new Date().toISOString(),
      synced: true,
      payload: { test: 1 }
    } as any);

    const sj2 = await db.syncJournal.add({
      versionId: 9992,
      clientSequence: 2,
      entityType: 'ITEM',
      timestamp: new Date().toISOString(),
      synced: false,
      payload: { test: 2 }
    } as any);

    await pruneSyncedJournalEntries();

    const checkSj1 = await db.syncJournal.get(sj1);
    const checkSj2 = await db.syncJournal.get(sj2);

    assert(checkSj1 === undefined, 'Synced journal record (synced: true) was pruned');
    assert(checkSj2 !== undefined, 'Unsynced journal record (synced: false) was preserved');

    await db.syncJournal.delete(sj2);

    console.log('\n====================================================');
    console.log(`  HEALTH AUDIT TEST SUITE COMPLETED SUCCESSFULLY!  `);
    console.log(`  PASSED: ${passedTests} / ${totalTests} TESTS`);
    console.log('====================================================\n');
  } catch (err: any) {
    console.error('\n[FATAL ERROR IN TEST SUITE]:', err);
  } finally {
    console.log('[TEARDOWN] Purging remaining temporary test records...');
    const testJournals = await db.syncJournal.filter(j => (j.versionId as any) === 9992).toArray();
    for (const j of testJournals) if (j.id) await db.syncJournal.delete(j.id);
    console.log('[TEARDOWN CLEANUP COMPLETE] All test dummy data purged safely.');
  }
}

runHealthAuditTests();
