import React, { useState, useEffect } from 'react';
import { ShoppingBag, Plus, Trash2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Item, Party, PurchaseOrderItem, BusinessDetails, PurchaseOrder, InventoryLocation } from '../../types';
import { db, getActiveTenantId } from '../../db';
import { createServerPurchaseOrder } from '../../services/api';
import { useToast } from '../Common/ToastContext';

interface CreatePurchaseOrderScreenProps {
  items: Item[];
  parties: Party[];
  business: BusinessDetails;
  onPOSaved: () => void;
  onCancel: () => void;
}

export const CreatePurchaseOrderScreen: React.FC<CreatePurchaseOrderScreenProps> = ({
  items,
  parties,
  business,
  onPOSaved,
  onCancel
}) => {
  const { showToast } = useToast();
  const suppliers = parties.filter(p => p.type === 'SUPPLIER' || p.type === 'BOTH');
  const [selectedSupplier, setSelectedSupplier] = useState<Party | null>(suppliers[0] || null);
  const [poNumber, setPoNumber] = useState(`PO-${Date.now().toString().slice(-4)}`);
  const [poDate, setPoDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  
  const [orderItems, setOrderItems] = useState<PurchaseOrderItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | ''>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [unitRate, setUnitRate] = useState<number>(0);

  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [receivingLocationId, setReceivingLocationId] = useState<string>('');

  useEffect(() => {
    db.locations.toArray().then(locs => {
      setLocations(locs);
      const defaultWh = locs.find(l => l.type === 'WAREHOUSE');
      if (defaultWh?.id) {
        setReceivingLocationId(String(defaultWh.id));
      }
    });
  }, []);

  const safeNum = (val: any): number => {
    if (val === null || val === undefined) return 0;
    const n = Number(val);
    return isNaN(n) || !isFinite(n) ? 0 : n;
  };

  useEffect(() => {
    if (!selectedSupplier && suppliers.length > 0) {
      setSelectedSupplier(suppliers[0]);
    }
  }, [suppliers]);

  const handleAddItem = () => {
    if (!selectedItemId) return;
    const item = items.find(i => i.id === Number(selectedItemId));
    if (!item) return;

    const rate = unitRate > 0 ? unitRate : safeNum(item.purchasePrice);
    const qty = Math.max(1, quantity);
    const totalAmount = qty * rate;

    const newItem: PurchaseOrderItem = {
      itemId: item.id,
      itemName: item.name,
      unitType: item.unitType || 'PCS',
      quantity: qty,
      purchasePrice: rate,
      totalAmount
    };

    setOrderItems(prev => [...prev, newItem]);
    setSelectedItemId('');
    setQuantity(1);
    setUnitRate(0);
  };

  const updateItemQty = (idx: number, newQty: number) => {
    setOrderItems(prev =>
      prev.map((item, i) => {
        if (i === idx) {
          const qty = Math.max(1, newQty);
          return { ...item, quantity: qty, totalAmount: qty * item.purchasePrice };
        }
        return item;
      })
    );
  };

  const updateItemRate = (idx: number, newRate: number) => {
    setOrderItems(prev =>
      prev.map((item, i) => {
        if (i === idx) {
          const rate = Math.max(0, newRate);
          return { ...item, purchasePrice: rate, totalAmount: item.quantity * rate };
        }
        return item;
      })
    );
  };

  const totalPoAmount = orderItems.reduce((sum, i) => sum + (safeNum(i.totalAmount) || (i.quantity * i.purchasePrice)), 0);

  const handleSavePO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (orderItems.length === 0 || !selectedSupplier) {
      alert('Please select a supplier and add at least one item to order!');
      return;
    }

    const currentTenantId = getActiveTenantId(business);
    const poId = `po-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const newPO: PurchaseOrder = {
      poId,
      tenantId: currentTenantId,
      poNumber,
      poDate,
      supplierId: selectedSupplier.id,
      supplierName: selectedSupplier.name,
      supplierPhone: selectedSupplier.phone || '',
      supplierGstin: selectedSupplier.gstin || '',
      items: orderItems,
      subtotal: totalPoAmount,
      taxTotal: 0,
      grandTotal: totalPoAmount,
      status: 'PENDING',
      receivingLocationId: receivingLocationId ? Number(receivingLocationId) : undefined,
      notes,
      createdAt: new Date().toISOString()
    };

    // 1. Save to local Dexie IndexedDB (NO stock / ledger mutation)
    await db.purchaseOrders.add(newPO);

    // 2. Save to cloud PostgreSQL server
    try {
      await createServerPurchaseOrder(newPO);
    } catch (err) {
      console.warn('Failed to sync PO with cloud backend server:', err);
    }

    showToast(`Purchase Order ${poNumber} created successfully! (Status: PENDING, No stock deduction)`, 'success');
    onPOSaved();
  };

  return (
    <div className="flex-1 flex flex-col p-5 bg-[#f3f4f6] overflow-hidden gap-4 select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-blue-600" />
              <span>Create Purchase Order</span>
            </h2>
            <p className="text-xs text-slate-500 font-semibold">Demand note for suppliers — Does NOT affect item stock or ledger accounts until converted into a bill</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 flex-1 overflow-hidden">
        {/* Left 2 Cols: Form & Item Entry */}
        <div className="lg:col-span-2 flex flex-col gap-4 overflow-hidden">
          {/* Supplier Info Form & Receiving Location */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Select Supplier *</label>
              <select
                value={selectedSupplier?.id || ''}
                onChange={e => {
                  const s = suppliers.find(p => p.id === Number(e.target.value));
                  if (s) setSelectedSupplier(s);
                }}
                className="input-field text-xs font-bold"
              >
                {suppliers.length === 0 ? (
                  <option value="">No suppliers found</option>
                ) : (
                  suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.phone})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Target Receiving Location</label>
              <select
                value={receivingLocationId}
                onChange={e => setReceivingLocationId(e.target.value)}
                className="input-field text-xs font-bold bg-purple-50/70 border-purple-200 text-purple-900 focus:ring-purple-500"
              >
                <option value="">-- Unassigned General Stock --</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {loc.type === 'WAREHOUSE' ? '🏢 Warehouse: ' : loc.type === 'ZONE' ? '📂 Zone: ' : '📦 Shelf: '}
                    {loc.name} ({loc.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">PO Order #</label>
              <input
                type="text"
                value={poNumber}
                onChange={e => setPoNumber(e.target.value)}
                className="input-field text-xs font-mono font-bold"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Order Date</label>
              <input
                type="date"
                value={poDate}
                onChange={e => setPoDate(e.target.value)}
                className="input-field text-xs font-mono"
              />
            </div>
          </div>

          {/* Add Item Row */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-4 gap-3 items-end">
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Select Product</label>
              <select
                value={selectedItemId}
                onChange={e => {
                  const id = Number(e.target.value);
                  setSelectedItemId(id);
                  const found = items.find(i => i.id === id);
                  if (found) setUnitRate(found.purchasePrice);
                }}
                className="input-field text-xs font-bold"
              >
                <option value="">-- Choose Item --</option>
                {items.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.name} (Current Stock: {i.currentStock})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Order Qty</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={e => setQuantity(parseInt(e.target.value) || 1)}
                className="input-field text-xs font-mono font-bold text-center"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Expected Rate (Rs)</label>
              <input
                type="number"
                value={unitRate || ''}
                onChange={e => setUnitRate(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="input-field text-xs font-mono font-bold"
              />
            </div>

            <button
              type="button"
              onClick={handleAddItem}
              className="btn-vyapar-blue text-xs font-bold py-2 flex items-center justify-center gap-1 cursor-pointer bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              <span>Add to Order</span>
            </button>
          </div>

          {/* PO Items Table */}
          <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
            <div className="flex-1 overflow-auto">
              <table className="vyapar-table">
                <thead>
                  <tr>
                    <th>Item Description</th>
                    <th>Order Qty</th>
                    <th>Unit Rate (Rs)</th>
                    <th className="text-right">Total (Rs)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {orderItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-16 text-slate-400 text-xs">
                        No order items added yet. Select a product above to build your demand note.
                      </td>
                    </tr>
                  ) : (
                    orderItems.map((item, idx) => {
                      const itemTotal = safeNum(item.totalAmount) > 0
                        ? safeNum(item.totalAmount)
                        : safeNum(item.quantity) * safeNum(item.purchasePrice);
                      return (
                        <tr key={idx}>
                          <td className="font-bold text-slate-800 text-xs">{item.itemName}</td>
                          <td>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => updateItemQty(idx, item.quantity - 1)}
                                className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center border border-slate-300 cursor-pointer"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={e => updateItemQty(idx, parseInt(e.target.value) || 1)}
                                className="w-12 text-center bg-slate-50 border border-slate-300 rounded text-xs text-slate-900 font-bold py-0.5"
                              />
                              <button
                                type="button"
                                onClick={() => updateItemQty(idx, item.quantity + 1)}
                                className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center border border-slate-300 cursor-pointer"
                              >
                                +
                              </button>
                              <span className="text-[10px] text-slate-500 font-bold ml-1">{item.unitType || 'PCS'}</span>
                            </div>
                          </td>
                          <td>
                            <input
                              type="number"
                              value={item.purchasePrice}
                              onChange={e => updateItemRate(idx, parseFloat(e.target.value) || 0)}
                              className="w-20 bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 text-xs text-slate-900 font-mono font-bold"
                            />
                          </td>
                          <td className="font-mono text-xs font-black text-blue-600 text-right">Rs {itemTotal.toFixed(2)}</td>
                          <td className="text-center">
                            <button
                              onClick={() => setOrderItems(prev => prev.filter((_, i) => i !== idx))}
                              className="text-slate-400 hover:text-red-500 transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Summary & Action Panel */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="font-extrabold text-sm text-slate-800 border-b border-slate-200 pb-2">
              Purchase Order Summary
            </h3>

            <div className="bg-slate-50 p-4 rounded-xl space-y-2 text-xs font-mono">
              <div className="flex justify-between text-slate-600">
                <span>Supplier:</span>
                <span className="font-bold text-slate-900">{selectedSupplier?.name || 'Not selected'}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Total Items:</span>
                <span className="font-bold text-slate-900">{orderItems.length}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Status:</span>
                <span className="font-bold text-blue-600 uppercase">PENDING</span>
              </div>
              <div className="flex justify-between text-sm font-black text-blue-600 pt-2 border-t border-slate-200">
                <span>TOTAL DEMAND COST:</span>
                <span>Rs {Number(totalPoAmount || 0).toFixed(2)}</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Order Terms / Notes</label>
              <textarea
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add payment terms, expected delivery date, or note for supplier..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t border-slate-100">
            <button
              onClick={handleSavePO}
              disabled={orderItems.length === 0 || !selectedSupplier}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-extrabold shadow-md disabled:opacity-50 transition cursor-pointer flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>SAVE PURCHASE ORDER</span>
            </button>
            <button
              onClick={onCancel}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
