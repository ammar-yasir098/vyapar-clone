import { Sequelize, DataTypes, Model } from 'sequelize';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

const host = process.env.PGHOST || 'localhost';
const port = parseInt(process.env.PGPORT || '5432');
const user = process.env.PGUSER || 'postgres';
const password = process.env.PGPASSWORD || 'postgres';
const databaseName = process.env.PGDATABASE || 'vyapar_db';

export const sequelize = new Sequelize(databaseName, user, password, {
  host,
  port,
  dialect: 'postgres',
  logging: false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

let isSequelizeConnected = false;

export function isDbConnected(): boolean {
  return isSequelizeConnected;
}

// 1. CompanyProfile Model
export class CompanyProfile extends Model {}
CompanyProfile.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    tenantId: { type: DataTypes.STRING, defaultValue: 'default-tenant', field: 'tenant_id' },
    name: { type: DataTypes.STRING, defaultValue: 'SuperMarket Retail & Traders' },
    phone: { type: DataTypes.STRING, defaultValue: '+92 300 xxxxxxx' },
    email: { type: DataTypes.STRING, defaultValue: 'contact@supermarket.com' },
    address: { type: DataTypes.TEXT, defaultValue: 'Shop #12, Commercial Market, Main Boulevard, Gulberg, Lahore' },
    gstin: { type: DataTypes.STRING, defaultValue: 'NTN: 7654321-0' },
    businessType: { type: DataTypes.STRING, defaultValue: 'Retail', field: 'business_type' },
    businessCategory: { type: DataTypes.STRING, defaultValue: 'Supermarket & FMCG', field: 'business_category' },
    pincode: { type: DataTypes.STRING, defaultValue: '54000' },
    logoUrl: { type: DataTypes.TEXT, allowNull: true, field: 'logo_url' },
    signatureUrl: { type: DataTypes.TEXT, allowNull: true, field: 'signature_url' },
    booksBeginDate: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW, field: 'books_begin_date' }
  },
  { sequelize, modelName: 'CompanyProfile', tableName: 'company_profile', timestamps: false }
);

// 2. Item Model
export class Item extends Model {}
Item.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    tenantId: { type: DataTypes.STRING, defaultValue: 'default-tenant', field: 'tenant_id' },
    name: { type: DataTypes.STRING, allowNull: false },
    skuCode: { type: DataTypes.STRING, field: 'sku_code' },
    barcode: { type: DataTypes.STRING },
    hsnSacCode: { type: DataTypes.STRING, defaultValue: '1000', field: 'hsn_sac_code' },
    unitType: { type: DataTypes.STRING, defaultValue: 'PCS', field: 'unit_type' },
    purchasePrice: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'purchase_price' },
    salesPrice: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'sales_price' },
    minStockAlert: { type: DataTypes.INTEGER, defaultValue: 5, field: 'min_stock_alert' },
    currentStock: { type: DataTypes.INTEGER, defaultValue: 0, field: 'current_stock' },
    cgstRate: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'cgst_rate' },
    sgstRate: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'sgst_rate' },
    igstRate: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'igst_rate' },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' }
  },
  { sequelize, modelName: 'Item', tableName: 'items', timestamps: false }
);

// 3. Party Model
export class Party extends Model {}
Party.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    tenantId: { type: DataTypes.STRING, defaultValue: 'default-tenant', field: 'tenant_id' },
    name: { type: DataTypes.STRING, allowNull: false },
    phone: { type: DataTypes.STRING, allowNull: false },
    type: { type: DataTypes.STRING, defaultValue: 'CUSTOMER' },
    openingBalance: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'opening_balance' },
    balanceType: { type: DataTypes.STRING, defaultValue: 'RECEIVABLE', field: 'balance_type' },
    currentBalance: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'current_balance' },
    gstin: { type: DataTypes.STRING, allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: true }
  },
  { sequelize, modelName: 'Party', tableName: 'parties', timestamps: false }
);

// 4. Invoice Model
export class Invoice extends Model {}
Invoice.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    invoiceId: { type: DataTypes.STRING, allowNull: false, field: 'invoice_id' },
    tenantId: { type: DataTypes.STRING, defaultValue: 'default-tenant', field: 'tenant_id' },
    invoiceNumber: { type: DataTypes.STRING, allowNull: false, field: 'invoice_number' },
    invoiceDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'invoice_date' },
    partyId: { type: DataTypes.INTEGER, allowNull: true, field: 'party_id' },
    partyName: { type: DataTypes.STRING, allowNull: false, field: 'party_name' },
    partyPhone: { type: DataTypes.STRING, allowNull: true, field: 'party_phone' },
    partyGstin: { type: DataTypes.STRING, allowNull: true, field: 'party_gstin' },
    subtotal: { type: DataTypes.FLOAT, defaultValue: 0.0 },
    taxTotal: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'tax_total' },
    discountTotal: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'discount_total' },
    grandTotal: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'grand_total' },
    receivedAmount: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'received_amount' },
    dueAmount: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'due_amount' },
    paymentStatus: { type: DataTypes.STRING, defaultValue: 'PAID', field: 'payment_status' },
    paymentMethod: { type: DataTypes.STRING, defaultValue: 'CASH', field: 'payment_method' }
  },
  { sequelize, modelName: 'Invoice', tableName: 'invoices', timestamps: false }
);

// 5. InvoiceItem Model
export class InvoiceItem extends Model {}
InvoiceItem.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    invoiceId: { type: DataTypes.INTEGER, allowNull: false, field: 'invoice_id' },
    itemId: { type: DataTypes.INTEGER, allowNull: true, field: 'item_id' },
    itemName: { type: DataTypes.STRING, allowNull: false, field: 'item_name' },
    hsnSacCode: { type: DataTypes.STRING, allowNull: true, field: 'hsn_sac_code' },
    unitType: { type: DataTypes.STRING, defaultValue: 'PCS', field: 'unit_type' },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    unitPrice: { type: DataTypes.FLOAT, allowNull: false, field: 'unit_price' },
    purchasePrice: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'purchase_price' },
    taxAmount: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'tax_amount' },
    totalAmount: { type: DataTypes.FLOAT, allowNull: false, field: 'total_amount' }
  },
  { sequelize, modelName: 'InvoiceItem', tableName: 'invoice_items', timestamps: false }
);

// Associations
Invoice.hasMany(InvoiceItem, { foreignKey: 'invoiceId', as: 'items' });
InvoiceItem.belongsTo(Invoice, { foreignKey: 'invoiceId' });

// 6. JournalEntry Model
export class JournalEntry extends Model {}
JournalEntry.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    tenantId: { type: DataTypes.STRING, defaultValue: 'default-tenant', field: 'tenant_id' },
    entryNumber: { type: DataTypes.STRING, allowNull: false, field: 'entry_number' },
    referenceId: { type: DataTypes.STRING, allowNull: true, field: 'reference_id' },
    transactionDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'transaction_date' },
    description: { type: DataTypes.TEXT, allowNull: true },
    totalDebit: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'total_debit' },
    totalCredit: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'total_credit' }
  },
  { sequelize, modelName: 'JournalEntry', tableName: 'journal_entries', timestamps: false }
);

/**
 * Bootstrap database creation and sync Sequelize ORM models
 */
export async function bootstrapSequelize() {
  const rootClient = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
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
      console.log(`🔨 Creating database '${databaseName}' for Sequelize ORM...`);
      await rootClient.query(`CREATE DATABASE "${databaseName}"`);
    }
    await rootClient.end();

    await sequelize.authenticate();
    console.log(`✅ Sequelize ORM successfully authenticated with PostgreSQL database '${databaseName}'`);

    // Sync ORM models with PostgreSQL tables
    await sequelize.sync();
    console.log(`✨ Sequelize Migration Complete: Database tables (company_profile, items, parties, invoices, invoice_items, journal_entries) ready!`);
    isSequelizeConnected = true;
  } catch (err: any) {
    console.warn(`⚠️ Sequelize Connection Warning: ${err.message}`);
    isSequelizeConnected = false;
  }
}
