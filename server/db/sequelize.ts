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
export class CompanyProfile extends Model {
  declare id: number;
  declare tenantId: string;
  declare name: string;
  declare phone: string;
  declare email: string;
  declare address: string;
  declare gstin: string;
  declare businessType: string;
  declare businessCategory: string;
  declare pincode: string;
  declare logoUrl: string;
  declare signatureUrl: string;
  declare booksBeginDate: string;
}
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
export class Item extends Model {
  declare id: number;
  declare tenantId: string;
  declare name: string;
  declare skuCode: string;
  declare barcode: string;
  declare hsnSacCode: string;
  declare unitType: string;
  declare purchasePrice: number;
  declare salesPrice: number;
  declare minStockAlert: number;
  declare currentStock: number;
  declare cgstRate: number;
  declare sgstRate: number;
  declare igstRate: number;
  declare isActive: boolean;
}
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
    minStockAlert: { type: DataTypes.FLOAT, defaultValue: 5.0, field: 'min_stock_alert' },
    currentStock: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'current_stock' },
    cgstRate: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'cgst_rate' },
    sgstRate: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'sgst_rate' },
    igstRate: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'igst_rate' },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' }
  },
  { sequelize, modelName: 'Item', tableName: 'items', timestamps: false }
);

// 3. Party Model
export class Party extends Model {
  declare id: number;
  declare tenantId: string;
  declare name: string;
  declare phone: string;
  declare type: string;
  declare openingBalance: number;
  declare balanceType: string;
  declare currentBalance: number;
  declare gstin: string;
  declare address: string;
}
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
export class Invoice extends Model {
  declare id: number;
  declare invoiceId: string;
  declare tenantId: string;
  declare invoiceNumber: string;
  declare invoiceDate: string;
  declare partyId: number;
  declare partyName: string;
  declare partyPhone: string;
  declare partyGstin: string;
  declare subtotal: number;
  declare taxTotal: number;
  declare discountTotal: number;
  declare grandTotal: number;
  declare receivedAmount: number;
  declare dueAmount: number;
  declare paymentStatus: string;
  declare paymentMethod: string;
}
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
export class InvoiceItem extends Model {
  declare id: number;
  declare invoiceId: number;
  declare itemId: number;
  declare itemName: string;
  declare hsnSacCode: string;
  declare unitType: string;
  declare quantity: number;
  declare unitPrice: number;
  declare purchasePrice: number;
  declare taxAmount: number;
  declare totalAmount: number;
}
InvoiceItem.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    invoiceId: { type: DataTypes.INTEGER, allowNull: false, field: 'invoice_id' },
    itemId: { type: DataTypes.INTEGER, allowNull: true, field: 'item_id' },
    itemName: { type: DataTypes.STRING, allowNull: false, field: 'item_name' },
    hsnSacCode: { type: DataTypes.STRING, allowNull: true, field: 'hsn_sac_code' },
    unitType: { type: DataTypes.STRING, defaultValue: 'PCS', field: 'unit_type' },
    quantity: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1.0 },
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
export class JournalEntry extends Model {
  declare id: number;
  declare tenantId: string;
  declare entryNumber: string;
  declare referenceId: string;
  declare transactionDate: string;
  declare description: string;
  declare totalDebit: number;
  declare totalCredit: number;
}
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

// 7. LedgerAccount Model
export class LedgerAccount extends Model {
  declare id: number;
  declare tenantId: string;
  declare accountCode: string;
  declare accountName: string;
  declare accountType: string;
  declare balance: number;
  declare description: string;
}
LedgerAccount.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    tenantId: { type: DataTypes.STRING, defaultValue: 'default-tenant', field: 'tenant_id' },
    accountCode: { type: DataTypes.STRING, allowNull: false, field: 'account_code' },
    accountName: { type: DataTypes.STRING, allowNull: false, field: 'account_name' },
    accountType: { type: DataTypes.STRING, defaultValue: 'ASSET', field: 'account_type' },
    balance: { type: DataTypes.FLOAT, defaultValue: 0.0 },
    description: { type: DataTypes.TEXT, allowNull: true }
  },
  { sequelize, modelName: 'LedgerAccount', tableName: 'ledger_accounts', timestamps: false }
);

// 8. Estimate & EstimateItem Models
export class Estimate extends Model {
  declare id: number;
  declare estimateId: string;
  declare tenantId: string;
  declare estimateNumber: string;
  declare estimateDate: string;
  declare partyId: number;
  declare partyName: string;
  declare partyPhone: string;
  declare partyGstin: string;
  declare subtotal: number;
  declare taxTotal: number;
  declare discountTotal: number;
  declare grandTotal: number;
  declare status: string;
}
Estimate.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    estimateId: { type: DataTypes.STRING, allowNull: false, unique: true, field: 'estimate_id' },
    tenantId: { type: DataTypes.STRING, defaultValue: 'default-tenant', field: 'tenant_id' },
    estimateNumber: { type: DataTypes.STRING, allowNull: false, field: 'estimate_number' },
    estimateDate: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW, field: 'estimate_date' },
    partyId: { type: DataTypes.INTEGER, allowNull: true, field: 'party_id' },
    partyName: { type: DataTypes.STRING, allowNull: false, field: 'party_name' },
    partyPhone: { type: DataTypes.STRING, allowNull: true, field: 'party_phone' },
    partyGstin: { type: DataTypes.STRING, allowNull: true, field: 'party_gstin' },
    subtotal: { type: DataTypes.FLOAT, defaultValue: 0.0 },
    taxTotal: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'tax_total' },
    discountTotal: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'discount_total' },
    grandTotal: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'grand_total' },
    status: { type: DataTypes.STRING, defaultValue: 'OPEN' }
  },
  { sequelize, modelName: 'Estimate', tableName: 'estimates', timestamps: false }
);

export class EstimateItem extends Model {
  declare id: number;
  declare estimateId: number;
  declare itemId: number;
  declare itemName: string;
  declare hsnSacCode: string;
  declare unitType: string;
  declare quantity: number;
  declare unitPrice: number;
  declare taxAmount: number;
  declare totalAmount: number;
}
EstimateItem.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    estimateId: { type: DataTypes.INTEGER, allowNull: false, field: 'estimate_id' },
    itemId: { type: DataTypes.INTEGER, allowNull: true, field: 'item_id' },
    itemName: { type: DataTypes.STRING, allowNull: false, field: 'item_name' },
    hsnSacCode: { type: DataTypes.STRING, allowNull: true, field: 'hsn_sac_code' },
    unitType: { type: DataTypes.STRING, defaultValue: 'PCS', field: 'unit_type' },
    quantity: { type: DataTypes.FLOAT, defaultValue: 1.0 },
    unitPrice: { type: DataTypes.FLOAT, allowNull: false, field: 'unit_price' },
    taxAmount: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'tax_amount' },
    totalAmount: { type: DataTypes.FLOAT, allowNull: false, field: 'total_amount' }
  },
  { sequelize, modelName: 'EstimateItem', tableName: 'estimate_items', timestamps: false }
);

Estimate.hasMany(EstimateItem, { foreignKey: 'estimateId', as: 'items', onDelete: 'CASCADE' });
EstimateItem.belongsTo(Estimate, { foreignKey: 'estimateId' });

// 9. PaymentIn Model
export class PaymentIn extends Model {
  declare id: number;
  declare receiptNumber: string;
  declare tenantId: string;
  declare partyId: number;
  declare partyName: string;
  declare partyPhone: string;
  declare paymentDate: string;
  declare paymentMethod: string;
  declare amount: number;
  declare notes: string;
}
PaymentIn.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    receiptNumber: { type: DataTypes.STRING, allowNull: false, unique: true, field: 'receipt_number' },
    tenantId: { type: DataTypes.STRING, defaultValue: 'default-tenant', field: 'tenant_id' },
    partyId: { type: DataTypes.INTEGER, allowNull: true, field: 'party_id' },
    partyName: { type: DataTypes.STRING, allowNull: false, field: 'party_name' },
    partyPhone: { type: DataTypes.STRING, allowNull: true, field: 'party_phone' },
    paymentDate: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW, field: 'payment_date' },
    paymentMethod: { type: DataTypes.STRING, defaultValue: 'CASH', field: 'payment_method' },
    amount: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0.0 },
    notes: { type: DataTypes.TEXT, allowNull: true }
  },
  { sequelize, modelName: 'PaymentIn', tableName: 'payment_in', timestamps: false }
);

// 9b. PaymentOut Model
export class PaymentOut extends Model {
  declare id: number;
  declare receiptNumber: string;
  declare tenantId: string;
  declare partyId: number;
  declare partyName: string;
  declare partyPhone: string;
  declare paymentDate: string;
  declare paymentMethod: string;
  declare amount: number;
  declare notes: string;
}
PaymentOut.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    receiptNumber: { type: DataTypes.STRING, allowNull: false, unique: true, field: 'receipt_number' },
    tenantId: { type: DataTypes.STRING, defaultValue: 'default-tenant', field: 'tenant_id' },
    partyId: { type: DataTypes.INTEGER, allowNull: true, field: 'party_id' },
    partyName: { type: DataTypes.STRING, allowNull: false, field: 'party_name' },
    partyPhone: { type: DataTypes.STRING, allowNull: true, field: 'party_phone' },
    paymentDate: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW, field: 'payment_date' },
    paymentMethod: { type: DataTypes.STRING, defaultValue: 'CASH', field: 'payment_method' },
    amount: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0.0 },
    notes: { type: DataTypes.TEXT, allowNull: true }
  },
  { sequelize, modelName: 'PaymentOut', tableName: 'payment_out', timestamps: false }
);

// 9c. Expense Model
export class Expense extends Model {
  declare id: number;
  declare expenseNumber: string;
  declare tenantId: string;
  declare categoryName: string;
  declare expenseDate: string;
  declare paymentMode: string;
  declare amount: number;
  declare notes: string;
}
Expense.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    expenseNumber: { type: DataTypes.STRING, allowNull: false, unique: true, field: 'expense_number' },
    tenantId: { type: DataTypes.STRING, defaultValue: 'default-tenant', field: 'tenant_id' },
    categoryName: { type: DataTypes.STRING, allowNull: false, defaultValue: 'Miscellaneous', field: 'category_name' },
    expenseDate: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW, field: 'expense_date' },
    paymentMode: { type: DataTypes.STRING, defaultValue: 'CASH', field: 'payment_mode' },
    amount: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0.0 },
    notes: { type: DataTypes.TEXT, allowNull: true }
  },
  { sequelize, modelName: 'Expense', tableName: 'expenses', timestamps: false }
);

// 10. PurchaseOrder & PurchaseOrderItem Models
export class PurchaseOrder extends Model {
  declare id: number;
  declare poId: string;
  declare tenantId: string;
  declare poNumber: string;
  declare poDate: string;
  declare supplierId: number;
  declare supplierName: string;
  declare supplierPhone: string;
  declare supplierGstin: string;
  declare subtotal: number;
  declare taxTotal: number;
  declare grandTotal: number;
  declare status: string;
  declare notes: string;
}

PurchaseOrder.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    poId: { type: DataTypes.STRING, allowNull: false, unique: true, field: 'po_id' },
    tenantId: { type: DataTypes.STRING, defaultValue: 'default-tenant', field: 'tenant_id' },
    poNumber: { type: DataTypes.STRING, allowNull: false, field: 'po_number' },
    poDate: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW, field: 'po_date' },
    supplierId: { type: DataTypes.INTEGER, allowNull: true, field: 'supplier_id' },
    supplierName: { type: DataTypes.STRING, allowNull: false, field: 'supplier_name' },
    supplierPhone: { type: DataTypes.STRING, allowNull: true, field: 'supplier_phone' },
    supplierGstin: { type: DataTypes.STRING, allowNull: true, field: 'supplier_gstin' },
    subtotal: { type: DataTypes.FLOAT, defaultValue: 0.0 },
    taxTotal: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'tax_total' },
    grandTotal: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'grand_total' },
    status: { type: DataTypes.STRING, defaultValue: 'PENDING' },
    notes: { type: DataTypes.TEXT, allowNull: true }
  },
  { sequelize, modelName: 'PurchaseOrder', tableName: 'purchase_orders', timestamps: false }
);

export class PurchaseOrderItem extends Model {
  declare id: number;
  declare purchaseOrderId: number;
  declare itemId: number;
  declare itemName: string;
  declare unitType: string;
  declare quantity: number;
  declare purchasePrice: number;
  declare totalAmount: number;
}

PurchaseOrderItem.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    purchaseOrderId: { type: DataTypes.INTEGER, allowNull: false, field: 'purchase_order_id' },
    itemId: { type: DataTypes.INTEGER, allowNull: true, field: 'item_id' },
    itemName: { type: DataTypes.STRING, allowNull: false, field: 'item_name' },
    unitType: { type: DataTypes.STRING, defaultValue: 'PCS', field: 'unit_type' },
    quantity: { type: DataTypes.FLOAT, defaultValue: 1.0 },
    purchasePrice: { type: DataTypes.FLOAT, allowNull: false, field: 'purchase_price' },
    totalAmount: { type: DataTypes.FLOAT, allowNull: false, field: 'total_amount' }
  },
  { sequelize, modelName: 'PurchaseOrderItem', tableName: 'purchase_order_items', timestamps: false }
);

PurchaseOrder.hasMany(PurchaseOrderItem, { foreignKey: 'purchaseOrderId', as: 'items', onDelete: 'CASCADE' });
PurchaseOrderItem.belongsTo(PurchaseOrder, { foreignKey: 'purchaseOrderId' });

// 11. PurchaseBill & PurchaseBillItem Models
export class PurchaseBill extends Model {
  declare id: number;
  declare billId: string;
  declare tenantId: string;
  declare billNumber: string;
  declare billDate: string;
  declare supplierId: number;
  declare supplierName: string;
  declare supplierPhone: string;
  declare supplierGstin: string;
  declare subtotal: number;
  declare taxTotal: number;
  declare grandTotal: number;
  declare notes: string;
}

PurchaseBill.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    billId: { type: DataTypes.STRING, allowNull: false, unique: true, field: 'bill_id' },
    tenantId: { type: DataTypes.STRING, defaultValue: 'default-tenant', field: 'tenant_id' },
    billNumber: { type: DataTypes.STRING, allowNull: false, field: 'bill_number' },
    billDate: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW, field: 'bill_date' },
    supplierId: { type: DataTypes.INTEGER, allowNull: true, field: 'supplier_id' },
    supplierName: { type: DataTypes.STRING, allowNull: false, field: 'supplier_name' },
    supplierPhone: { type: DataTypes.STRING, allowNull: true, field: 'supplier_phone' },
    supplierGstin: { type: DataTypes.STRING, allowNull: true, field: 'supplier_gstin' },
    subtotal: { type: DataTypes.FLOAT, defaultValue: 0.0 },
    taxTotal: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'tax_total' },
    grandTotal: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'grand_total' },
    notes: { type: DataTypes.TEXT, allowNull: true }
  },
  { sequelize, modelName: 'PurchaseBill', tableName: 'purchase_bills', timestamps: false }
);

export class PurchaseBillItem extends Model {
  declare id: number;
  declare purchaseBillId: number;
  declare itemId: number;
  declare itemName: string;
  declare hsnSacCode: string;
  declare unitType: string;
  declare quantity: number;
  declare unitPrice: number;
  declare purchasePrice: number;
  declare taxAmount: number;
  declare totalAmount: number;
}

PurchaseBillItem.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    purchaseBillId: { type: DataTypes.INTEGER, allowNull: false, field: 'purchase_bill_id' },
    itemId: { type: DataTypes.INTEGER, allowNull: true, field: 'item_id' },
    itemName: { type: DataTypes.STRING, allowNull: false, field: 'item_name' },
    hsnSacCode: { type: DataTypes.STRING, allowNull: true, field: 'hsn_sac_code' },
    unitType: { type: DataTypes.STRING, defaultValue: 'PCS', field: 'unit_type' },
    quantity: { type: DataTypes.FLOAT, defaultValue: 1.0 },
    unitPrice: { type: DataTypes.FLOAT, allowNull: false, field: 'unit_price' },
    purchasePrice: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'purchase_price' },
    taxAmount: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'tax_amount' },
    totalAmount: { type: DataTypes.FLOAT, allowNull: false, field: 'total_amount' }
  },
  { sequelize, modelName: 'PurchaseBillItem', tableName: 'purchase_bill_items', timestamps: false }
);

PurchaseBill.hasMany(PurchaseBillItem, { foreignKey: 'purchaseBillId', as: 'items', onDelete: 'CASCADE' });
PurchaseBillItem.belongsTo(PurchaseBill, { foreignKey: 'purchaseBillId' });

// 12. PurchaseReturn & PurchaseReturnItem Models
export class PurchaseReturn extends Model {
  declare id: number;
  declare returnId: string;
  declare tenantId: string;
  declare debitNoteNumber: string;
  declare returnDate: string;
  declare purchaseBillNumber: string;
  declare supplierId: number;
  declare supplierName: string;
  declare supplierPhone: string;
  declare subtotal: number;
  declare grandTotal: number;
  declare notes: string;
}

PurchaseReturn.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    returnId: { type: DataTypes.STRING, allowNull: false, unique: true, field: 'return_id' },
    tenantId: { type: DataTypes.STRING, defaultValue: 'default-tenant', field: 'tenant_id' },
    debitNoteNumber: { type: DataTypes.STRING, allowNull: false, unique: true, field: 'debit_note_number' },
    returnDate: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW, field: 'return_date' },
    purchaseBillNumber: { type: DataTypes.STRING, allowNull: true, field: 'purchase_bill_number' },
    supplierId: { type: DataTypes.INTEGER, allowNull: true, field: 'supplier_id' },
    supplierName: { type: DataTypes.STRING, allowNull: false, field: 'supplier_name' },
    supplierPhone: { type: DataTypes.STRING, allowNull: true, field: 'supplier_phone' },
    subtotal: { type: DataTypes.FLOAT, defaultValue: 0.0 },
    grandTotal: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'grand_total' },
    notes: { type: DataTypes.TEXT, allowNull: true }
  },
  { sequelize, modelName: 'PurchaseReturn', tableName: 'purchase_returns', timestamps: true }
);

export class PurchaseReturnItem extends Model {
  declare id: number;
  declare purchaseReturnId: number;
  declare itemId: number;
  declare itemName: string;
  declare unitType: string;
  declare returnQuantity: number;
  declare unitPrice: number;
  declare totalAmount: number;
}

PurchaseReturnItem.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    purchaseReturnId: { type: DataTypes.INTEGER, allowNull: false, field: 'purchase_return_id' },
    itemId: { type: DataTypes.INTEGER, allowNull: true, field: 'item_id' },
    itemName: { type: DataTypes.STRING, allowNull: false, field: 'item_name' },
    unitType: { type: DataTypes.STRING, defaultValue: 'PCS', field: 'unit_type' },
    returnQuantity: { type: DataTypes.FLOAT, defaultValue: 1.0, field: 'return_quantity' },
    unitPrice: { type: DataTypes.FLOAT, allowNull: false, field: 'unit_price' },
    totalAmount: { type: DataTypes.FLOAT, allowNull: false, field: 'total_amount' }
  },
  { sequelize, modelName: 'PurchaseReturnItem', tableName: 'purchase_return_items', timestamps: false }
);

PurchaseReturn.hasMany(PurchaseReturnItem, { foreignKey: 'purchaseReturnId', as: 'items', onDelete: 'CASCADE' });
PurchaseReturnItem.belongsTo(PurchaseReturn, { foreignKey: 'purchaseReturnId' });

/**
 * Seeds standard Chart of Accounts in PostgreSQL if empty
 */
export async function seedServerLedgerAccounts(tenantId: string = 'default-tenant') {
  try {
    const count = await LedgerAccount.count({ where: { tenantId } });
    if (count === 0) {
      console.log(`🌱 Seeding PostgreSQL Chart of Accounts for tenant '${tenantId}'...`);
      await LedgerAccount.bulkCreate([
        { tenantId, accountCode: '1010', accountName: 'Cash in Hand', accountType: 'ASSET', balance: 0.0, description: 'Physical cash at POS counter' },
        { tenantId, accountCode: '1020', accountName: 'HDFC Bank Account', accountType: 'ASSET', balance: 0.0, description: 'Operating bank account for UPI/Card' },
        { tenantId, accountCode: '1030', accountName: 'Accounts Receivable', accountType: 'ASSET', balance: 0.0, description: 'Customer credit receivables' },
        { tenantId, accountCode: '1040', accountName: 'Merchandise Inventory Asset', accountType: 'ASSET', balance: 0.0, description: 'Total inventory stock value at cost' },
        { tenantId, accountCode: '2010', accountName: 'Accounts Payable', accountType: 'LIABILITY', balance: 0.0, description: 'Supplier payables' },
        { tenantId, accountCode: '2020', accountName: 'GST Output Tax Liability', accountType: 'LIABILITY', balance: 0.0, description: 'Collected GST payable to tax authority' },
        { tenantId, accountCode: '3010', accountName: 'Owner Equity Capital', accountType: 'EQUITY', balance: 0.0, description: 'Initial owner capital investment' },
        { tenantId, accountCode: '4010', accountName: 'Sales Revenue', accountType: 'REVENUE', balance: 0.0, description: 'Gross merchandise sales revenue' },
        { tenantId, accountCode: '5010', accountName: 'Cost of Goods Sold (COGS)', accountType: 'EXPENSE', balance: 0.0, description: 'Purchase cost of goods sold' },
        { tenantId, accountCode: '5020', accountName: 'Sales Discounts Allowed', accountType: 'EXPENSE', balance: 0.0, description: 'Discounts granted to customers' }
      ]);
      console.log(`✅ PostgreSQL Chart of Accounts seeded successfully for '${tenantId}'.`);
    }
  } catch (err) {
    console.error('Error seeding Ledger Accounts:', err);
  }
}

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
    await sequelize.sync({ alter: true });
    await seedServerLedgerAccounts();
    console.log(`✨ Sequelize Migration Complete: Database tables (company_profile, items, parties, invoices, invoice_items, journal_entries, ledger_accounts) ready!`);
    isSequelizeConnected = true;
  } catch (err: any) {
    console.warn(`⚠️ Sequelize Connection Warning: ${err.message}`);
    isSequelizeConnected = false;
  }
}
