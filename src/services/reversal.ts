import { db } from '../db';
import { syncManager } from './sync';
import { roundCurrency } from '../utils/edgeCaseHelpers';

/**
 * Safely voids a Payment-In receipt and performs full cascade rollbacks across:
 * - Customer receivable balance
 * - Invoice due amounts & payment statuses
 * - Cash transactions ledger
 */
export async function voidPaymentIn(paymentInId: number | string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const numericId = typeof paymentInId === 'number' ? paymentInId : parseInt(paymentInId, 10);
    const payment = await db.paymentIn.get(numericId) || await db.paymentIn.filter(p => String(p.id) === String(paymentInId) || p.receiptNumber === String(paymentInId)).first();
    
    if (!payment) {
      return { success: false, error: 'Payment-In record not found' };
    }

    const tenantId = payment.tenantId || (typeof localStorage !== 'undefined' ? localStorage.getItem('vyapar_current_tenant') : null) || 'default-tenant';
    const amount = roundCurrency(payment.amount || 0);

    // 1. Revert Customer Balance (increase receivable balance by voided amount)
    if (payment.partyId) {
      const party = await db.parties.get(payment.partyId);
      if (party) {
        const currentBal = roundCurrency(party.currentBalance || 0);
        const restoredBal = roundCurrency(currentBal + amount);
        await db.parties.update(party.id!, { currentBalance: restoredBal });
        await syncManager.logMutation('PARTY', String(party.id), 'UPDATE', { id: party.id, currentBalance: restoredBal });
      }
    }

    // 2. Revert allocation to Invoices (restore due amounts for party invoices, newest first)
    if (payment.partyId || payment.partyName) {
      const allInvoices = await db.invoices.filter(i => (i.tenantId || 'default-tenant') === tenantId).toArray();
      const partyInvoices = allInvoices.filter(inv =>
        (payment.partyId !== undefined && inv.partyId === payment.partyId) ||
        (inv.partyName && inv.partyName.trim().toLowerCase() === (payment.partyName || '').trim().toLowerCase())
      ).sort((a, b) => new Date(b.invoiceDate || 0).getTime() - new Date(a.invoiceDate || 0).getTime());

      let remainingRevert = amount;
      for (const inv of partyInvoices) {
        if (remainingRevert <= 0) break;
        const grand = roundCurrency(inv.grandTotal || 0);
        const currentRec = roundCurrency(inv.receivedAmount || 0);
        const currentDue = roundCurrency(inv.dueAmount !== undefined ? inv.dueAmount : Math.max(0, grand - currentRec));

        const revertAmt = Math.min(currentRec, remainingRevert);
        if (revertAmt > 0) {
          remainingRevert = roundCurrency(remainingRevert - revertAmt);
          const newRec = roundCurrency(currentRec - revertAmt);
          const newDue = roundCurrency(currentDue + revertAmt);
          const newStatus = newDue >= grand ? 'UNPAID' : (newRec > 0 ? 'PARTIAL' : 'UNPAID');

          if (inv.id) {
            await db.invoices.update(inv.id, {
              receivedAmount: newRec,
              dueAmount: newDue,
              paymentStatus: newStatus
            });
            await syncManager.logMutation('INVOICE', inv.invoiceId || String(inv.id), 'UPDATE', {
              ...inv,
              receivedAmount: newRec,
              dueAmount: newDue,
              paymentStatus: newStatus
            });
          }
        }
      }
    }

    // 3. Delete linked Cash Transactions
    const linkedCashTxns = await db.cashTransactions
      .filter(ct => ct.referenceId === payment.receiptNumber || (ct.source === 'PAYMENT_IN' && ct.amount === amount))
      .toArray();
    for (const ct of linkedCashTxns) {
      if (ct.id) {
        await db.cashTransactions.delete(Number(ct.id));
        await syncManager.logMutation('CASH_TRANSACTION', String(ct.referenceId || ct.id), 'DELETE', { id: ct.id });
      }
    }

    // 4. Delete PaymentIn record itself
    if (payment.id) {
      await db.paymentIn.delete(payment.id);
      await syncManager.logMutation('PAYMENT_IN', payment.receiptNumber, 'DELETE', { id: payment.id });
    }

    return { success: true, message: `Payment-In ${payment.receiptNumber} successfully voided and rolled back.` };
  } catch (err: any) {
    console.error('Error voiding Payment-In:', err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Safely voids a Payment-Out voucher and performs full cascade rollbacks across:
 * - Supplier payable balance
 * - Purchase Bill due amounts & payment statuses
 * - Cash transactions ledger
 */
export async function voidPaymentOut(paymentOutId: number | string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const numericId = typeof paymentOutId === 'number' ? paymentOutId : parseInt(paymentOutId, 10);
    const payment = await db.paymentOut.get(numericId) || await db.paymentOut.filter(p => String(p.id) === String(paymentOutId) || p.receiptNumber === String(paymentOutId)).first();
    
    if (!payment) {
      return { success: false, error: 'Payment-Out record not found' };
    }

    const tenantId = payment.tenantId || (typeof localStorage !== 'undefined' ? localStorage.getItem('vyapar_current_tenant') : null) || 'default-tenant';
    const amount = roundCurrency(payment.amount || 0);

    // 1. Revert Supplier Balance (increase payable balance by voided amount)
    if (payment.partyId) {
      const party = await db.parties.get(payment.partyId);
      if (party) {
        const currentBal = roundCurrency(party.currentBalance || 0);
        const restoredBal = roundCurrency(currentBal + amount);
        await db.parties.update(party.id!, { currentBalance: restoredBal });
        await syncManager.logMutation('PARTY', String(party.id), 'UPDATE', { id: party.id, currentBalance: restoredBal });
      }
    }

    // 2. Revert allocation to Purchase Bills (restore due amounts for supplier bills, newest first)
    if (payment.partyId || payment.partyName) {
      const allBills = await db.purchaseBills.filter(b => (b.tenantId || 'default-tenant') === tenantId).toArray();
      const supplierBills = allBills.filter(b =>
        (payment.partyId !== undefined && b.supplierId === payment.partyId) ||
        (b.supplierName && b.supplierName.trim().toLowerCase() === (payment.partyName || '').trim().toLowerCase())
      ).sort((a, b) => new Date(b.billDate || 0).getTime() - new Date(a.billDate || 0).getTime());

      let remainingRevert = amount;
      for (const bill of supplierBills) {
        if (remainingRevert <= 0) break;
        const grand = roundCurrency(bill.grandTotal || 0);
        const currentPaid = roundCurrency(bill.paidAmount || 0);
        const currentDue = roundCurrency(bill.dueAmount !== undefined ? bill.dueAmount : Math.max(0, grand - currentPaid));

        const revertAmt = Math.min(currentPaid, remainingRevert);
        if (revertAmt > 0) {
          remainingRevert = roundCurrency(remainingRevert - revertAmt);
          const newPaid = roundCurrency(currentPaid - revertAmt);
          const newDue = roundCurrency(currentDue + revertAmt);
          const newStatus = newDue >= grand ? 'UNPAID' : (newPaid > 0 ? 'PARTIAL' : 'UNPAID');

          if (bill.id) {
            await db.purchaseBills.update(bill.id, {
              paidAmount: newPaid,
              dueAmount: newDue,
              paymentStatus: newStatus
            });
            await syncManager.logMutation('PURCHASE_BILL', bill.billId || String(bill.id), 'UPDATE', {
              ...bill,
              paidAmount: newPaid,
              dueAmount: newDue,
              paymentStatus: newStatus
            });
          }
        }
      }
    }

    // 3. Delete linked Cash Transactions
    const linkedCashTxns = await db.cashTransactions
      .filter(ct => ct.referenceId === payment.receiptNumber || (ct.source === 'PAYMENT_OUT' && ct.amount === amount))
      .toArray();
    for (const ct of linkedCashTxns) {
      if (ct.id) {
        await db.cashTransactions.delete(Number(ct.id));
        await syncManager.logMutation('CASH_TRANSACTION', String(ct.referenceId || ct.id), 'DELETE', { id: ct.id });
      }
    }

    // 4. Delete PaymentOut record itself
    if (payment.id) {
      await db.paymentOut.delete(payment.id);
      await syncManager.logMutation('PAYMENT_OUT', payment.receiptNumber, 'DELETE', { id: payment.id });
    }

    return { success: true, message: `Payment-Out ${payment.receiptNumber} successfully voided and rolled back.` };
  } catch (err: any) {
    console.error('Error voiding Payment-Out:', err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Safely voids an Operational Expense record and performs cascade rollbacks across:
 * - Cash transactions ledger
 */
export async function voidExpense(expenseId: number | string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const numericId = typeof expenseId === 'number' ? expenseId : parseInt(expenseId, 10);
    const exp = await db.expenses.get(numericId) || await db.expenses.filter(e => String(e.id) === String(expenseId) || e.expenseNumber === String(expenseId)).first();

    if (!exp) {
      return { success: false, error: 'Expense record not found' };
    }

    // 1. Delete linked Cash Transactions
    const linkedCashTxns = await db.cashTransactions
      .filter(ct => ct.referenceId === exp.expenseNumber || (ct.source === 'EXPENSE' && ct.amount === exp.amount))
      .toArray();
    for (const ct of linkedCashTxns) {
      if (ct.id) {
        await db.cashTransactions.delete(Number(ct.id));
        await syncManager.logMutation('CASH_TRANSACTION', String(ct.referenceId || ct.id), 'DELETE', { id: ct.id });
      }
    }

    // 2. Delete Expense record itself
    if (exp.id) {
      await db.expenses.delete(exp.id);
      await syncManager.logMutation('EXPENSE', exp.expenseNumber, 'DELETE', { id: exp.id });
    }

    return { success: true, message: `Expense voucher ${exp.expenseNumber} successfully deleted.` };
  } catch (err: any) {
    console.error('Error voiding Expense:', err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Safely voids a Purchase Bill and performs full cascade rollbacks across:
 * - Inventory stock levels (deducts items added by the bill)
 * - Supplier payable balance
 * - Cash transactions ledger (if paid in cash)
 */
export async function voidPurchaseBill(purchaseBillId: number | string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const numericId = typeof purchaseBillId === 'number' ? purchaseBillId : parseInt(purchaseBillId, 10);
    const bill = await db.purchaseBills.get(numericId) || await db.purchaseBills.filter(b => String(b.id) === String(purchaseBillId) || b.billNumber === String(purchaseBillId) || b.billId === String(purchaseBillId)).first();

    if (!bill) {
      return { success: false, error: 'Purchase bill record not found' };
    }

    // 1. Revert Inventory Stock Levels (deduct added stock)
    if (bill.items && Array.isArray(bill.items)) {
      for (const line of bill.items) {
        if (line.itemId) {
          const item = await db.items.get(line.itemId);
          if (item) {
            const currentStock = roundCurrency(item.currentStock || 0);
            const qty = roundCurrency(line.quantity || 1);
            const revertedStock = Math.max(0, roundCurrency(currentStock - qty));
            await db.items.update(item.id!, { currentStock: revertedStock, updatedAt: new Date().toISOString() });
            await syncManager.logMutation('ITEM', String(item.id), 'UPDATE', { id: item.id, currentStock: revertedStock });
          }
        }
      }
    }

    // 2. Revert Supplier Payable Balance
    if (bill.supplierId) {
      const party = await db.parties.get(bill.supplierId);
      if (party) {
        const curBal = roundCurrency(party.currentBalance || 0);
        const dueAmt = roundCurrency(bill.dueAmount !== undefined ? bill.dueAmount : (bill.grandTotal - (bill.paidAmount || 0)));
        const revertedBal = Math.max(0, roundCurrency(curBal - dueAmt));
        await db.parties.update(party.id!, { currentBalance: revertedBal });
        await syncManager.logMutation('PARTY', String(party.id), 'UPDATE', { id: party.id, currentBalance: revertedBal });
      }
    }

    // 3. Delete linked Cash Transactions
    const linkedCashTxns = await db.cashTransactions
      .filter(ct => ct.referenceId === bill.billNumber || (ct.source === 'PURCHASE_BILL' && ct.referenceId === bill.billNumber))
      .toArray();
    for (const ct of linkedCashTxns) {
      if (ct.id) {
        await db.cashTransactions.delete(Number(ct.id));
        await syncManager.logMutation('CASH_TRANSACTION', String(ct.referenceId || ct.id), 'DELETE', { id: ct.id });
      }
    }

    // 4. Delete PurchaseBill record itself
    if (bill.id) {
      await db.purchaseBills.delete(bill.id);
      await syncManager.logMutation('PURCHASE_BILL', bill.billId || String(bill.id), 'DELETE', { id: bill.id });
    }

    return { success: true, message: `Purchase Bill ${bill.billNumber} successfully voided and stock rolled back.` };
  } catch (err: any) {
    console.error('Error voiding Purchase Bill:', err);
    return { success: false, error: err.message || String(err) };
  }
}
