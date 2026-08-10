import React, { useState } from 'react';
import { Package, Plus, Search, AlertTriangle, Edit2, Trash2, Layers } from 'lucide-react';
import { Item, UnitType } from '../../types';
import { db } from '../../db';
import { createServerItem, adjustServerItemStock, deleteServerItem } from '../../services/api';

interface InventoryScreenProps {
  items: Item[];
  onItemUpdated: () => void;
}

export const InventoryScreen: React.FC<InventoryScreenProps> = ({ items, onItemUpdated }) => {
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [filterLowStock, setFilterLowStock] = useState(false);

  const [selectedItemForAdjustment, setSelectedItemForAdjustment] = useState<Item | null>(null);
  const [adjustQty, setAdjustQty] = useState<number>(0);
  const [adjustType, setAdjustType] = useState<'ADD' | 'REDUCE'>('ADD');

  // Form State for new item
  const [newItem, setNewItem] = useState<Partial<Item>>({
    name: '',
    skuCode: '',
    barcode: '',
    hsnSacCode: '1000',
    unitType: 'PCS',
    purchasePrice: 0,
    salesPrice: 0,
    minStockAlert: 10,
    currentStock: 50,
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 18
  });

  const filteredItems = items.filter(item => {
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.skuCode.toLowerCase().includes(search.toLowerCase()) ||
      item.barcode.includes(search);
    const matchesLowStock = filterLowStock ? item.currentStock <= item.minStockAlert : true;
    return matchesSearch && matchesLowStock;
  });

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name || !newItem.salesPrice) return;

    const itemPayload = {
      tenantId: 'default-tenant',
      name: newItem.name,
      skuCode: newItem.skuCode || `SKU-${Date.now().toString().slice(-4)}`,
      barcode: newItem.barcode || Math.floor(1000000000000 + Math.random() * 9000000000000).toString(),
      hsnSacCode: newItem.hsnSacCode || '1000',
      unitType: (newItem.unitType as UnitType) || 'PCS',
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

    const savedId = await db.items.add(itemPayload);
    await createServerItem({ ...itemPayload, id: savedId });

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
      minStockAlert: 10,
      currentStock: 50,
      cgstRate: 9,
      sgstRate: 9,
      igstRate: 18
    });
  };

  const handleStockAdjustment = async () => {
    if (!selectedItemForAdjustment || adjustQty <= 0) return;
    const item = selectedItemForAdjustment;
    const delta = adjustType === 'ADD' ? adjustQty : -adjustQty;
    const newStock = Math.max(0, item.currentStock + delta);

    if (item.id) {
      await db.items.update(item.id, { currentStock: newStock, updatedAt: new Date().toISOString() });
      await adjustServerItemStock(item.id, delta);
    }

    alert(`Stock for ${item.name} adjusted from ${item.currentStock} to ${newStock} ${item.unitType}.`);
    setSelectedItemForAdjustment(null);
    setAdjustQty(0);
    onItemUpdated();
  };

  const handleDeleteItem = async (id?: number) => {
    if (!id) return;
    if (confirm('Are you sure you want to delete this product?')) {
      await db.items.delete(id);
      await deleteServerItem(id);
      onItemUpdated();
    }
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
            Total Products: <strong className="text-slate-800">{items.length}</strong> | Low Stock Alerts:{' '}
            <strong className="text-amber-600 font-bold">
              {items.filter(i => i.currentStock <= i.minStockAlert).length}
            </strong>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setFilterLowStock(!filterLowStock)}
            className={`btn border text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer ${
              filterLowStock
                ? 'bg-amber-50 border-amber-300 text-amber-700 font-bold'
                : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
            <span>{filterLowStock ? 'Showing Low Stock Only' : 'Filter Low Stock'}</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="btn-vyapar-blue text-xs font-extrabold cursor-pointer"
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
              {filteredItems.map(item => {
                const isLowStock = item.currentStock <= item.minStockAlert;
                return (
                  <tr key={item.id}>
                    <td>
                      <div className="font-bold text-slate-900 text-xs">{item.name}</div>
                    </td>
                    <td className="font-mono text-xs text-slate-500">
                      <div>{item.skuCode}</div>
                      <div className="text-[10px] text-slate-400">{item.barcode}</div>
                    </td>
                    <td className="font-mono text-xs text-slate-500">{item.hsnSacCode}</td>
                    <td className="font-mono text-xs text-slate-700">Rs {item.purchasePrice.toFixed(2)}</td>
                    <td className="font-mono text-xs font-black text-emerald-600">
                      Rs {item.salesPrice.toFixed(2)}
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-mono font-bold text-xs ${
                            isLowStock ? 'text-amber-600' : 'text-slate-800'
                          }`}
                        >
                          {item.currentStock} {item.unitType}
                        </span>
                        {isLowStock && (
                          <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.2 rounded border border-amber-300 font-bold">
                            LOW
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="font-mono text-xs text-slate-500">
                      {item.cgstRate + item.sgstRate}%
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setSelectedItemForAdjustment(item)}
                          className="btn-vyapar-outline text-[11px] font-bold py-1 px-2 cursor-pointer"
                        >
                          <Layers className="w-3.5 h-3.5 inline mr-1" />
                          <span>Adjust Stock</span>
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="text-slate-400 hover:text-red-500 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Adjustment Dialog */}
      {selectedItemForAdjustment && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white p-5 rounded-2xl w-full max-w-md space-y-4 shadow-2xl border border-slate-200">
            <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>Adjust Stock: {selectedItemForAdjustment.name}</span>
            </h3>

            <div className="space-y-3">
              <div className="bg-slate-50 p-3 rounded-xl text-xs font-mono">
                <div className="flex justify-between text-slate-600">
                  <span>Current Stock:</span>
                  <span className="font-bold text-slate-900">{selectedItemForAdjustment.currentStock} {selectedItemForAdjustment.unitType}</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Adjustment Action</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType('ADD')}
                    className={`py-2 text-xs font-extrabold rounded-lg border transition ${
                      adjustType === 'ADD'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    + Add Stock (Inward)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('REDUCE')}
                    className={`py-2 text-xs font-extrabold rounded-lg border transition ${
                      adjustType === 'REDUCE'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    - Reduce Stock (Damage)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={adjustQty || ''}
                  onChange={e => setAdjustQty(parseInt(e.target.value) || 0)}
                  placeholder="0"
                  className="input-field text-xs font-mono font-bold"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setSelectedItemForAdjustment(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleStockAdjustment}
                className="btn-vyapar-blue text-xs font-bold"
              >
                Apply Adjustment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-600" />
              <span>Add New Product to Inventory</span>
            </h3>

            <form onSubmit={handleCreateItem} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  value={newItem.name}
                  onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                  placeholder="e.g. Cooking Oil 1-Litre"
                  className="input-field text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">SKU Code</label>
                  <input
                    type="text"
                    value={newItem.skuCode}
                    onChange={e => setNewItem({ ...newItem, skuCode: e.target.value })}
                    placeholder="Auto generated if empty"
                    className="input-field text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Barcode</label>
                  <input
                    type="text"
                    value={newItem.barcode}
                    onChange={e => setNewItem({ ...newItem, barcode: e.target.value })}
                    placeholder="EAN-13 / Numeric"
                    className="input-field text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Purchase Rate (Rs)</label>
                  <input
                    type="number"
                    value={newItem.purchasePrice || ''}
                    onChange={e => setNewItem({ ...newItem, purchasePrice: parseFloat(e.target.value) })}
                    placeholder="0.00"
                    className="input-field text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Sales Rate (Rs) *</label>
                  <input
                    type="number"
                    required
                    value={newItem.salesPrice || ''}
                    onChange={e => setNewItem({ ...newItem, salesPrice: parseFloat(e.target.value) })}
                    placeholder="0.00"
                    className="input-field text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Stock Qty</label>
                  <input
                    type="number"
                    value={newItem.currentStock || ''}
                    onChange={e => setNewItem({ ...newItem, currentStock: parseInt(e.target.value) })}
                    placeholder="50"
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
                    placeholder="1000"
                    className="input-field text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Sales Tax Rate (%)</label>
                  <select
                    value={newItem.cgstRate! * 2}
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
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-vyapar-blue text-xs font-bold">
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
