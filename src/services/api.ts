const API_BASE_URL = 'http://localhost:5000/api/v1';

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
