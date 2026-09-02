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

// 0. User Model
export class User extends Model {
  declare id: number;
  declare userId: string;
  declare tenantId: string;
  declare fullName: string;
  declare email: string;
  declare phone: string;
  declare passwordHash: string;
  declare role: string;
  declare resetToken: string | null;
  declare resetTokenExpiry: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}
User.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.STRING, allowNull: false, unique: true, field: 'user_id' },
    tenantId: { type: DataTypes.STRING, defaultValue: 'default-tenant', field: 'tenant_id' },
    fullName: { type: DataTypes.STRING, allowNull: false, field: 'full_name' },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    phone: { type: DataTypes.STRING, defaultValue: '' },
    passwordHash: { type: DataTypes.STRING, allowNull: false, field: 'password_hash' },
    role: { type: DataTypes.STRING, defaultValue: 'OWNER' },
    resetToken: { type: DataTypes.STRING, allowNull: true, field: 'reset_token' },
    resetTokenExpiry: { type: DataTypes.DATE, allowNull: true, field: 'reset_token_expiry' }
  },
  { sequelize, modelName: 'User', tableName: 'users', timestamps: true }
);

// 1. CompanyProfile Model
export class CompanyProfile extends Model {
  declare id: number;
  declare userId: string;
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
    userId: { type: DataTypes.STRING, allowNull: true, field: 'user_id' },
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
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: () => `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
    invoiceId: { type: DataTypes.STRING, allowNull: false, field: 'invoice_id' },
    tenantId: { type: DataTypes.STRING, defaultValue: 'default-tenant', field: 'tenant_id' },
    invoiceNumber: { type: DataTypes.STRING, allowNull: false, field: 'invoice_number' },
    invoiceDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'invoice_date' },
    partyId: { type: DataTypes.STRING, allowNull: true, field: 'party_id' },
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
  declare id: string;
  declare invoiceId: string;
  declare itemId: string;
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
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: () => `invi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
    invoiceId: { type: DataTypes.STRING, allowNull: false, field: 'invoice_id' },
    itemId: { type: DataTypes.STRING, allowNull: true, field: 'item_id' },
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
  declare id: string | number;
  declare billId: string;
  declare tenantId: string;
  declare billNumber: string;
  declare billDate: string;
  declare supplierId: string | number;
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
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: () => `pb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
    billId: { type: DataTypes.STRING, allowNull: false, unique: true, field: 'bill_id' },
    tenantId: { type: DataTypes.STRING, defaultValue: 'default-tenant', field: 'tenant_id' },
    billNumber: { type: DataTypes.STRING, allowNull: false, field: 'bill_number' },
    billDate: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW, field: 'bill_date' },
    supplierId: { type: DataTypes.STRING, allowNull: true, field: 'supplier_id' },
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
  declare id: string | number;
  declare purchaseBillId: string | number;
  declare itemId: string | number;
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
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: () => `pbi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
    purchaseBillId: { type: DataTypes.STRING, allowNull: false, field: 'purchase_bill_id' },
    itemId: { type: DataTypes.STRING, allowNull: true, field: 'item_id' },
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

// 13. SaleReturn & SaleReturnItem Models (Credit Note / Cr. Note)
export class SaleReturn extends Model {
  declare id: number;
  declare returnId: string;
  declare tenantId: string;
  declare creditNoteNumber: string;
  declare returnDate: string;
  declare invoiceNumber: string;
  declare partyId: number;
  declare partyName: string;
  declare partyPhone: string;
  declare subtotal: number;
  declare taxTotal: number;
  declare grandTotal: number;
  declare refundAmount: number;
  declare notes: string;
}

SaleReturn.init(
  {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: () => `sr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
    returnId: { type: DataTypes.STRING, allowNull: false, unique: true, field: 'return_id' },
    tenantId: { type: DataTypes.STRING, defaultValue: 'default-tenant', field: 'tenant_id' },
    creditNoteNumber: { type: DataTypes.STRING, allowNull: false, unique: true, field: 'credit_note_number' },
    returnDate: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW, field: 'return_date' },
    invoiceNumber: { type: DataTypes.STRING, allowNull: true, field: 'invoice_number' },
    partyId: { type: DataTypes.STRING, allowNull: true, field: 'party_id' },
    partyName: { type: DataTypes.STRING, allowNull: false, field: 'party_name' },
    partyPhone: { type: DataTypes.STRING, allowNull: true, field: 'party_phone' },
    subtotal: { type: DataTypes.FLOAT, defaultValue: 0.0 },
    taxTotal: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'tax_total' },
    grandTotal: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'grand_total' },
    refundAmount: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'refund_amount' },
    notes: { type: DataTypes.TEXT, allowNull: true }
  },
  { sequelize, modelName: 'SaleReturn', tableName: 'sale_returns', timestamps: true }
);

export class SaleReturnItem extends Model {
  declare id: string;
  declare saleReturnId: string;
  declare itemId: string;
  declare itemName: string;
  declare hsnSacCode: string;
  declare unitType: string;
  declare returnQuantity: number;
  declare unitPrice: number;
  declare taxAmount: number;
  declare totalAmount: number;
}

SaleReturnItem.init(
  {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: () => `sri-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
    saleReturnId: { type: DataTypes.STRING, allowNull: false, field: 'sale_return_id' },
    itemId: { type: DataTypes.STRING, allowNull: true, field: 'item_id' },
    itemName: { type: DataTypes.STRING, allowNull: false, field: 'item_name' },
    hsnSacCode: { type: DataTypes.STRING, defaultValue: '1000', field: 'hsn_sac_code' },
    unitType: { type: DataTypes.STRING, defaultValue: 'PCS', field: 'unit_type' },
    returnQuantity: { type: DataTypes.FLOAT, defaultValue: 1.0, field: 'return_quantity' },
    unitPrice: { type: DataTypes.FLOAT, allowNull: false, field: 'unit_price' },
    taxAmount: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'tax_amount' },
    totalAmount: { type: DataTypes.FLOAT, allowNull: false, field: 'total_amount' }
  },
  { sequelize, modelName: 'SaleReturnItem', tableName: 'sale_return_items', timestamps: false }
);

SaleReturn.hasMany(SaleReturnItem, { foreignKey: 'saleReturnId', as: 'items', onDelete: 'CASCADE' });
SaleReturnItem.belongsTo(SaleReturn, { foreignKey: 'saleReturnId' });

// 21. CashAccount Model
export class CashAccount extends Model {
  declare id: number;
  declare tenantId: string;
  declare name: string;
  declare openingBalance: number;
  declare createdAt: Date;
  declare updatedAt: Date;
}
CashAccount.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    tenantId: { type: DataTypes.STRING, defaultValue: 'default-tenant', field: 'tenant_id' },
    name: { type: DataTypes.STRING, defaultValue: 'Main Cash Drawer' },
    openingBalance: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0.00, field: 'opening_balance' }
  },
  { sequelize, modelName: 'CashAccount', tableName: 'cash_accounts', timestamps: true }
);

// 22. CashTransaction Model
export class CashTransaction extends Model {
  declare id: number;
  declare cashAccountId: number;
  declare tenantId: string;
  declare type: 'IN' | 'OUT';
  declare amount: number;
  declare source: string;
  declare referenceId: string;
  declare description: string;
  declare transactionDate: string;
  declare createdAt: Date;
}
CashTransaction.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    cashAccountId: { type: DataTypes.INTEGER, allowNull: false, field: 'cash_account_id' },
    tenantId: { type: DataTypes.STRING, defaultValue: 'default-tenant', field: 'tenant_id' },
    type: { type: DataTypes.STRING(10), allowNull: false },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    source: { type: DataTypes.STRING(50), allowNull: false },
    referenceId: { type: DataTypes.STRING(100), allowNull: true, field: 'reference_id' },
    description: { type: DataTypes.TEXT, allowNull: true },
    transactionDate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'transaction_date' }
  },
  { sequelize, modelName: 'CashTransaction', tableName: 'cash_transactions', timestamps: true }
);

CashTransaction.belongsTo(CashAccount, { foreignKey: 'cashAccountId', as: 'cashAccount' });
CashAccount.hasMany(CashTransaction, { foreignKey: 'cashAccountId', as: 'transactions' });

// 23. InventoryLocation Model
export class InventoryLocation extends Model {
  declare id: string | number;
  declare tenantId: string;
  declare name: string;
  declare code: string;
  declare type: string;
  declare parentId: string | number | null;
  declare capacity: number;
  declare description: string;
  declare isShared: boolean;
  declare allowedTenantIds: string[];
}
InventoryLocation.init(
  {
    id: { type: DataTypes.STRING, primaryKey: true },
    tenantId: { type: DataTypes.STRING, defaultValue: 'default-tenant', field: 'tenant_id' },
    name: { type: DataTypes.STRING, allowNull: false },
    code: { type: DataTypes.STRING, allowNull: false },
    type: { type: DataTypes.STRING, defaultValue: 'WAREHOUSE' },
    parentId: { type: DataTypes.STRING, allowNull: true, field: 'parent_id' },
    capacity: { type: DataTypes.INTEGER, defaultValue: 500 },
    description: { type: DataTypes.TEXT, allowNull: true },
    isShared: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_shared' },
    allowedTenantIds: { type: DataTypes.JSON, defaultValue: [], field: 'allowed_tenant_ids' }
  },
  { sequelize, modelName: 'InventoryLocation', tableName: 'inventory_locations', timestamps: true }
);

// 24. ItemLocationMapping Model
export class ItemLocationMapping extends Model {
  declare id: string | number;
  declare tenantId: string;
  declare itemId: string | number;
  declare locationId: string | number;
  declare quantity: number;
  declare maxCapacity: number;
}
ItemLocationMapping.init(
  {
    id: { type: DataTypes.STRING, primaryKey: true },
    tenantId: { type: DataTypes.STRING, defaultValue: 'default-tenant', field: 'tenant_id' },
    itemId: { type: DataTypes.STRING, allowNull: false, field: 'item_id' },
    locationId: { type: DataTypes.STRING, allowNull: false, field: 'location_id' },
    quantity: { type: DataTypes.FLOAT, defaultValue: 0.0 },
    maxCapacity: { type: DataTypes.INTEGER, defaultValue: 100, field: 'max_capacity' }
  },
  { sequelize, modelName: 'ItemLocationMapping', tableName: 'item_location_mappings', timestamps: true }
);

// 25. StockTransfer Model
export class StockTransfer extends Model {
  declare id: string | number;
  declare transferNumber: string;
  declare tenantId: string;
  declare sourceLocationId: string | number;
  declare destinationLocationId: string | number;
  declare itemId: string | number;
  declare quantity: number;
  declare transferDate: string;
  declare notes: string;
}
StockTransfer.init(
  {
    id: { type: DataTypes.STRING, primaryKey: true },
    transferNumber: { type: DataTypes.STRING, allowNull: false, unique: true, field: 'transfer_number' },
    tenantId: { type: DataTypes.STRING, defaultValue: 'default-tenant', field: 'tenant_id' },
    sourceLocationId: { type: DataTypes.STRING, allowNull: false, field: 'source_location_id' },
    destinationLocationId: { type: DataTypes.STRING, allowNull: false, field: 'destination_location_id' },
    itemId: { type: DataTypes.STRING, allowNull: false, field: 'item_id' },
    quantity: { type: DataTypes.FLOAT, defaultValue: 1.0 },
    transferDate: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW, field: 'transfer_date' },
    notes: { type: DataTypes.TEXT, allowNull: true }
  },
  { sequelize, modelName: 'StockTransfer', tableName: 'stock_transfers', timestamps: true }
);

// 26. StoreWarehouseAccess Model
export class StoreWarehouseAccess extends Model {
  declare id: string;
  declare tenantId: string;
  declare storeId: string;
  declare warehouseId: string;
  declare createdAt: Date;
}
StoreWarehouseAccess.init(
  {
    id: { type: DataTypes.STRING, primaryKey: true },
    tenantId: { type: DataTypes.STRING, defaultValue: 'default-tenant', field: 'tenant_id' },
    storeId: { type: DataTypes.STRING, allowNull: false, field: 'store_id' },
    warehouseId: { type: DataTypes.STRING, allowNull: false, field: 'warehouse_id' }
  },
  { sequelize, modelName: 'StoreWarehouseAccess', tableName: 'store_warehouse_access', timestamps: true, updatedAt: false }
);

/**
 * Bootstrap database creation and sync Sequelize ORM models
 */
export async function bootstrapSequelize() {
  try {
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
    } catch (rootErr: any) {
      console.warn(`⚠️ PostgreSQL root database check note: ${rootErr.message}. Attempting direct connection to '${databaseName}'...`);
    }

    await sequelize.authenticate();
    console.log(`✅ Sequelize ORM successfully authenticated with PostgreSQL database '${databaseName}'`);

    // Drop legacy general ledger tables if present in PostgreSQL
    await sequelize.query(`DROP TABLE IF EXISTS "journal_entries" CASCADE;`).catch(() => {});
    await sequelize.query(`DROP TABLE IF EXISTS "ledger_accounts" CASCADE;`).catch(() => {});

    // Sync ORM models with PostgreSQL tables safely (creates missing tables without heavy locks)
    await sequelize.sync();
    // Ensure purchase_bill_items.purchase_bill_id matches purchase_bills.id VARCHAR type
    await sequelize.query(`ALTER TABLE purchase_bill_items ALTER COLUMN purchase_bill_id TYPE VARCHAR USING purchase_bill_id::VARCHAR;`).catch(() => {});
    console.log(`✨ Sequelize Migration Complete: Document-driven database tables ready!`);
    isSequelizeConnected = true;
  } catch (err: any) {
    console.warn(`⚠️ Sequelize Connection Warning: ${err.message}`);
    isSequelizeConnected = false;
  }
}
