import { db } from '../db';
import { CashAccount, CashTransaction, CashTransactionSource } from '../types';
import { roundCurrency } from '../utils/edgeCaseHelpers';
import { syncManager } from './sync';
import { checkServerHealth } from './api';

const API_BASE_URL = 'http://localhost:5000/api/v1/cash';

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 1500): Promise<Response> {
  const isOnline = await checkServerHealth(600);
  if (!isOnline) {
    throw new Error('Backend server offline');
  }

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

/**
 * Gets or initializes the local Cash Account in Dexie IndexedDB
 */
export async function getOrCreateLocalCashAccount(tenantId: string): Promise<CashAccount> {
  let acc = await db.cashAccounts.filter(a => a.tenantId === tenantId).first();
  if (!acc) {
    const newId = await db.cashAccounts.add({
      tenantId,
      name: 'Main Cash Drawer',
      openingBalance: 0.00,
      createdAt: new Date().toISOString()
    });
    acc = { id: newId, tenantId, name: 'Main Cash Drawer', openingBalance: 0.00 };
  }
  return acc;
}

/**
 * Cleans up any duplicate cash transactions in local Dexie IndexedDB
 */
export async function deduplicateLocalCashTransactions() {
  try {
    const txns = await db.cashTransactions.toArray();
    const seen = new Set<string>();
    const toDeleteIds: number[] = [];

    const payoutAmounts = new Set<number>();
    for (const t of txns) {
      if (t.source === 'PAYMENT_OUT') {
        payoutAmounts.add(roundCurrency(t.amount));
      }
    }

    for (const t of txns) {
      const ref = t.referenceId;
      const type = t.type;
      const source = t.source;
      const amount = roundCurrency(t.amount);
      const key = ref ? `${ref}-${type}` : `sig-${source}-${amount}-${t.description}`;

      if (source === 'PURCHASE_BILL' && payoutAmounts.has(amount) && t.id) {
        toDeleteIds.push(Number(t.id));
      } else if (seen.has(key) && t.id) {
        toDeleteIds.push(Number(t.id));
      } else {
        seen.add(key);
      }
    }

    if (toDeleteIds.length > 0) {
      await db.cashTransactions.bulkDelete(toDeleteIds);
    }
  } catch (err) {
    console.error('Error deduplicating local cash transactions:', err);
  }
}

/**
 * Aggregates all physical cash movements across Dexie tables for the specified tenantId
 */
export async function getAllAggregatedCashTransactions(tenantId: string): Promise<CashTransaction[]> {
  const activeTenantId = tenantId || localStorage.getItem('vyapar_current_tenant') || 'default-tenant';

  const [
    invoices,
    purchaseBills,
    paymentsIn,
    paymentsOut,
    expenses,
    purchaseReturns,
    saleReturns,
    manualCashTxns
  ] = await Promise.all([
    db.invoices.filter(i => (i.tenantId || 'default-tenant') === activeTenantId).toArray(),
    db.purchaseBills.filter(b => (b.tenantId || 'default-tenant') === activeTenantId).toArray(),
    db.paymentIn.filter(p => (p.tenantId || 'default-tenant') === activeTenantId).toArray(),
    db.paymentOut.filter(p => (p.tenantId || 'default-tenant') === activeTenantId).toArray(),
    db.expenses.filter(e => (e.tenantId || 'default-tenant') === activeTenantId).toArray(),
    db.purchaseReturns.filter(pr => (pr.tenantId || 'default-tenant') === activeTenantId).toArray(),
    db.saleReturns.filter(sr => (sr.tenantId || 'default-tenant') === activeTenantId).toArray(),
    db.cashTransactions.filter(ct => (ct.tenantId || 'default-tenant') === activeTenantId).toArray()
  ]);

  const items: CashTransaction[] = [];

  // 1. Sales (Cash Sales & Cash Payments Received Upfront)
  for (const inv of invoices) {
    const isCredit = (inv.paymentMethod || '').toUpperCase() === 'CREDIT' || inv.paymentStatus === 'UNPAID';
    const grand = Number(inv.grandTotal || 0);
    const rec = isCredit ? 0 : Number(inv.receivedAmount ?? (inv.paymentStatus === 'PAID' ? grand : 0));
    if (rec > 0) {
      items.push({
        id: `cash-sale-${inv.id || inv.invoiceNumber}`,
        cashAccountId: 1,
        tenantId: activeTenantId,
        type: 'IN',
        amount: roundCurrency(rec),
        source: 'POS_SALE' as CashTransactionSource,
        referenceId: inv.invoiceNumber || '',
        description: `POS Cash Sale - ${inv.partyName || 'Retail Customer'}`,
        transactionDate: inv.invoiceDate || inv.createdAt || new Date().toISOString()
      });
    }
  }

  // 2. Payment-In (Cash Receipts)
  for (const p of paymentsIn) {
    const mode = (p.paymentMethod || 'CASH').toUpperCase();
    const amt = Number(p.amount || 0);
    if (mode === 'CASH' && amt > 0) {
      items.push({
        id: `cash-payin-${p.id || p.receiptNumber}`,
        cashAccountId: 1,
        tenantId: activeTenantId,
        type: 'IN',
        amount: roundCurrency(amt),
        source: 'PAYMENT_IN' as CashTransactionSource,
        referenceId: p.receiptNumber || '',
        description: `Payment-In from ${p.partyName || 'Customer'}`,
        transactionDate: p.paymentDate || p.createdAt || new Date().toISOString()
      });
    }
  }

  // 3. Purchase Bills (Cash Purchases)
  for (const b of purchaseBills) {
    const paid = Number(b.paidAmount ?? (b.paymentMethod === 'CASH' ? b.grandTotal : 0));
    if (paid > 0) {
      items.push({
        id: `cash-pur-${b.id || b.billNumber}`,
        cashAccountId: 1,
        tenantId: activeTenantId,
        type: 'OUT',
        amount: roundCurrency(paid),
        source: 'PURCHASE_BILL' as CashTransactionSource,
        referenceId: b.billNumber || '',
        description: `Cash Purchase - ${b.supplierName || 'Supplier'}`,
        transactionDate: b.billDate || b.createdAt || new Date().toISOString()
      });
    }
  }

  // 4. Payment-Out (Cash Payments)
  for (const po of paymentsOut) {
    const mode = (po.paymentMethod || 'CASH').toUpperCase();
    const amt = Number(po.amount || 0);
    if (mode === 'CASH' && amt > 0) {
      items.push({
        id: `cash-payout-${po.id || po.receiptNumber}`,
        cashAccountId: 1,
        tenantId: activeTenantId,
        type: 'OUT',
        amount: roundCurrency(amt),
        source: 'PAYMENT_OUT' as CashTransactionSource,
        referenceId: po.receiptNumber || '',
        description: `Payment-Out to ${po.partyName || 'Supplier'}`,
        transactionDate: po.paymentDate || po.createdAt || new Date().toISOString()
      });
    }
  }

  // 5. Expenses (Cash Expenses)
  for (const e of expenses) {
    const mode = (e.paymentMode || 'CASH').toUpperCase();
    const amt = Number(e.amount || 0);
    if (mode === 'CASH' && amt > 0) {
      items.push({
        id: `cash-exp-${e.id || e.expenseNumber}`,
        cashAccountId: 1,
        tenantId: activeTenantId,
        type: 'OUT',
        amount: roundCurrency(amt),
        source: 'EXPENSE' as CashTransactionSource,
        referenceId: e.expenseNumber || '',
        description: `Cash Expense - ${e.categoryName || 'Miscellaneous'}`,
        transactionDate: e.expenseDate || e.createdAt || new Date().toISOString()
      });
    }
  }

  // 6. Purchase Returns (Cash Refund Received)
  for (const pr of purchaseReturns) {
    const amt = Number(pr.grandTotal || 0);
    if (amt > 0) {
      items.push({
        id: `cash-pur-ret-${pr.id || pr.debitNoteNumber}`,
        cashAccountId: 1,
        tenantId: activeTenantId,
        type: 'IN',
        amount: roundCurrency(amt),
        source: 'PURCHASE_BILL' as CashTransactionSource,
        referenceId: pr.debitNoteNumber || '',
        description: `Purchase Return Refund - ${pr.supplierName || 'Supplier'}`,
        transactionDate: pr.returnDate || pr.createdAt || new Date().toISOString()
      });
    }
  }

  // 7. Sale Returns (Cash Refund Paid Out)
  for (const sr of saleReturns) {
    const amt = Number(sr.refundAmount ?? sr.grandTotal ?? 0);
    if (amt > 0) {
      items.push({
        id: `cash-sale-ret-${sr.id || sr.creditNoteNumber}`,
        cashAccountId: 1,
        tenantId: activeTenantId,
        type: 'OUT',
        amount: roundCurrency(amt),
        source: 'POS_SALE' as CashTransactionSource,
        referenceId: sr.creditNoteNumber || '',
        description: `Sale Return Cash Refund - ${sr.partyName || 'Customer'}`,
        transactionDate: sr.returnDate || sr.createdAt || new Date().toISOString()
      });
    }
  }

  // 8. Manual Cash Adjustments
  for (const ct of manualCashTxns) {
    const isLinkedSource =
      ct.source === 'POS_SALE' ||
      ct.source === 'EXPENSE' ||
      ct.source === 'PAYMENT_IN' ||
      ct.source === 'PAYMENT_OUT' ||
      ct.source === 'PURCHASE_BILL';

    if (isLinkedSource) continue;

    items.push({
      id: `cash-tx-${ct.id}`,
      cashAccountId: ct.cashAccountId || 1,
      tenantId: activeTenantId,
      type: ct.type,
      amount: roundCurrency(ct.amount),
      source: ct.source || 'MANUAL_ADJUSTMENT',
      referenceId: ct.referenceId || '',
      description: ct.description || (ct.type === 'IN' ? 'Cash Increase' : 'Cash Reduction'),
      transactionDate: ct.transactionDate || ct.createdAt || new Date().toISOString()
    });
  }

  return items;
}

/**
 * Calculates current cash balance dynamically (Opening + IN - OUT)
 */
export async function fetchCashBalance(tenantId: string) {
  const activeTenantId = tenantId || localStorage.getItem('vyapar_current_tenant') || 'default-tenant';
  await deduplicateLocalCashTransactions();

  const cashAcc = await getOrCreateLocalCashAccount(activeTenantId);
  const openingBalance = roundCurrency(cashAcc.openingBalance || 0);

  const txns = await getAllAggregatedCashTransactions(activeTenantId);

  let totalIn = 0;
  let totalOut = 0;

  for (const t of txns) {
    const amt = roundCurrency(t.amount);
    if (t.type === 'IN') totalIn = roundCurrency(totalIn + amt);
    else totalOut = roundCurrency(totalOut + amt);
  }

  const currentBalance = roundCurrency(openingBalance + totalIn - totalOut);

  return {
    accountId: Number(cashAcc.id || 0),
    name: cashAcc.name,
    openingBalance,
    totalIn,
    totalOut,
    currentBalance
  };
}

/**
 * Fetches transaction history with calculated running balances strictly from local Dexie IndexedDB
 */
export async function fetchCashTransactions(tenantId: string, filters: any = {}) {
  const activeTenantId = tenantId || localStorage.getItem('vyapar_current_tenant') || 'default-tenant';
  const cashAcc = await getOrCreateLocalCashAccount(activeTenantId);
  const openingBal = roundCurrency(cashAcc.openingBalance || 0);

  let txns = await getAllAggregatedCashTransactions(activeTenantId);

  // Sort ascending to calculate running balances correctly
  txns.sort((a, b) => new Date(a.transactionDate || a.createdAt || '').getTime() - new Date(b.transactionDate || b.createdAt || '').getTime());

  let tracker = openingBal;
  let totalIn = 0;
  let totalOut = 0;

  const processed = txns.map(t => {
    const amt = roundCurrency(t.amount);
    if (t.type === 'IN') {
      tracker = roundCurrency(tracker + amt);
      totalIn = roundCurrency(totalIn + amt);
    } else {
      tracker = roundCurrency(tracker - amt);
      totalOut = roundCurrency(totalOut + amt);
    }
    return { ...t, runningBalance: tracker };
  });

  const latestFirst = [...processed].reverse();

  const filtered = latestFirst.filter(t => {
    if (filters.type && filters.type !== 'ALL' && t.type !== filters.type) return false;
    if (filters.source && filters.source !== 'ALL' && t.source !== filters.source) return false;
    if (filters.startDate && filters.endDate) {
      const txTime = new Date(t.transactionDate || t.createdAt || 0).getTime();
      const sTime = new Date(String(filters.startDate)).getTime();
      const eTime = new Date(String(filters.endDate)).setHours(23, 59, 59, 999);
      if (isNaN(sTime) || isNaN(eTime) || txTime < sTime || txTime > eTime) return false;
    }
    if (filters.search && String(filters.search).trim()) {
      const s = String(filters.search).toLowerCase();
      const matchDesc = (t.description || '').toLowerCase().includes(s);
      const matchRef = (t.referenceId || '').toLowerCase().includes(s);
      const matchSource = (t.source || '').toLowerCase().includes(s);
      if (!matchDesc && !matchRef && !matchSource) return false;
    }
    return true;
  });

  return {
    transactions: filtered,
    openingBalance: openingBal,
    currentBalance: tracker,
    totalIn,
    totalOut,
    page: 1,
    totalPages: 1
  };
}

/**
 * Records a Cash In or Cash Out transaction
 */
export async function recordCashEntry(data: {
  tenantId?: string;
  cashAccountId?: number | string;
  type: 'IN' | 'OUT';
  amount: number;
  source: CashTransactionSource;
  referenceId?: string;
  description?: string;
  transactionDate?: string;
}) {
  const safeAmt = roundCurrency(data.amount);
  if (safeAmt <= 0) return { success: false, error: 'Amount must be greater than 0' };

  const tenantId = data.tenantId || localStorage.getItem('vyapar_current_tenant') || 'default-tenant';
  const cashAcc = await getOrCreateLocalCashAccount(tenantId);

  const txRecord: CashTransaction = {
    cashAccountId: data.cashAccountId || cashAcc.id,
    tenantId,
    type: data.type,
    amount: safeAmt,
    source: data.source || 'MANUAL_ADJUSTMENT',
    referenceId: data.referenceId || `TXN-${Date.now()}`,
    description: data.description || `Cash ${data.type === 'IN' ? 'Inflow' : 'Outflow'} Entry`,
    transactionDate: data.transactionDate || new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  // Save into Dexie local IndexedDB
  const txId = await db.cashTransactions.add(txRecord);

  // Queue mutation for Cloud Sync
  await syncManager.logMutation('CASH_TRANSACTION', String(txRecord.referenceId || txId), 'INSERT', txRecord);

  return { success: true, data: txRecord };
}

/**
 * Transfer Cash to Bank (Deposit)
 */
export async function transferToBank(data: {
  tenantId?: string;
  cashAccountId?: number | string;
  amount: number;
  description?: string;
  date?: string;
}) {
  return recordCashEntry({
    tenantId: data.tenantId,
    cashAccountId: data.cashAccountId,
    type: 'OUT',
    amount: data.amount,
    source: 'BANK_DEPOSIT',
    referenceId: `DEP-${Date.now().toString().slice(-6)}`,
    description: data.description || 'Cash deposit from counter drawer into bank account',
    transactionDate: data.date
  });
}

/**
 * Transfer Bank to Cash (Withdrawal)
 */
export async function transferFromBank(data: {
  tenantId?: string;
  cashAccountId?: number | string;
  amount: number;
  description?: string;
  date?: string;
}) {
  return recordCashEntry({
    tenantId: data.tenantId,
    cashAccountId: data.cashAccountId,
    type: 'IN',
    amount: data.amount,
    source: 'BANK_WITHDRAWAL',
    referenceId: `WTH-${Date.now().toString().slice(-6)}`,
    description: data.description || 'Cash withdrawal from bank account into counter drawer',
    transactionDate: data.date
  });
}

/**
 * Reconcile Physical Cash Count vs System Balance
 */
export async function adjustCashBalance(data: {
  tenantId?: string;
  cashAccountId?: number | string;
  physicalCount: number;
  reason?: string;
  date?: string;
}) {
  const tenantId = data.tenantId || 'default-tenant';
  const balanceInfo = await fetchCashBalance(tenantId);
  const currentSystemBal = roundCurrency(balanceInfo.currentBalance || 0);
  const physical = Math.max(0, roundCurrency(data.physicalCount));
  const discrepancy = roundCurrency(physical - currentSystemBal);

  if (Math.abs(discrepancy) < 0.01) {
    return { success: true, message: 'Physical count matches system balance. No adjustment needed.' };
  }

  const isGain = discrepancy > 0;
  const adjAmt = Math.abs(discrepancy);
  const note = data.reason ? ` Note: ${data.reason}` : '';
  const desc = `Physical Cash Reconciliation: ${isGain ? 'Excess Cash Gain' : 'Cash Shortage Deficit'} of Rs ${adjAmt.toFixed(2)}.${note}`;

  const res = await recordCashEntry({
    tenantId,
    cashAccountId: data.cashAccountId || balanceInfo.accountId,
    type: isGain ? 'IN' : 'OUT',
    amount: adjAmt,
    source: 'MANUAL_ADJUSTMENT',
    referenceId: `ADJ-${Date.now().toString().slice(-6)}`,
    description: desc,
    transactionDate: data.date
  });

  return {
    success: res.success,
    message: res.success ? 'Physical cash count reconciled successfully' : undefined,
    error: res.error,
    data: res.data
  };
}
