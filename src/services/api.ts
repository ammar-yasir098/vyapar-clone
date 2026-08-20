const API_BASE_URL = 'http://localhost:5000/api/v1';

let cachedServerOnline: boolean | null = null;
let lastCheckTime = 0;
const CACHE_TTL_MS = 4000;

export async function checkServerHealth(timeoutMs = 600): Promise<boolean> {
  const now = Date.now();
  if (cachedServerOnline !== null && now - lastCheckTime < CACHE_TTL_MS) {
    return cachedServerOnline;
  }

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${API_BASE_URL}/sync/health`, { signal: controller.signal });
    clearTimeout(id);
    cachedServerOnline = res.ok;
    lastCheckTime = now;
    return cachedServerOnline;
  } catch {
    cachedServerOnline = false;
    lastCheckTime = now;
    return false;
  }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 2000): Promise<Response> {
  const isHealthCheck = url.endsWith('/sync/health');
  if (!isHealthCheck) {
    const isOnline = await checkServerHealth(600);
    if (!isOnline) {
      throw new Error('Backend server offline');
    }
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

// COMPANY PROFILE
export async function fetchServerCompanyProfile(tenantId = 'default-tenant') {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/company?tenantId=${encodeURIComponent(tenantId)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch (err) {
    return null;
  }
}

export async function fetchServerAllCompanies() {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/company/all`);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json.data) ? json.data : [];
  } catch (err) {
    return [];
  }
}

export async function saveServerCompanyProfile(companyData: any) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/company`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(companyData)
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteServerCompanyProfile(tenantId: string) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/company?tenantId=${encodeURIComponent(tenantId)}`, {
      method: 'DELETE'
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ITEMS
export async function fetchServerItems(tenantId?: string) {
  try {
    const url = tenantId ? `${API_BASE_URL}/items?tenantId=${encodeURIComponent(tenantId)}` : `${API_BASE_URL}/items`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    return [];
  }
}

export async function createServerItem(itemData: any) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itemData)
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export function updateServerItem(id: number, itemData: any) {
  try {
    return fetchWithTimeout(`${API_BASE_URL}/items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itemData)
    }).then(res => res.json());
  } catch (err: any) {
    return Promise.resolve({ success: false, error: err.message });
  }
}

export async function adjustServerItemStock(id: number, delta: number) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/items/${id}/stock`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta })
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteServerItem(id: number) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/items/${id}`, { method: 'DELETE' });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// PARTIES
export async function fetchServerParties(tenantId?: string) {
  try {
    const url = tenantId ? `${API_BASE_URL}/parties?tenantId=${encodeURIComponent(tenantId)}` : `${API_BASE_URL}/parties`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    return [];
  }
}

export async function createServerParty(partyData: any) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/parties`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partyData)
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function recordServerPartyPayment(id: number, amount: number, remarks: string, partyType: string, partyName?: string) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/parties/${id}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, remarks, partyType, partyName })
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteServerParty(id: number) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/parties/${id}`, { method: 'DELETE' });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// INVOICES
export async function fetchServerInvoices(tenantId?: string) {
  try {
    const url = tenantId ? `${API_BASE_URL}/invoices?tenantId=${encodeURIComponent(tenantId)}` : `${API_BASE_URL}/invoices`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    return [];
  }
}

export async function createServerInvoice(invoiceData: any) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoiceData)
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// PURCHASES
export async function fetchServerPurchaseBills(tenantId?: string) {
  try {
    const url = tenantId ? `${API_BASE_URL}/purchases?tenantId=${encodeURIComponent(tenantId)}` : `${API_BASE_URL}/purchases`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    return [];
  }
}

export async function createServerPurchaseBill(purchaseData: any) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(purchaseData)
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function createServerPurchase(purchaseData: any) {
  return createServerPurchaseBill(purchaseData);
}

export async function deleteServerPurchaseBill(id: number | string) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/purchases/${id}`, {
      method: 'DELETE'
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// LEDGER
export async function fetchServerLedgerAccounts(tenantId?: string) {
  try {
    const url = tenantId ? `${API_BASE_URL}/ledger/accounts?tenantId=${encodeURIComponent(tenantId)}` : `${API_BASE_URL}/ledger/accounts`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    return [];
  }
}

export async function fetchServerJournalEntries(tenantId?: string) {
  try {
    const url = tenantId ? `${API_BASE_URL}/ledger/journals?tenantId=${encodeURIComponent(tenantId)}` : `${API_BASE_URL}/ledger/journals`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    return [];
  }
}

// ESTIMATES
export async function fetchServerEstimates(tenantId?: string) {
  try {
    const url = tenantId ? `${API_BASE_URL}/estimates?tenantId=${encodeURIComponent(tenantId)}` : `${API_BASE_URL}/estimates`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    return [];
  }
}

export async function saveServerEstimate(estimateData: any) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/estimates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(estimateData)
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// PAYMENTS IN
export async function fetchServerPaymentsIn(tenantId?: string) {
  try {
    const url = tenantId ? `${API_BASE_URL}/payments/in?tenantId=${encodeURIComponent(tenantId)}` : `${API_BASE_URL}/payments/in`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    return [];
  }
}

export async function createServerPaymentIn(paymentData: any) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/payments/in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentData)
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// PAYMENTS OUT
export async function fetchServerPaymentsOut(tenantId?: string) {
  try {
    const url = tenantId ? `${API_BASE_URL}/payments/out?tenantId=${encodeURIComponent(tenantId)}` : `${API_BASE_URL}/payments/out`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    return [];
  }
}

export async function createServerPaymentOut(paymentData: any) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/payments/out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentData)
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteServerPaymentOut(id: number | string) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/payments/out/${id}`, {
      method: 'DELETE'
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// EXPENSES
export async function fetchServerExpenses(tenantId?: string) {
  try {
    const url = tenantId ? `${API_BASE_URL}/expenses?tenantId=${encodeURIComponent(tenantId)}` : `${API_BASE_URL}/expenses`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    return [];
  }
}

export async function createServerExpense(expenseData: any) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(expenseData)
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteServerExpense(id: number | string) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/expenses/${id}`, {
      method: 'DELETE'
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// PURCHASE ORDERS
export async function fetchServerPurchaseOrders(tenantId?: string) {
  try {
    const url = tenantId ? `${API_BASE_URL}/purchase-orders?tenantId=${encodeURIComponent(tenantId)}` : `${API_BASE_URL}/purchase-orders`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    return [];
  }
}

export async function createServerPurchaseOrder(poData: any) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/purchase-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(poData)
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateServerPOStatus(id: number | string, status: string) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/purchase-orders/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteServerPurchaseOrder(id: number | string) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/purchase-orders/${id}`, {
      method: 'DELETE'
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// PURCHASE RETURNS (DEBIT NOTES)
export async function fetchServerPurchaseReturns(tenantId?: string) {
  try {
    const url = tenantId ? `${API_BASE_URL}/purchase-returns?tenantId=${encodeURIComponent(tenantId)}` : `${API_BASE_URL}/purchase-returns`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    return [];
  }
}

export async function createServerPurchaseReturn(returnData: any) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/purchase-returns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(returnData)
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteServerPurchaseReturn(id: number | string) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/purchase-returns/${id}`, {
      method: 'DELETE'
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// SALE RETURNS (CREDIT NOTES / CR. NOTES)
export async function fetchServerSaleReturns(tenantId?: string) {
  try {
    const url = tenantId ? `${API_BASE_URL}/sale-returns?tenantId=${encodeURIComponent(tenantId)}` : `${API_BASE_URL}/sale-returns`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    return [];
  }
}

export async function createServerSaleReturn(returnData: any) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/sale-returns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(returnData)
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteServerSaleReturn(id: number | string) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/sale-returns/${id}`, {
      method: 'DELETE'
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// CASH TRANSACTIONS
export async function fetchServerCashTransactions(tenantId?: string) {
  try {
    const url = tenantId ? `${API_BASE_URL}/cash/transactions?tenantId=${encodeURIComponent(tenantId)}&limit=all` : `${API_BASE_URL}/cash/transactions?limit=all`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data?.transactions || [];
  } catch (err) {
    return [];
  }
}

