import React, { useState } from 'react';
import { 
  Package, 
  Plus, 
  Search, 
  AlertTriangle, 
  Edit2, 
  Trash2, 
  Layers, 
  Eye, 
  Users, 
  ShoppingBag, 
  FileText, 
  X, 
  Calendar, 
  Phone, 
  CheckCircle2, 
  Clock, 
  Building2, 
  ArrowDownLeft, 
  ArrowUpRight,
  Sparkles
} from 'lucide-react';
import { Item, UnitType, BusinessDetails, Party, ItemRestock, ItemLocationMapping } from '../../types';
import { db } from '../../db';
import { createServerItem, updateServerItem, deleteServerItem, adjustServerItemStock } from '../../services/api';
import { syncManager } from '../../services/sync';
import { useToast } from '../Common/ToastContext';
import { seed100SampleItems } from '../../utils/sampleDataSeeder';

interface InventoryScreenProps {
  items: Item[];
  parties?: Party[];
  business?: BusinessDetails;
  onItemUpdated: () => void;
}

export const InventoryScreen: React.FC<InventoryScreenProps> = ({ 
  items = [], 
  parties = [], 
  business, 
  onItemUpdated 
}) => {
  const { showToast, showConfirm } = useToast();
  const safeItems = Array.isArray(items) ? items : [];
  const suppliers = parties.filter(p => p.type === 'SUPPLIER' || p.type === 'BOTH');

  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [filterLowStock, setFilterLowStock] = useState(false);

  // Stock Adjustment State
  const [selectedItemForAdjustment, setSelectedItemForAdjustment] = useState<Item | null>(null);
  const [adjustQty, setAdjustQty] = useState<number>(0);
  const [adjustType, setAdjustType] = useState<'ADD' | 'REDUCE'>('ADD');
  const [selectedRestockSupplier, setSelectedRestockSupplier] = useState<Party | null>(suppliers[0] || null);

  // Edit Item State
  const [editItem, setEditItem] = useState<Item | null>(null);

  // Multi-Location Inventory Breakdown State (Phase 5)
  const [itemLocs, setItemLocs] = useState<ItemLocationMapping[]>([]);
  const [whLocationIds, setWhLocationIds] = useState<Set<number>>(new Set());

  React.useEffect(() => {
    async function loadLocationData() {
      const locs = await db.locations.toArray();
      const whIds = new Set(locs.filter(l => l.type === 'WAREHOUSE').map(l => Number(l.id)));
      setWhLocationIds(whIds);
      const mappings = await db.itemLocations.toArray();
      setItemLocs(mappings);
    }
    loadLocationData();
  }, [items]);

  // Item Activity & History Modal State
  const [selectedItemForHistory, setSelectedItemForHistory] = useState<Item | null>(null);
  const [historyTab, setHistoryTab] = useState<'sales' | 'restock'>('sales');
  const [itemSalesHistory, setItemSalesHistory] = useState<any[]>([]);
  const [itemRestockHistory, setItemRestockHistory] = useState<ItemRestock[]>([]);

  // Form State for new item
  const [newItem, setNewItem] = useState<Partial<Item>>({
    name: '',
    skuCode: '',
    barcode: '',
    hsnSacCode: '1000',
    unitType: 'PCS',
    purchasePrice: 0,
    salesPrice: 0,
    minStockAlert: 5,
    currentStock: 0,
    cgstRate: 0,
    sgstRate: 0,
    igstRate: 0
  });

  const filteredItems = safeItems.filter(item => {
    const name = item?.name || '';
    const sku = item?.skuCode || '';
    const barcode = item?.barcode || '';
    const matchesSearch =
      name.toLowerCase().includes(search.toLowerCase()) ||
      sku.toLowerCase().includes(search.toLowerCase()) ||
      barcode.includes(search);
    const matchesLowStock = filterLowStock ? Number(item?.currentStock || 0) <= Number(item?.minStockAlert || 0) : true;
    return matchesSearch && matchesLowStock;
  });

  // Open Item Activity Modal & Load Customer Sales & Supplier Restocks
  const handleOpenItemHistory = async (item: Item) => {
    setSelectedItemForHistory(item);

    // 1. Fetch Sales History (Customers who purchased this item)
    const allInvoices = await db.invoices.toArray();
    const salesLogs: any[] = [];

    for (const inv of allInvoices) {
      for (const invItem of inv.items || []) {
        if ((item.id && invItem.itemId === item.id) || (invItem.itemName && invItem.itemName.trim().toLowerCase() === item.name.trim().toLowerCase())) {
          salesLogs.push({
            customerName: inv.partyName || 'Walk-in Customer',
            customerPhone: inv.partyPhone || '',
            invoiceNumber: inv.invoiceNumber,
            invoiceDate: inv.invoiceDate,
            quantity: invItem.quantity,
            unitPrice: invItem.unitPrice,
            totalAmount: invItem.totalAmount,
            paymentStatus: inv.paymentStatus,
            paymentMethod: inv.paymentMethod
          });
        }
      }
    }
    setItemSalesHistory(salesLogs);

    // 2. Fetch Restock & Supplier History
    const allRestocks = await db.itemRestocks.toArray();
    const restockLogs = allRestocks.filter(r =>
      (item.id && r.itemId === item.id) ||
      (r.itemName && r.itemName.trim().toLowerCase() === item.name.trim().toLowerCase())
    );
    setItemRestockHistory(restockLogs);
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name || newItem.salesPrice === undefined || newItem.salesPrice === null) return;

    const itemPayload = {
      tenantId: business?.tenantId || 'default-tenant',
      name: newItem.name,
      skuCode: newItem.skuCode || `SKU-${Date.now().toString().slice(-4)}`,
      barcode: newItem.barcode || `EAN-${Date.now().toString().slice(-4)}`,
      hsnSacCode: newItem.hsnSacCode || '1000',
      unitType: newItem.unitType || 'PCS',
      purchasePrice: Number(newItem.purchasePrice) || 0,
      salesPrice: Number(newItem.salesPrice) || 0,
      minStockAlert: Number(newItem.minStockAlert) || 5,
      currentStock: Number(newItem.currentStock) || 0,
      cgstRate: Number(newItem.cgstRate) || 0,
      sgstRate: Number(newItem.sgstRate) || 0,
      igstRate: Number(newItem.igstRate) || 0,
      isActive: true,
      updatedAt: new Date().toISOString()
    };

    const savedId = await db.items.add(itemPayload as any);
    const fullItem = { ...itemPayload, id: savedId };

    await createServerItem(fullItem);
    await syncManager.logMutation('ITEM', String(savedId), 'INSERT', fullItem);

    // Log initial restock entry if opening stock > 0
    if (Number(newItem.currentStock) > 0) {
      await db.itemRestocks.add({
        itemId: savedId,
        itemName: newItem.name,
        tenantId: business?.tenantId || 'default-tenant',
        supplierName: selectedRestockSupplier?.name || 'Initial Opening Stock',
        supplierPhone: selectedRestockSupplier?.phone || '',
        supplierId: selectedRestockSupplier?.id,
        billNumber: `INIT-${Date.now().toString().slice(-4)}`,
        restockDate: new Date().toISOString().split('T')[0],
        quantityAdded: Number(newItem.currentStock),
        purchasePrice: Number(newItem.purchasePrice) || 0,
        totalCost: Number(newItem.currentStock) * (Number(newItem.purchasePrice) || 0),
        source: 'MANUAL_ADJUSTMENT',
        createdAt: new Date().toISOString()
      });
    }

    showToast(`Product ${newItem.name} created successfully!`, 'success');
    setShowAddModal(false);
    onItemUpdated();
    setNewItem({
      name: '',
      skuCode: '',
      barcode: '',
      hsnSacCode: '1000',
      unitType: 'PCS',
      purchasePrice: 0,
      salesPrice: 0,
      minStockAlert: 5,
      currentStock: 0,
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 0
    });
  };

  const handleUpdateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItem || !editItem.id) return;

    const updatedPayload = {
      name: editItem.name,
      skuCode: editItem.skuCode,
      barcode: editItem.barcode,
      hsnSacCode: editItem.hsnSacCode || '1000',
      unitType: editItem.unitType || 'PCS',
      purchasePrice: Number(editItem.purchasePrice) || 0,
      salesPrice: Number(editItem.salesPrice) || 0,
      minStockAlert: Number(editItem.minStockAlert) || 5,
      currentStock: Number(editItem.currentStock) || 0,
      cgstRate: Number(editItem.cgstRate) || 0,
      sgstRate: Number(editItem.sgstRate) || 0,
      igstRate: Number(editItem.igstRate) || 0,
      updatedAt: new Date().toISOString()
    };

    await db.items.update(editItem.id, updatedPayload);
    await updateServerItem(editItem.id, updatedPayload);
    await syncManager.logMutation('ITEM', String(editItem.id), 'UPDATE', { id: editItem.id, ...updatedPayload });

    showToast(`Product ${editItem.name} updated successfully!`, 'success');
    setEditItem(null);
    onItemUpdated();
  };

  const handleStockAdjustment = async () => {
    if (!selectedItemForAdjustment || adjustQty <= 0) return;
    const item = selectedItemForAdjustment;
    const delta = adjustType === 'ADD' ? adjustQty : -adjustQty;
    const curStock = Number(item.currentStock || 0);
    const newStock = Math.max(0, curStock + delta);

    if (item.id) {
      await db.items.update(item.id, { currentStock: newStock, updatedAt: new Date().toISOString() });
      await adjustServerItemStock(item.id, delta);
      await syncManager.logMutation('ITEM', String(item.id), 'UPDATE', { id: item.id, currentStock: newStock });

      // If adding stock, log supplier restock history entry
      if (adjustType === 'ADD') {
        await db.itemRestocks.add({
          itemId: item.id,
          itemName: item.name,
          tenantId: business?.tenantId || 'default-tenant',
          supplierId: selectedRestockSupplier?.id,
          supplierName: selectedRestockSupplier?.name || 'Manual Restock',
          supplierPhone: selectedRestockSupplier?.phone || '',
          billNumber: `ADJ-${Date.now().toString().slice(-6)}`,
          restockDate: new Date().toISOString().split('T')[0],
          quantityAdded: adjustQty,
          purchasePrice: item.purchasePrice || 0,
          totalCost: adjustQty * (item.purchasePrice || 0),
          source: 'MANUAL_ADJUSTMENT',
          createdAt: new Date().toISOString()
        });
      }
    }

    showToast(`Stock updated for ${item.name}! New level: ${newStock} ${item.unitType || 'PCS'}`, 'success');
    setSelectedItemForAdjustment(null);
    setAdjustQty(0);
    onItemUpdated();
  };

  const handleDeleteItem = async (id?: number) => {
    if (!id) return;
    showConfirm({
      title: 'Delete Product SKU',
      message: 'Are you sure you want to delete this product from catalog and cloud database?',
      type: 'danger',
      confirmText: 'Yes, Delete',
      onConfirm: async () => {
        await db.items.delete(id);
        await deleteServerItem(id);
        await syncManager.logMutation('ITEM', String(id), 'DELETE', { id });
        showToast('Product SKU deleted successfully', 'info');
        onItemUpdated();
      }
    });
  };

  const handleSeed100Items = async () => {
    const tenantId = business?.tenantId || 'default-tenant';
    showToast('Seeding 100 sample inventory items...', 'info');
    const count = await seed100SampleItems(tenantId);
    showToast(`Successfully added ${count} new sample inventory items!`, 'success');
    onItemUpdated();
  };

  return (
    <div className="flex-1 flex flex-col p-6 bg-[#f3f4f6] overflow-hidden gap-5 select-none">
      {/* Top Action Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            <span>Items & Inventory SKU Manager</span>
          </h2>
          <p className="text-xs text-slate-500 font-semibold">
            Total Products: <span className="text-slate-800 font-bold">{safeItems.length}</span> | Low Stock Alerts:{' '}
            <span className="text-amber-600 font-bold">
              {safeItems.filter(i => Number(i.currentStock) <= Number(i.minStockAlert)).length}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSeed100Items}
            className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-extrabold text-xs border border-emerald-200 shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>+ Seed 100 Sample Items</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterLowStock(!filterLowStock)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
              filterLowStock
                ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Filter Low Stock</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="btn-vyapar-blue text-xs font-bold cursor-pointer"
          >
            <Plus className="w-4 h-4 inline mr-1" />
            <span>Add New Item</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by Product Name, SKU, Barcode..."
          className="w-full h-10 pl-10 pr-4 bg-white border border-slate-200 rounded-xl text-slate-800 text-xs font-medium outline-none focus:border-blue-500 shadow-xs"
        />
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
      </div>

      {/* Product Table */}
      <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col shadow-xs">
        <div className="flex-1 overflow-auto">
          <table className="vyapar-table">
            <thead>
              <tr>
                <th className="w-12 text-center">#</th>
                <th>Item Name</th>
                <th>SKU / Barcode</th>
                <th>HSN Code</th>
                <th>Purchase (Rs)</th>
                <th>Sales Price (Rs)</th>
                <th>Stock Level</th>
                <th>Tax Rate</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-slate-400 text-xs">
                    No matching inventory items found.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, index) => {
                  const stock = Number(item?.currentStock || 0);
                  const minAlert = Number(item?.minStockAlert || 0);
                  const isLowStock = stock <= minAlert;
                  return (
                    <tr key={item.id || index}>
                      <td className="font-mono text-xs font-bold text-slate-400 text-center">{index + 1}</td>
                      <td>
                        <div className="font-bold text-slate-900 text-xs">{item.name || 'Unnamed Product'}</div>
                      </td>
                      <td className="font-mono text-xs text-slate-500">
                        <div>{item.skuCode || '-'}</div>
                        <div className="text-[10px] text-slate-400">{item.barcode || '-'}</div>
                      </td>
                      <td className="font-mono text-xs text-slate-500">{item.hsnSacCode || '-'}</td>
                      <td className="font-mono text-xs text-slate-700">Rs {Number(item.purchasePrice || 0).toFixed(2)}</td>
                      <td className="font-mono text-xs font-black text-emerald-600">
                        Rs {Number(item.salesPrice || 0).toFixed(2)}
                      </td>
                      <td>
                        {(() => {
                          const itemMaps = itemLocs.filter(il => Number(il.itemId) === Number(item.id) && il.quantity > 0);
                          const storeStock = itemMaps.filter(il => !whLocationIds.has(Number(il.locationId))).reduce((sum, il) => sum + il.quantity, 0);
                          const whStock = itemMaps.filter(il => whLocationIds.has(Number(il.locationId))).reduce((sum, il) => sum + il.quantity, 0);

                          return (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1 font-mono text-xs">
                                <span className="font-extrabold text-slate-900">{stock} {item.unitType || 'PCS'}</span>
                                {isLowStock && (
                                  <span className="text-[9px] bg-amber-100 text-amber-800 px-1 py-0.2 rounded font-bold">
                                    LOW
                                  </span>
                                )}
                              </div>
                              {itemMaps.length > 0 && (
                                <div className="flex items-center gap-1 text-[9.5px] font-mono">
                                  <span className="text-purple-700 font-extrabold bg-purple-50 px-1 rounded border border-purple-100">
                                    Store: {storeStock}
                                  </span>
                                  <span className="text-blue-700 font-extrabold bg-blue-50 px-1 rounded border border-blue-100">
                                    Whse: {whStock}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="font-mono text-xs text-slate-500">
                        {Number(item.igstRate || (Number(item.cgstRate || 0) + Number(item.sgstRate || 0)))}%
                      </td>
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedItemForAdjustment(item)}
                            className="btn-vyapar-outline text-[11px] font-bold py-1 px-2 cursor-pointer"
                            title="Adjust Stock Qty"
                          >
                            <Layers className="w-3.5 h-3.5 inline mr-1" />
                            <span>Adjust Stock</span>
                          </button>

                          <button
                            onClick={() => handleOpenItemHistory(item)}
                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 hover:text-emerald-800 transition cursor-pointer"
                            title="View Customer Purchases & Supplier Restocks"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => setEditItem(item)}
                            className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 hover:text-blue-800 transition cursor-pointer"
                            title="Edit Product"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition cursor-pointer"
                            title="Delete Product"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ITEM ACTIVITY & HISTORY MODAL (CUSTOMER PURCHASES & SUPPLIER RESTOCKS) */}
      {selectedItemForHistory && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm flex items-center gap-2">
                    <span>Item Activity & History — {selectedItemForHistory.name}</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    SKU: {selectedItemForHistory.skuCode} | Stock: {selectedItemForHistory.currentStock} {selectedItemForHistory.unitType} | Sale Rate: Rs {selectedItemForHistory.salesPrice}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedItemForHistory(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto bg-slate-50">
              {/* Tab Selector: Customer Purchases vs Supplier Restocks */}
              <div className="flex items-center bg-slate-200 p-1 rounded-xl w-full">
                <button
                  onClick={() => setHistoryTab('sales')}
                  className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                    historyTab === 'sales'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users className="w-4 h-4 text-emerald-600" />
                  <span>Customers Who Purchased ({itemSalesHistory.length})</span>
                </button>

                <button
                  onClick={() => setHistoryTab('restock')}
                  className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                    historyTab === 'restock'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ShoppingBag className="w-4 h-4 text-purple-600" />
                  <span>Supplier & Restock History ({itemRestockHistory.length})</span>
                </button>
              </div>

              {/* TAB 1: CUSTOMERS WHO PURCHASED THIS ITEM */}
              {historyTab === 'sales' && (
                <div className="space-y-4">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs">
                      <div className="text-slate-400 font-semibold uppercase text-[10px]">Total Units Sold</div>
                      <div className="font-black text-slate-800 text-base mt-0.5 font-mono">
                        {itemSalesHistory.reduce((sum, s) => sum + (s.quantity || 0), 0)} {selectedItemForHistory.unitType || 'PCS'}
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs">
                      <div className="text-slate-400 font-semibold uppercase text-[10px]">Sales Revenue Generated</div>
                      <div className="font-black text-emerald-600 text-base mt-0.5 font-mono">
                        Rs. {itemSalesHistory.reduce((sum, s) => sum + (s.totalAmount || 0), 0).toFixed(2)}
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs">
                      <div className="text-slate-400 font-semibold uppercase text-[10px]">Customer Purchases</div>
                      <div className="font-black text-blue-600 text-base mt-0.5">{itemSalesHistory.length} Invoice(s)</div>
                    </div>
                  </div>

                  {/* Customer Sales Table */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    {itemSalesHistory.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-xs">
                        No customer purchase history logged for this product yet.
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100 text-slate-600 font-extrabold uppercase border-b border-slate-200 text-[10px]">
                            <th className="py-2.5 px-3">Customer Name</th>
                            <th className="py-2.5 px-3">Phone</th>
                            <th className="py-2.5 px-3">Invoice #</th>
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3 text-center">Qty Purchased</th>
                            <th className="py-2.5 px-3 text-right">Selling Rate</th>
                            <th className="py-2.5 px-3 text-right">Total Amount</th>
                            <th className="py-2.5 px-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                          {itemSalesHistory.map((s, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 transition">
                              <td className="py-2.5 px-3 font-bold text-slate-900">{s.customerName}</td>
                              <td className="py-2.5 px-3 font-mono text-slate-500">{s.customerPhone || '-'}</td>
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{s.invoiceNumber}</td>
                              <td className="py-2.5 px-3 font-mono text-slate-500">{s.invoiceDate}</td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold">{s.quantity} {selectedItemForHistory.unitType || 'PCS'}</td>
                              <td className="py-2.5 px-3 text-right font-mono">Rs {s.unitPrice}</td>
                              <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-600">Rs {s.totalAmount}</td>
                              <td className="py-2.5 px-3 text-center">
                                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                  s.paymentStatus === 'PAID'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {s.paymentStatus}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: SUPPLIER & RESTOCK HISTORY */}
              {historyTab === 'restock' && (
                <div className="space-y-4">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs">
                      <div className="text-slate-400 font-semibold uppercase text-[10px]">Total Units Restocked</div>
                      <div className="font-black text-slate-800 text-base mt-0.5 font-mono">
                        {itemRestockHistory.reduce((sum, r) => sum + (r.quantityAdded || 0), 0)} {selectedItemForHistory.unitType || 'PCS'}
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs">
                      <div className="text-slate-400 font-semibold uppercase text-[10px]">Total Restock Cost Spent</div>
                      <div className="font-black text-purple-600 text-base mt-0.5 font-mono">
                        Rs. {itemRestockHistory.reduce((sum, r) => sum + (r.totalCost || 0), 0).toFixed(2)}
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs">
                      <div className="text-slate-400 font-semibold uppercase text-[10px]">Restock Events</div>
                      <div className="font-black text-blue-600 text-base mt-0.5">{itemRestockHistory.length} Batch(es)</div>
                    </div>
                  </div>

                  {/* Supplier Restock Table */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    {itemRestockHistory.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-xs">
                        No supplier restock history logged for this product yet. Restock items via Purchase Inward or Adjust Stock.
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100 text-slate-600 font-extrabold uppercase border-b border-slate-200 text-[10px]">
                            <th className="py-2.5 px-3">Supplier Name</th>
                            <th className="py-2.5 px-3">Phone</th>
                            <th className="py-2.5 px-3">Bill / Ref #</th>
                            <th className="py-2.5 px-3">Restock Date</th>
                            <th className="py-2.5 px-3 text-center">Restocked Qty</th>
                            <th className="py-2.5 px-3 text-right">Purchase Rate</th>
                            <th className="py-2.5 px-3 text-right">Total Cost</th>
                            <th className="py-2.5 px-3 text-center">Source</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                          {itemRestockHistory.map((r, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 transition">
                              <td className="py-2.5 px-3 font-bold text-slate-900">{r.supplierName}</td>
                              <td className="py-2.5 px-3 font-mono text-slate-500">{r.supplierPhone || '-'}</td>
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{r.billNumber}</td>
                              <td className="py-2.5 px-3 font-mono text-slate-500">{r.restockDate}</td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-purple-700">+ {r.quantityAdded} {selectedItemForHistory.unitType || 'PCS'}</td>
                              <td className="py-2.5 px-3 text-right font-mono">Rs {r.purchasePrice}</td>
                              <td className="py-2.5 px-3 text-right font-mono font-black text-purple-600">Rs {r.totalCost}</td>
                              <td className="py-2.5 px-3 text-center">
                                <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                                  r.source === 'PURCHASE_BILL'
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {r.source === 'PURCHASE_BILL' ? 'Purchase Bill' : 'Adjust Stock'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white p-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedItemForHistory(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Close Activity Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADJUST STOCK MODAL WITH SUPPLIER RESTOCK SELECTION */}
      {selectedItemForAdjustment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center justify-between border-b pb-2">
              <span>Adjust Stock Qty: {selectedItemForAdjustment.name}</span>
              <span className="text-xs text-slate-500 font-mono">Current: {selectedItemForAdjustment.currentStock} {selectedItemForAdjustment.unitType || 'PCS'}</span>
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Adjustment Action</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType('ADD')}
                    className={`py-2 text-xs font-bold rounded-lg border cursor-pointer ${
                      adjustType === 'ADD' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-slate-700'
                    }`}
                  >
                    + Add Stock (Restock)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('REDUCE')}
                    className={`py-2 text-xs font-bold rounded-lg border cursor-pointer ${
                      adjustType === 'REDUCE' ? 'bg-red-600 text-white border-red-600' : 'bg-slate-50 text-slate-700'
                    }`}
                  >
                    - Reduce Stock (Damage/Loss)
                  </button>
                </div>
              </div>

              {adjustType === 'ADD' && suppliers.length > 0 && (
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Select Restock Supplier (Optional)</label>
                  <select
                    value={selectedRestockSupplier?.id || ''}
                    onChange={e => {
                      const supp = suppliers.find(s => s.id === Number(e.target.value));
                      if (supp) setSelectedRestockSupplier(supp);
                    }}
                    className="input-field text-xs cursor-pointer"
                  >
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.phone || 'Supplier'})</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Quantity *</label>
                <input
                  type="number"
                  min="1"
                  value={adjustQty || ''}
                  onChange={e => setAdjustQty(parseInt(e.target.value) || 0)}
                  className="input-field text-xs font-mono font-bold text-slate-800"
                  placeholder="Enter qty..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setSelectedItemForAdjustment(null)}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStockAdjustment}
                className="btn-vyapar-blue text-xs font-bold cursor-pointer"
              >
                Save Stock Adjustment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD ITEM MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-extrabold text-slate-800 border-b pb-2">Add New Inventory Product</h3>

            <form onSubmit={handleCreateItem} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Panadol 500mg"
                  value={newItem.name}
                  onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                  className="input-field text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">SKU Code</label>
                  <input
                    type="text"
                    placeholder="Auto-generated if empty"
                    value={newItem.skuCode}
                    onChange={e => setNewItem({ ...newItem, skuCode: e.target.value })}
                    className="input-field text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Barcode</label>
                  <input
                    type="text"
                    placeholder="Auto-generated if empty"
                    value={newItem.barcode}
                    onChange={e => setNewItem({ ...newItem, barcode: e.target.value })}
                    className="input-field text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Purchase Rate (Rs)</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={newItem.purchasePrice || ''}
                    onChange={e => setNewItem({ ...newItem, purchasePrice: parseFloat(e.target.value) || 0 })}
                    className="input-field text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Sales Rate (Rs) *</label>
                  <input
                    type="number"
                    required
                    placeholder="0.00"
                    value={newItem.salesPrice || ''}
                    onChange={e => setNewItem({ ...newItem, salesPrice: parseFloat(e.target.value) || 0 })}
                    className="input-field text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Opening Stock</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={newItem.currentStock || ''}
                    onChange={e => setNewItem({ ...newItem, currentStock: parseInt(e.target.value) || 0 })}
                    className="input-field text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">HSN / SAC Code</label>
                  <input
                    type="text"
                    value={newItem.hsnSacCode}
                    onChange={e => setNewItem({ ...newItem, hsnSacCode: e.target.value })}
                    className="input-field text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Sales Tax Rate (%)</label>
                  <select
                    value={Number(newItem.igstRate || (Number(newItem.cgstRate || 0) + Number(newItem.sgstRate || 0)))}
                    onChange={e => {
                      const totalRate = parseFloat(e.target.value);
                      const half = totalRate / 2;
                      setNewItem({ ...newItem, cgstRate: half, sgstRate: half, igstRate: totalRate });
                    }}
                    className="input-field text-xs"
                  >
                    <option value={0}>0% (Tax Exempt)</option>
                    <option value={5}>5% Sales Tax</option>
                    <option value={12}>12% Sales Tax</option>
                    <option value={18}>18% Standard GST</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-vyapar-blue text-xs font-bold cursor-pointer">
                  Save New Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ITEM MODAL */}
      {editItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-extrabold text-slate-800 border-b pb-2 flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-blue-600" />
              <span>Edit Product Details</span>
            </h3>

            <form onSubmit={handleUpdateItem} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  value={editItem.name}
                  onChange={e => setEditItem({ ...editItem, name: e.target.value })}
                  className="input-field text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">SKU Code</label>
                  <input
                    type="text"
                    value={editItem.skuCode || ''}
                    onChange={e => setEditItem({ ...editItem, skuCode: e.target.value })}
                    className="input-field text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Barcode</label>
                  <input
                    type="text"
                    value={editItem.barcode || ''}
                    onChange={e => setEditItem({ ...editItem, barcode: e.target.value })}
                    className="input-field text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Purchase Rate (Rs)</label>
                  <input
                    type="number"
                    value={editItem.purchasePrice}
                    onChange={e => setEditItem({ ...editItem, purchasePrice: parseFloat(e.target.value) || 0 })}
                    className="input-field text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Sales Rate (Rs) *</label>
                  <input
                    type="number"
                    required
                    value={editItem.salesPrice}
                    onChange={e => setEditItem({ ...editItem, salesPrice: parseFloat(e.target.value) || 0 })}
                    className="input-field text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Stock Qty</label>
                  <input
                    type="number"
                    value={editItem.currentStock}
                    onChange={e => setEditItem({ ...editItem, currentStock: parseInt(e.target.value) || 0 })}
                    className="input-field text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">HSN / SAC Code</label>
                  <input
                    type="text"
                    value={editItem.hsnSacCode || ''}
                    onChange={e => setEditItem({ ...editItem, hsnSacCode: e.target.value })}
                    className="input-field text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Sales Tax Rate (%)</label>
                  <select
                    value={Number(editItem.igstRate || (Number(editItem.cgstRate || 0) + Number(editItem.sgstRate || 0)))}
                    onChange={e => {
                      const totalRate = parseFloat(e.target.value);
                      const half = totalRate / 2;
                      setEditItem({ ...editItem, cgstRate: half, sgstRate: half, igstRate: totalRate });
                    }}
                    className="input-field text-xs"
                  >
                    <option value={0}>0% (Tax Exempt)</option>
                    <option value={5}>5% Sales Tax</option>
                    <option value={12}>12% Sales Tax</option>
                    <option value={18}>18% Standard GST</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditItem(null)}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-vyapar-blue text-xs font-bold cursor-pointer">
                  Update Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
