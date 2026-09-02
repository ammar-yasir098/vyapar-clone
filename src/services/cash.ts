import { db } from '../db';
import { CashAccount, CashTransaction, CashTransactionSource } from '../types';
import { roundCurrency } from '../utils/edgeCaseHelpers';
import { syncManager } from './sync';
import { checkServerHealth } from './api';

const API_BASE_URL = 'http://localhost:5000/api/v1/cash';

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 2500): Promise<Response> {
  const isOnline = await checkServerHealth(600);
  if (!isOnline) {
    throw new Error('Backend server offline');
  }

  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, headers, signal: controller.signal });
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
      const tTenant = t.tenantId || 'default-tenant';
      const key = ref ? `${tTenant}-${ref}-${type}` : `sig-${tTenant}-${source}-${amount}-${t.description}`;

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
  const cashAcc = await getOrCreateLocalCashAccount(activeTenantId);
  const activeAccountId = cashAcc?.id || 1;

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
  const seenRefs = new Set<string>();

  // 1. Manual and explicit cash ledger records first
  for (const ct of manualCashTxns) {
    const amt = roundCurrency(ct.amount);
    if (amt <= 0) continue;
    const refKey = ct.referenceId ? `${ct.referenceId}-${ct.type}` : `id-${ct.id}`;
    if (seenRefs.has(refKey)) continue;
    seenRefs.add(refKey);

    const txDate = ct.createdAt || ct.transactionDate || new Date().toISOString();
    items.push({
      id: `cash-tx-${ct.id}`,
      cashAccountId: ct.cashAccountId || activeAccountId,
      tenantId: activeTenantId,
      type: ct.type,
      amount: amt,
      source: ct.source || 'MANUAL_ADJUSTMENT',
      referenceId: ct.referenceId || '',
      description: ct.description || (ct.type === 'IN' ? 'Cash Inflow' : 'Cash Outflow'),
      transactionDate: txDate,
      createdAt: ct.createdAt || txDate
    });
  }

  // 2. Sales (Upfront Cash Sales) - if not already recorded
  for (const inv of invoices) {
    const pm = (inv.paymentMethod || '').toUpperCase();
    if (pm === 'CREDIT') continue;

    const grand = Number(inv.grandTotal || 0);
    const rec = Number(inv.receivedAmount ?? (inv.paymentStatus === 'PAID' ? grand : 0));
    const amt = roundCurrency(rec);
    const refKey = inv.invoiceNumber ? `${inv.invoiceNumber}-IN` : '';

    if (amt > 0 && (!refKey || !seenRefs.has(refKey))) {
      if (refKey) seenRefs.add(refKey);
      const txDate = inv.createdAt || (inv.invoiceDate ? `${inv.invoiceDate}T12:00:00.000Z` : new Date().toISOString());
      items.push({
        id: `cash-sale-${inv.id || inv.invoiceNumber}`,
        cashAccountId: activeAccountId,
        tenantId: activeTenantId,
        type: 'IN',
        amount: amt,
        source: 'POS_SALE' as CashTransactionSource,
        referenceId: inv.invoiceNumber || '',
        description: `POS Cash Sale - ${inv.partyName || 'Retail Customer'}`,
        transactionDate: txDate,
        createdAt: inv.createdAt || txDate
      });
    }
  }

  // 3. Payment-In (Cash Receipts)
  for (const p of paymentsIn) {
    const mode = (p.paymentMethod || 'CASH').toUpperCase();
    const amt = Number(p.amount || 0);
    const refKey = p.receiptNumber ? `${p.receiptNumber}-IN` : '';

    if (mode === 'CASH' && amt > 0 && (!refKey || !seenRefs.has(refKey))) {
      if (refKey) seenRefs.add(refKey);
      const txDate = p.createdAt || (p.paymentDate ? `${p.paymentDate}T12:00:00.000Z` : new Date().toISOString());
      items.push({
        id: `cash-payin-${p.id || p.receiptNumber}`,
        cashAccountId: activeAccountId,
        tenantId: activeTenantId,
        type: 'IN',
        amount: roundCurrency(amt),
        source: 'PAYMENT_IN' as CashTransactionSource,
        referenceId: p.receiptNumber || '',
        description: `Payment-In from ${p.partyName || 'Customer'}`,
        transactionDate: txDate,
        createdAt: p.createdAt || txDate
      });
    }
  }

  // 4. Purchase Bills (Upfront Cash Purchases)
  for (const b of purchaseBills) {
    const pm = (b.paymentMethod || '').toUpperCase();
    if (pm === 'CREDIT') continue;

    const paid = Number(b.paidAmount ?? (pm === 'CASH' ? b.grandTotal : 0));
    const amt = roundCurrency(paid);
    const refKey = b.billNumber ? `${b.billNumber}-OUT` : '';

    if (amt > 0 && (!refKey || !seenRefs.has(refKey))) {
      if (refKey) seenRefs.add(refKey);
      const txDate = b.createdAt || (b.billDate ? `${b.billDate}T12:00:00.000Z` : new Date().toISOString());
      items.push({
        id: `cash-pur-${b.id || b.billNumber}`,
        cashAccountId: activeAccountId,
        tenantId: activeTenantId,
        type: 'OUT',
        amount: amt,
        source: 'PURCHASE_BILL' as CashTransactionSource,
        referenceId: b.billNumber || '',
        description: `Cash Purchase - ${b.supplierName || 'Supplier'}`,
        transactionDate: txDate,
        createdAt: b.createdAt || txDate
      });
    }
  }

  // 5. Payment-Out (Cash Payments)
  for (const po of paymentsOut) {
    const mode = (po.paymentMethod || 'CASH').toUpperCase();
    const amt = Number(po.amount || 0);
    const refKey = po.receiptNumber ? `${po.receiptNumber}-OUT` : '';

    if (mode === 'CASH' && amt > 0 && (!refKey || !seenRefs.has(refKey))) {
      if (refKey) seenRefs.add(refKey);
      const txDate = po.createdAt || (po.paymentDate ? `${po.paymentDate}T12:00:00.000Z` : new Date().toISOString());
      items.push({
        id: `cash-payout-${po.id || po.receiptNumber}`,
        cashAccountId: activeAccountId,
        tenantId: activeTenantId,
        type: 'OUT',
        amount: roundCurrency(amt),
        source: 'PAYMENT_OUT' as CashTransactionSource,
        referenceId: po.receiptNumber || '',
        description: `Payment-Out to ${po.partyName || 'Supplier'}`,
        transactionDate: txDate,
        createdAt: po.createdAt || txDate
      });
    }
  }

  // 6. Expenses (Cash Expenses)
  for (const e of expenses) {
    const mode = (e.paymentMode || 'CASH').toUpperCase();
    const amt = Number(e.amount || 0);
    const refKey = e.expenseNumber ? `${e.expenseNumber}-OUT` : '';

    if (mode === 'CASH' && amt > 0 && (!refKey || !seenRefs.has(refKey))) {
      if (refKey) seenRefs.add(refKey);
      const txDate = e.createdAt || (e.expenseDate ? `${e.expenseDate}T12:00:00.000Z` : new Date().toISOString());
      items.push({
        id: `cash-exp-${e.id || e.expenseNumber}`,
        cashAccountId: activeAccountId,
        tenantId: activeTenantId,
        type: 'OUT',
        amount: roundCurrency(amt),
        source: 'EXPENSE' as CashTransactionSource,
        referenceId: e.expenseNumber || '',
        description: `Cash Expense - ${e.categoryName || 'Miscellaneous'}`,
        transactionDate: txDate,
        createdAt: e.createdAt || txDate
      });
    }
  }

  // 7. Purchase Returns (Cash Refund Received)
  for (const pr of purchaseReturns) {
    const amt = Number(pr.grandTotal || 0);
    const refKey = pr.debitNoteNumber ? `${pr.debitNoteNumber}-IN` : '';

    if (amt > 0 && (!refKey || !seenRefs.has(refKey))) {
      if (refKey) seenRefs.add(refKey);
      const txDate = pr.createdAt || (pr.returnDate ? `${pr.returnDate}T12:00:00.000Z` : new Date().toISOString());
      items.push({
        id: `cash-pur-ret-${pr.id || pr.debitNoteNumber}`,
        cashAccountId: activeAccountId,
        tenantId: activeTenantId,
        type: 'IN',
        amount: roundCurrency(amt),
        source: 'PURCHASE_RETURN_REFUND' as CashTransactionSource,
        referenceId: pr.debitNoteNumber || '',
        description: `Purchase Return Refund - ${pr.supplierName || 'Supplier'}`,
        transactionDate: txDate,
        createdAt: pr.createdAt || txDate
      });
    }
  }

  // 8. Sale Returns (Cash Refund Paid Out)
  for (const sr of saleReturns) {
    const amt = Number(sr.refundAmount ?? sr.grandTotal ?? 0);
    const refKey = sr.creditNoteNumber ? `${sr.creditNoteNumber}-OUT` : '';

    if (amt > 0 && (!refKey || !seenRefs.has(refKey))) {
      if (refKey) seenRefs.add(refKey);
      const txDate = sr.createdAt || (sr.returnDate ? `${sr.returnDate}T12:00:00.000Z` : new Date().toISOString());
      items.push({
        id: `cash-sale-ret-${sr.id || sr.creditNoteNumber}`,
        cashAccountId: activeAccountId,
        tenantId: activeTenantId,
        type: 'OUT',
        amount: roundCurrency(amt),
        source: 'SALE_RETURN_REFUND' as CashTransactionSource,
        referenceId: sr.creditNoteNumber || '',
        description: `Sale Return Cash Refund - ${sr.partyName || 'Customer'}`,
        transactionDate: txDate,
        createdAt: sr.createdAt || txDate
      });
    }
  }

  return items;
}

/**
 * Calculates current cash balance dynamically (Opening + IN - OUT)
 */
export async function fetchCashBalance(tenantId: string) {
  const activeTenantId = tenantId || localStorage.getItem('vyapar_current_tenant') || 'default-tenant';

  // 1. Try server first if online
  try {
    const isOnline = await checkServerHealth(600);
    if (isOnline) {
      const res = await fetchWithTimeout(`${API_BASE_URL}/balance?tenantId=${encodeURIComponent(activeTenantId)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          return {
            accountId: Number(json.data.accountId || 0),
            name: json.data.name || 'Main Cash Drawer',
            openingBalance: roundCurrency(json.data.openingBalance || 0),
            totalIn: roundCurrency(json.data.totalIn || 0),
            totalOut: roundCurrency(json.data.totalOut || 0),
            currentBalance: roundCurrency(json.data.currentBalance || 0)
          };
        }
      }
    }
  } catch (e) {
    // Fallback to local Dexie
  }

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
 * Helper to extract accurate sort timestamp from an item
 */
function getTxnSortTimestamp(t: any): number {
  if (t.createdAt) {
    const ms = new Date(t.createdAt).getTime();
    if (!isNaN(ms) && ms > 0) return ms;
  }
  if (t.transactionDate && t.transactionDate.includes('T')) {
    const ms = new Date(t.transactionDate).getTime();
    if (!isNaN(ms) && ms > 0) return ms;
  }
  const match = String(t.referenceId || t.id || '').match(/\d{10,13}/);
  if (match) {
    const ms = Number(match[0]);
    if (ms > 1700000000000) return ms;
  }
  if (t.transactionDate) {
    const ms = new Date(t.transactionDate).getTime();
    if (!isNaN(ms) && ms > 0) return ms;
  }
  return 0;
}

/**
 * Fetches transaction history with calculated running balances strictly from local Dexie IndexedDB or Server
 */
export async function fetchCashTransactions(tenantId: string, filters: any = {}) {
  const activeTenantId = tenantId || localStorage.getItem('vyapar_current_tenant') || 'default-tenant';

  // 1. Try fetching from server first (has authentic PostgreSQL ledger and order)
  try {
    const isOnline = await checkServerHealth(600);
    if (isOnline) {
      const q = new URLSearchParams({
        tenantId: activeTenantId,
        type: filters.type || '',
        source: filters.source || '',
        search: filters.search || '',
        startDate: filters.startDate || '',
        endDate: filters.endDate || '',
        limit: 'all'
      });
      const res = await fetchWithTimeout(`${API_BASE_URL}/transactions?${q.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data && Array.isArray(json.data.transactions)) {
          return {
            transactions: json.data.transactions,
            openingBalance: roundCurrency(json.data.openingBalance || 0),
            currentBalance: roundCurrency(json.data.currentBalance || 0),
            totalIn: roundCurrency(json.data.totalIn || 0),
            totalOut: roundCurrency(json.data.totalOut || 0),
            page: 1,
            totalPages: 1
          };
        }
      }
    }
  } catch (e) {
    // Fallback to local Dexie
  }

  const cashAcc = await getOrCreateLocalCashAccount(activeTenantId);
  const openingBal = roundCurrency(cashAcc.openingBalance || 0);

  let txns = await getAllAggregatedCashTransactions(activeTenantId);

  // Sort ascending by true timestamp to calculate running balances correctly
  txns.sort((a, b) => {
    const diff = getTxnSortTimestamp(a) - getTxnSortTimestamp(b);
    if (diff !== 0) return diff;
    if (a.type !== b.type) return a.type === 'IN' ? -1 : 1;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

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
      const txTime = getTxnSortTimestamp(t);
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
