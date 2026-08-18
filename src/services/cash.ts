import { db } from '../db';
import { CashAccount, CashTransaction, CashTransactionSource } from '../types';
import { roundCurrency } from '../utils/edgeCaseHelpers';

const API_BASE_URL = 'http://localhost:5000/api/v1/cash';

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 6000): Promise<Response> {
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
export async function getOrCreateLocalCashAccount(tenantId: string = 'default-tenant'): Promise<CashAccount> {
  let acc = await db.cashAccounts.filter(a => (a.tenantId || 'default-tenant') === tenantId).first();
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
 * Calculates current cash balance dynamically (Opening + IN - OUT)
 */
export async function fetchCashBalance(tenantId: string = 'default-tenant') {
  try {
    // Try server API first
    const res = await fetchWithTimeout(`${API_BASE_URL}/balance?tenantId=${encodeURIComponent(tenantId)}`);
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        return json.data;
      }
    }
  } catch {
    // Offline fallback using Dexie IndexedDB
  }

  const cashAcc = await getOrCreateLocalCashAccount(tenantId);
  const openingBalance = roundCurrency(cashAcc.openingBalance || 0);

  const txns = await db.cashTransactions
    .filter(t => (t.tenantId || 'default-tenant') === tenantId)
    .toArray();

  let totalIn = 0;
  let totalOut = 0;

  for (const t of txns) {
    const amt = roundCurrency(t.amount);
    if (t.type === 'IN') totalIn = roundCurrency(totalIn + amt);
    else totalOut = roundCurrency(totalOut + amt);
  }

  const currentBalance = roundCurrency(openingBalance + totalIn - totalOut);

  return {
    accountId: cashAcc.id,
    name: cashAcc.name,
    openingBalance,
    totalIn,
    totalOut,
    currentBalance
  };
}

/**
 * Fetches transaction history with calculated running balances
 */
export async function fetchCashTransactions(tenantId: string = 'default-tenant', filters: any = {}) {
  try {
    const query = new URLSearchParams({
      tenantId,
      type: filters.type || '',
      source: filters.source || '',
      search: filters.search || '',
      page: String(filters.page || 1),
      limit: String(filters.limit || 50)
    });

    const res = await fetchWithTimeout(`${API_BASE_URL}/transactions?${query.toString()}`);
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        return json.data;
      }
    }
  } catch {
    // Offline fallback using Dexie
  }

  const cashAcc = await getOrCreateLocalCashAccount(tenantId);
  const openingBal = roundCurrency(cashAcc.openingBalance || 0);

  let txns = await db.cashTransactions
    .filter(t => (t.tenantId || 'default-tenant') === tenantId)
    .toArray();

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
    if (filters.source && t.source !== filters.source) return false;
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

  const tenantId = data.tenantId || 'default-tenant';
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
  await db.cashTransactions.add(txRecord);

  // Try pushing to cloud backend server
  try {
    const res = await fetch(`${API_BASE_URL}/entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...txRecord, accountId: cashAcc.id })
    });
    const json = await res.json();
    return json;
  } catch {
    return { success: true, data: txRecord };
  }
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

  return recordCashEntry({
    tenantId,
    cashAccountId: data.cashAccountId || balanceInfo.accountId,
    type: isGain ? 'IN' : 'OUT',
    amount: adjAmt,
    source: 'MANUAL_ADJUSTMENT',
    referenceId: `ADJ-${Date.now().toString().slice(-6)}`,
    description: desc,
    transactionDate: data.date
  });
}
