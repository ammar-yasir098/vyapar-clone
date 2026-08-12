-- Vyapar Multi-Tenant Cloud Database Schema (PostgreSQL 16)

-- 1. COMPANY PROFILE
CREATE TABLE IF NOT EXISTS company_profile (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) UNIQUE NOT NULL DEFAULT 'default-tenant',
    name VARCHAR(255) NOT NULL DEFAULT 'SuperMarket Retail & Traders',
    phone VARCHAR(64) DEFAULT '+92 300 xxxxxxx',
    email VARCHAR(128) DEFAULT 'contact@supermarket.com',
    address TEXT DEFAULT 'Shop #12, Commercial Market, Main Boulevard, Gulberg, Lahore',
    gstin VARCHAR(64) DEFAULT 'NTN: 7654321-0',
    business_type VARCHAR(64) DEFAULT 'Retail',
    business_category VARCHAR(64) DEFAULT 'Supermarket & FMCG',
    pincode VARCHAR(32) DEFAULT '54000',
    logo_url TEXT,
    signature_url TEXT,
    books_begin_date DATE DEFAULT CURRENT_DATE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. INVENTORY & SKUS
CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default-tenant',
    name VARCHAR(255) NOT NULL,
    sku_code VARCHAR(64) UNIQUE,
    barcode VARCHAR(64) UNIQUE,
    hsn_sac_code VARCHAR(32) DEFAULT '1000',
    unit_type VARCHAR(16) DEFAULT 'PCS',
    purchase_price NUMERIC(12,2) DEFAULT 0.00,
    sales_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    min_stock_alert NUMERIC(12,2) DEFAULT 5.00,
    current_stock NUMERIC(12,2) DEFAULT 0.00,
    cgst_rate NUMERIC(5,2) DEFAULT 0.00,
    sgst_rate NUMERIC(5,2) DEFAULT 0.00,
    igst_rate NUMERIC(5,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. PARTIES
CREATE TABLE IF NOT EXISTS parties (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default-tenant',
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(32) NOT NULL,
    type VARCHAR(32) DEFAULT 'CUSTOMER',
    opening_balance NUMERIC(12,2) DEFAULT 0.00,
    balance_type VARCHAR(16) DEFAULT 'RECEIVABLE',
    current_balance NUMERIC(12,2) DEFAULT 0.00,
    gstin VARCHAR(32),
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. INVOICES
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    invoice_id VARCHAR(64) UNIQUE NOT NULL,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default-tenant',
    invoice_number VARCHAR(64) NOT NULL,
    invoice_date DATE NOT NULL,
    party_id INT REFERENCES parties(id),
    party_name VARCHAR(255) NOT NULL,
    party_phone VARCHAR(32),
    party_gstin VARCHAR(32),
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    tax_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    discount_total NUMERIC(12,2) DEFAULT 0.00,
    grand_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    received_amount NUMERIC(12,2) DEFAULT 0.00,
    due_amount NUMERIC(12,2) DEFAULT 0.00,
    payment_status VARCHAR(16) DEFAULT 'PAID',
    payment_method VARCHAR(16) DEFAULT 'CASH',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. INVOICE LINE ITEMS
CREATE TABLE IF NOT EXISTS invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INT REFERENCES invoices(id) ON DELETE CASCADE,
    item_id INT REFERENCES items(id),
    item_name VARCHAR(255) NOT NULL,
    hsn_sac_code VARCHAR(32),
    unit_type VARCHAR(16),
    quantity NUMERIC(12,2) NOT NULL DEFAULT 1.00,
    unit_price NUMERIC(12,2) NOT NULL,
    purchase_price NUMERIC(12,2) DEFAULT 0.00,
    tax_amount NUMERIC(12,2) DEFAULT 0.00,
    total_amount NUMERIC(12,2) NOT NULL
);

-- 6. JOURNAL ENTRIES
CREATE TABLE IF NOT EXISTS journal_entries (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'default-tenant',
    entry_number VARCHAR(64) NOT NULL,
    reference_id VARCHAR(64),
    transaction_date DATE NOT NULL,
    description TEXT,
    total_debit NUMERIC(12,2) NOT NULL,
    total_credit NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. CHART OF ACCOUNTS / LEDGER
CREATE TABLE IF NOT EXISTS ledger_accounts (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'default-tenant',
    account_code VARCHAR(32) NOT NULL UNIQUE,
    account_name VARCHAR(255) NOT NULL,
    account_type VARCHAR(32) DEFAULT 'ASSET',
    balance NUMERIC(12,2) DEFAULT 0.00,
    description TEXT
);
