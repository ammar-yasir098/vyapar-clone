-- Vyapar Multi-Tenant Cloud Database Schema (PostgreSQL 16)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TENANTS & USERS
CREATE TABLE IF NOT EXISTS tenants (
    tenant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name VARCHAR(255) NOT NULL,
    tax_identifier VARCHAR(50) UNIQUE,
    phone VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) CHECK (role IN ('OWNER', 'MANAGER', 'BILLING_CLERK', 'ACCOUNTANT')) DEFAULT 'OWNER',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. INVENTORY & SKUS
CREATE TABLE IF NOT EXISTS items (
    item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    sku_code VARCHAR(100),
    barcode VARCHAR(100),
    hsn_sac_code VARCHAR(20),
    unit_type VARCHAR(20) DEFAULT 'PCS',
    purchase_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sales_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    min_stock_alert NUMERIC(10, 2) DEFAULT 0.00,
    current_stock NUMERIC(10, 2) DEFAULT 0.00,
    cgst_rate NUMERIC(5, 2) DEFAULT 0.00,
    sgst_rate NUMERIC(5, 2) DEFAULT 0.00,
    igst_rate NUMERIC(5, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. PARTIES
CREATE TABLE IF NOT EXISTS parties (
    party_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20),
    type VARCHAR(20) CHECK (type IN ('CUSTOMER', 'SUPPLIER', 'BOTH')),
    gstin VARCHAR(50),
    current_balance NUMERIC(12, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. INVOICES
CREATE TABLE IF NOT EXISTS invoices (
    invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    party_id UUID REFERENCES parties(party_id),
    invoice_number VARCHAR(50) NOT NULL,
    invoice_date DATE NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL,
    tax_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount_total NUMERIC(12, 2) DEFAULT 0.00,
    grand_total NUMERIC(12, 2) NOT NULL,
    payment_status VARCHAR(20) CHECK (payment_status IN ('PAID', 'PARTIAL', 'UNPAID')),
    payment_method VARCHAR(20) DEFAULT 'CASH',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_tenant_invoice_number UNIQUE(tenant_id, invoice_number)
);

-- 5. DELTA SYNC JOURNAL (Vector Tracking)
CREATE TABLE IF NOT EXISTS sync_journal (
    sync_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    version_id VARCHAR(100) NOT NULL,
    client_sequence BIGINT NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    mutation_type VARCHAR(20) CHECK (mutation_type IN ('INSERT', 'UPDATE', 'DELETE')),
    payload JSONB NOT NULL,
    committed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
