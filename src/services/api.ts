const API_BASE_URL = 'http://localhost:5000/api/v1';

// COMPANY PROFILE
export async function fetchServerCompanyProfile() {
  try {
    const res = await fetch(`${API_BASE_URL}/company`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch (err) {
    return null;
  }
}

export async function saveServerCompanyProfile(companyData: any) {
  try {
    const res = await fetch(`${API_BASE_URL}/company`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(companyData)
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ITEMS
export async function fetchServerItems() {
  try {
    const res = await fetch(`${API_BASE_URL}/items`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    return [];
  }
}

export async function createServerItem(itemData: any) {
  try {
    const res = await fetch(`${API_BASE_URL}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itemData)
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function adjustServerItemStock(id: number, delta: number) {
  try {
    const res = await fetch(`${API_BASE_URL}/items/${id}/stock`, {
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
    const res = await fetch(`${API_BASE_URL}/items/${id}`, { method: 'DELETE' });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// PARTIES
export async function fetchServerParties() {
  try {
    const res = await fetch(`${API_BASE_URL}/parties`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    return [];
  }
}

export async function createServerParty(partyData: any) {
  try {
    const res = await fetch(`${API_BASE_URL}/parties`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partyData)
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function recordServerPartyPayment(id: number, amount: number, remarks: string, partyType: string) {
  try {
    const res = await fetch(`${API_BASE_URL}/parties/${id}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, remarks, partyType })
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteServerParty(id: number) {
  try {
    const res = await fetch(`${API_BASE_URL}/parties/${id}`, { method: 'DELETE' });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// INVOICES
export async function fetchServerInvoices() {
  try {
    const res = await fetch(`${API_BASE_URL}/invoices`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    return [];
  }
}

export async function createServerInvoice(invoiceData: any) {
  try {
    const res = await fetch(`${API_BASE_URL}/invoices`, {
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
export async function createServerPurchase(purchaseData: any) {
  try {
    const res = await fetch(`${API_BASE_URL}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(purchaseData)
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// LEDGER
export async function fetchServerLedgerAccounts() {
  try {
    const res = await fetch(`${API_BASE_URL}/ledger/accounts`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    return [];
  }
}

export async function fetchServerJournalEntries() {
  try {
    const res = await fetch(`${API_BASE_URL}/ledger/journals`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    return [];
  }
}
