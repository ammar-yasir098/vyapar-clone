import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client, Pool } = pg;

const host = process.env.PGHOST || 'localhost';
const port = parseInt(process.env.PGPORT || '5432');
const user = process.env.PGUSER || 'postgres';
const password = process.env.PGPASSWORD || 'postgres';
const databaseName = process.env.PGDATABASE || 'vyapar_db';

const targetConnectionString = process.env.PG_URI || `postgresql://${user}:${password}@${host}:${port}/${databaseName}`;

export const pool = new Pool({
  connectionString: targetConnectionString,
  connectionTimeoutMillis: 3000,
  max: 10
});

let isPostgresConnected = false;

/**
 * Ensures database vyapar_db exists on local PostgreSQL instance before connecting.
 */
async function bootstrapPostgresDatabase() {
  const rootClient = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres', // Default administrative database that always exists in pgAdmin 4
    connectionTimeoutMillis: 3000
  });

  try {
    await rootClient.connect();
    console.log(`🔌 Checking PostgreSQL server connection at ${host}:${port}...`);

    const checkRes = await rootClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [databaseName]
    );

    if (checkRes.rows.length === 0) {
      console.log(`🔨 Database '${databaseName}' not found. Auto-creating database '${databaseName}' for pgAdmin 4...`);
      await rootClient.query(`CREATE DATABASE "${databaseName}"`);
      console.log(`✨ Database '${databaseName}' created successfully in PostgreSQL!`);
    } else {
      console.log(`✔ Database '${databaseName}' confirmed present in PostgreSQL.`);
    }

    await rootClient.end();

    // Now connect pool to vyapar_db
    const client = await pool.connect();
    console.log(`✅ Connected to PostgreSQL database '${databaseName}' at ${host}:${port}`);
    isPostgresConnected = true;
    client.release();
    await initPostgresSchema();
  } catch (err: any) {
    console.log(`⚠️ Could not auto-create/connect PostgreSQL database '${databaseName}' (${err.message}).`);
    console.log(`   Server will run with resilient fallback mode.`);
    isPostgresConnected = false;
  }
}

// Run bootstrap process on server start
bootstrapPostgresDatabase();

export function isDbConnected(): boolean {
  return isPostgresConnected;
}

/**
 * Executes a SQL query against PostgreSQL with parameter binding
 */
export async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}

/**
 * Initializes table DDL schema on PostgreSQL server startup
 */
async function initPostgresSchema() {
  const schemaSql = `
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
      min_stock_alert INT DEFAULT 5,
      current_stock INT DEFAULT 0,
      cgst_rate NUMERIC(5,2) DEFAULT 0.00,
      sgst_rate NUMERIC(5,2) DEFAULT 0.00,
      igst_rate NUMERIC(5,2) DEFAULT 0.00,
      is_active BOOLEAN DEFAULT TRUE,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

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

    CREATE TABLE IF NOT EXISTS invoice_items (
      id SERIAL PRIMARY KEY,
      invoice_id INT REFERENCES invoices(id) ON DELETE CASCADE,
      item_id INT REFERENCES items(id),
      item_name VARCHAR(255) NOT NULL,
      hsn_sac_code VARCHAR(32),
      unit_type VARCHAR(16),
      quantity INT NOT NULL,
      unit_price NUMERIC(12,2) NOT NULL,
      purchase_price NUMERIC(12,2) DEFAULT 0.00,
      tax_amount NUMERIC(12,2) DEFAULT 0.00,
      total_amount NUMERIC(12,2) NOT NULL
    );

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
  `;

  try {
    await pool.query(schemaSql);
    console.log('✅ PostgreSQL Schema tables (items, parties, invoices, invoice_items, journal_entries) ready for pgAdmin 4.');
  } catch (err) {
    console.error('Error initializing PostgreSQL schema:', err);
  }
}
