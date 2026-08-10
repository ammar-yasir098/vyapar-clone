# Software Requirements & Architectural Specification Blueprint: Vyapar Application

## 1. Executive Summary & System Architecture

This specification outlines the end-to-end engineering roadmap for building an enterprise-grade billing, accounting, inventory, and GST compliance software inspired by **Vyapar**. The system must operate as an **offline-first platform**, ensuring zero POS downtime for merchants while supporting multi-device cloud synchronization, hardware driver communication (thermal printing, barcode readers), and double-entry financial accounting.
+-----------------------------------------------------------------------------------+
|                                 CLIENT DEVICE                                     |
|  +------------------------+  +-------------------------+  +--------------------+  |
|  |     React Native /     |  |   WatermelonDB / Local  |  |  Hardware Drivers  |  |
|  |    Electron UI Layer   |  |   SQLite (SQLCipher)    |  |  (ESC/POS, HID)    |  |
|  +-----------+------------+  +------------+------------+  +---------+----------+  |
|              |                            |                         |             |
|              +-------------------+--------+                         |             |
|                                  |                                  |             |
|                    +-------------v-------------+                    |             |
|                    | Sync Engine & Queue Mgr   |<-------------------+             |
|                    | (Delta Processing, LWW)   |                                  |
|                    +-------------+-------------+                                  |
+----------------------------------|------------------------------------------------+
|
(HTTPS / WebSockets Sync)
|
+----------------------------------v------------------------------------------------+
|                                 CLOUD BACKEND                                     |
|  +------------------------+  +-------------------------+  +--------------------+  |
|  |   API Gateway & Sync   |  |   Backend Services      |  | Audit & Billing    |  |
|  |   Service (Go/NestJS)  |  |   (Auth, Ledger, Tax)   |  | Workers (BullMQ)   |  |
|  +-----------+------------+  +------------+------------+  +---------+----------+  |
|              |                            |                         |             |
|              +-------------------+--------+                         |             |
|                                  |                                  |             |
|                    +-------------v-------------+                    |             |
|                    | PostgreSQL Multi-Tenant   |                    |             |
|                    |   (Row Level Security)    |                    |             |
|                    +---------------------------+                    |             |
+-----------------------------------------------------------------------------------+


### Core Architectural Principle
Local data availability takes top priority over server sync. All transactions are logged locally to SQLite/SQLCipher first, committed instantly to the local invoice queue, and asynchronously reconciled with the cloud backend.

---

## 2. Complete Technology Stack Matrix

| Application Layer | Primary Recommendation | Alternative Option | Rationale & Features |
| :--- | :--- | :--- | :--- |
| **Desktop App (Win/Mac)** | Electron.js + React | Tauri (Rust) | Full access to OS-level USB/Serial thermal printer drivers, native filesystem access for manual backups, and code sharing with mobile interface. |
| **Mobile App (Android/iOS)** | React Native (v0.74+) | Flutter | Shares UI code and business logic with Electron app. Native modules for Bluetooth SPP thermal printers and HID camera barcode scanners. |
| **Client Database** | SQLite via SQLCipher | WatermelonDB / Realm | Delivers zero-latency writes, strict ACID properties on local hardware, and 256-bit AES database encryption on customer disks. |
| **Backend Sync API** | Go (Golang) Microservices | Node.js (NestJS) | High-throughput sync payload processing with ultra-low memory footprint and sub-millisecond execution for conflict-resolution workers. |
| **Cloud Storage DB** | PostgreSQL 16 | YugabyteDB | PostgreSQL offers native JSONB operations, Row-Level Security (RLS) for multi-tenancy, and reliable ACID transactions for double-entry ledgers. |
| **Hardware Printing** | ESC/POS Command Encoder | Custom Native C++ Addons | Direct raw byte transmission to thermal receipt printers (58mm / 80mm) via USB, Serial, Bluetooth, and LAN network protocols. |

---

## 3. Database Schema Design (PostgreSQL / SQLite Core)

```sql
-- 1. TENANTS & BUSINESS PROFILES
CREATE TABLE tenants (
    tenant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name VARCHAR(255) NOT NULL,
    tax_identifier VARCHAR(50) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) CHECK (role IN ('OWNER', 'MANAGER', 'BILLING_CLERK', 'ACCOUNTANT')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. INVENTORY & SKUS
CREATE TABLE items (
    item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    sku_code VARCHAR(100),
    barcode VARCHAR(100),
    hsn_sac_code VARCHAR(20),
    unit_type VARCHAR(20) DEFAULT 'PCS', -- PCS, KG, LTR, BOX
    purchase_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sales_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    min_stock_alert NUMERIC(10, 2) DEFAULT 0.00,
    current_stock NUMERIC(10, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. PARTIES (CUSTOMERS & SUPPLIERS)
CREATE TABLE parties (
    party_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20),
    type VARCHAR(20) CHECK (type IN ('CUSTOMER', 'SUPPLIER', 'BOTH')),
    opening_balance NUMERIC(12, 2) DEFAULT 0.00,
    balance_type VARCHAR(10) CHECK (balance_type IN ('PAYABLE', 'RECEIVABLE')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. INVOICES / SALES TRANSACTIONS
CREATE TABLE invoices (
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
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_tenant_invoice_number UNIQUE(tenant_id, invoice_number)
);

CREATE TABLE invoice_items (
    invoice_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(item_id),
    quantity NUMERIC(10, 2) NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL,
    tax_rate NUMERIC(5, 2) DEFAULT 0.00,
    tax_amount NUMERIC(12, 2) DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL
);

-- 5. DOUBLE-ENTRY GENERAL LEDGER
CREATE TABLE ledger_accounts (
    account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    account_name VARCHAR(100) NOT NULL,
    account_type VARCHAR(30) CHECK (account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'))
);

CREATE TABLE journal_entries (
    entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    reference_id UUID, -- Links to invoice_id or payment_id
    transaction_date DATE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE journal_lines (
    line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID NOT NULL REFERENCES journal_entries(entry_id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES ledger_accounts(account_id),
    debit NUMERIC(12, 2) DEFAULT 0.00,
    credit NUMERIC(12, 2) DEFAULT 0.00
);
4. Offline Synchronization Protocol
4.1 Delta Vector Tracking
Every client mutation writes to a local table called sync_journal. Mutations receive a locally generated version_id, a monotonically incrementing client sequence ID, and a UTC timestamp.

4.2 Conflict Mitigation Rules
Invoices & Payments (Immutable): Invoices are treated as append-only financial records. Any modification creates a void/reversal journal entry with an updated revision number rather than overwriting existing records.

Inventory Adjustment (Delta Reconciler): To avoid overwriting inventory when two devices bill simultaneously offline, stock is synced as numeric deltas (stock_delta = -2) rather than absolute stock values.

Party & Item Master Data (LWW): Last-Write-Wins based on server-verified UTC commit timestamps.

5. Thermal Printing Integration Engine (ESC/POS)
JavaScript
const ESC = 0x1B;
const GS  = 0x1D;

function buildThermalReceiptBuffer(invoiceData) {
    let bytes = [];
    
    // Reset Printer & Set Alignment to Center
    bytes.push(ESC, 0x40, ESC, 0x61, 0x01);
    
    // Header Text Bold & Double Height
    bytes.push(ESC, 0x21, 0x30);
    bytes.push(...Buffer.from("SUPERMARKET RETAIL\n", 'ascii'));
    
    // Normal Text Alignment Left
    bytes.push(ESC, 0x21, 0x00, ESC, 0x61, 0x00);
    bytes.push(...Buffer.from(`Invoice #: ${invoiceData.number}\n`, 'ascii'));
    bytes.push(...Buffer.from(`--------------------------------\n`, 'ascii'));
    
    // Add Itemized Rows
    invoiceData.items.map(item => {
        let line = `${item.name.padEnd(16)} x${item.qty}  ${item.total}\n`;
        bytes.push(...Buffer.from(line, 'ascii'));
    });
    
    // Paper Cut Command
    bytes.push(GS, 0x56, 0x41, 0x00);
    return Buffer.from(bytes);
}
6. Development Phase Execution Roadmap
Phase 1: Core Billing & Local Engine (Months 1–3)
[x] Local SQLite DB setup with SQLCipher 256-bit AES encryption.

[x] High-speed POS UI with keyboard shortcuts (F2 New Invoice, F8 Save & Print).

[x] Direct ESC/POS printing pipeline via USB/Serial native modules.

Phase 2: Inventory & Double-Entry Accounting (Months 4–6)
[ ] Automated ledger engine for Accounts Receivable & Accounts Payable.

[ ] Real-time batch-wise inventory tracking (Expiry date alerts, MRP handling).

[ ] Custom PDF Invoice Builder (A4, A5, and Thermal layouts).

Phase 3: Sync Engine & Cloud Backups (Months 7–9)
[ ] Delta-based offline sync engine with gRPC transport.

[ ] WhatsApp Business API integration for sending PDF invoices automatically.

[ ] Multi-user Role-Based Access Control (RBAC) (Owner vs Cashier views).

Phase 4: Compliance & Commercial Release (Months 10–12)
[ ] Direct tax portal integration (E-Way bills, automated GST filing exports).

[ ] Cross-platform cloud synchronization across Windows, Android, and iOS.