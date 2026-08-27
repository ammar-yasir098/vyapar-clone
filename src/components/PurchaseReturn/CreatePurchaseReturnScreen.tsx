import React, { useState, useEffect } from 'react';
import { RotateCcw, Plus, Trash2, ArrowUpRight } from 'lucide-react';
import { Item, Party, BusinessDetails, PurchaseReturnItem, PurchaseReturn } from '../../types';
import { db } from '../../db';
import { createServerPurchaseReturn } from '../../services/api';
import { syncManager } from '../../services/sync';
import { recordCashEntry } from '../../services/cash';
import { useToast } from '../Common/ToastContext';

interface CreatePurchaseReturnScreenProps {
  items: Item[];
  parties: Party[];
  business: BusinessDetails;
  onReturnSaved: () => void;
  onCancel: () => void;
}

export const CreatePurchaseReturnScreen: React.FC<CreatePurchaseReturnScreenProps> = ({
  items,
  parties,
  business,
  onReturnSaved,
  onCancel
}) => {
  const activeTenantId = business?.tenantId || localStorage.getItem('vyapar_current_tenant') || 'default-tenant';
  const { showToast } = useToast();

  const suppliers = parties.filter(p => p.type === 'SUPPLIER' || p.type === 'BOTH');
  const [selectedSupplier, setSelectedSupplier] = useState<Party | null>(suppliers[0] || null);

  const [debitNoteNumber, setDebitNoteNumber] = useState<string>(`DN-${Date.now().toString().slice(-4)}`);
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [purchaseBillNumber, setPurchaseBillNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Return items table
  const [returnItems, setReturnItems] = useState<PurchaseReturnItem[]>([]);

  // Item selector state
  const [selectedItemId, setSelectedItemId] = useState<number | ''>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(0);

  const safeNum = (val: any): number => Number(val) || 0;

  // Auto-fill price when item selected
  useEffect(() => {
    if (selectedItemId) {
      const itemObj = items.find(i => i.id === Number(selectedItemId));
      if (itemObj) {
        setUnitPrice(safeNum(itemObj.purchasePrice));
      }
    }
  }, [selectedItemId, items]);

  const handleAddItem = () => {
    if (!selectedItemId) return;
    const itemObj = items.find(i => i.id === Number(selectedItemId));
    if (!itemObj) return;

    const existingIndex = returnItems.findIndex(i => i.itemId === itemObj.id);
    if (existingIndex >= 0) {
      const updated = [...returnItems];
      const newQty = updated[existingIndex].returnQuantity + quantity;
      updated[existingIndex].returnQuantity = newQty;
      updated[existingIndex].totalAmount = newQty * updated[existingIndex].unitPrice;
      setReturnItems(updated);
    } else {
      const newItem: PurchaseReturnItem = {
        itemId: itemObj.id,
        itemName: itemObj.name,
        unitType: itemObj.unitType || 'PCS',
        returnQuantity: quantity,
        unitPrice,
        totalAmount: quantity * unitPrice
      };
      setReturnItems([...returnItems, newItem]);
    }

    setSelectedItemId('');
    setQuantity(1);
    setUnitPrice(0);
  };

  const handleRemoveItem = (index: number) => {
    setReturnItems(returnItems.filter((_, i) => i !== index));
  };

  const handleItemQuantityChange = (index: number, newQty: number) => {
    const updated = [...returnItems];
    updated[index].returnQuantity = newQty;
    updated[index].totalAmount = newQty * updated[index].unitPrice;
    setReturnItems(updated);
  };

  const handleItemPriceChange = (index: number, newPrice: number) => {
    const updated = [...returnItems];
    updated[index].unitPrice = newPrice;
    updated[index].totalAmount = updated[index].returnQuantity * newPrice;
    setReturnItems(updated);
  };

  const totalReturnAmount = returnItems.reduce((sum, item) => sum + item.totalAmount, 0);

  const handleSavePurchaseReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (returnItems.length === 0 || !selectedSupplier) {
      alert('Please select a supplier and add at least one item to return!');
      return;
    }

    setIsSaving(true);
    try {
      const returnId = `dn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newReturn: PurchaseReturn = {
        returnId,
        tenantId: activeTenantId,
        debitNoteNumber,
        returnDate,
        purchaseBillNumber,
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.name,
        supplierPhone: selectedSupplier.phone || '',
        items: returnItems,
        subtotal: totalReturnAmount,
        grandTotal: totalReturnAmount,
        notes,
        createdAt: new Date().toISOString()
      };

      // 1. Add to local Dexie IndexedDB v12
      await db.purchaseReturns.add(newReturn);

      // Record Cash Inflow Refund if totalReturnAmount > 0
      if (totalReturnAmount > 0) {
        await recordCashEntry({
          tenantId: activeTenantId,
          type: 'IN',
          amount: totalReturnAmount,
          source: 'PURCHASE_RETURN_REFUND',
          referenceId: debitNoteNumber,
          description: `Cash refund received for Purchase Return ${debitNoteNumber} (${selectedSupplier.name})`,
          transactionDate: returnDate
        });
      }

      // 2. Reduce Stock in Dexie DB (item.currentStock -= returnQuantity) & location mapping
      for (const rItem of returnItems) {
        if (rItem.itemId) {
          const dbItem = await db.items.get(rItem.itemId);
          if (dbItem) {
            const newStock = Math.max(0, safeNum(dbItem.currentStock) - safeNum(rItem.returnQuantity));
            await db.items.update(rItem.itemId, {
              currentStock: newStock,
              updatedAt: new Date().toISOString()
            });

            // Deduct from location mapping stock if exists
            const mappedLoc = await db.itemLocations.filter(il => Number(il.itemId) === Number(rItem.itemId) && il.quantity > 0).first();
            if (mappedLoc && mappedLoc.id) {
              const newLocStock = Math.max(0, (mappedLoc.quantity || 0) - safeNum(rItem.returnQuantity));
              await db.itemLocations.update(mappedLoc.id, {
                quantity: newLocStock,
                updatedAt: new Date().toISOString()
              });
            }

            await syncManager.logMutation('ITEM', String(rItem.itemId), 'UPDATE', { id: rItem.itemId, name: dbItem.name, skuCode: dbItem.skuCode, currentStock: newStock });
          }
        }
      }

      // 3. Reduce Supplier Payable Balance in parties table (supplier.currentBalance -= totalReturnAmount)
      if (selectedSupplier.id) {
        const curBal = safeNum(selectedSupplier.currentBalance);
        const newBal = Math.max(0, curBal - totalReturnAmount);
        await db.parties.update(selectedSupplier.id, { currentBalance: newBal });
        await syncManager.logMutation('PARTY', String(selectedSupplier.id), 'UPDATE', { id: selectedSupplier.id, currentBalance: newBal });
      }

      // 4. Send to Cloud PostgreSQL server API
      try {
        await createServerPurchaseReturn(newReturn);
      } catch (err) {
        console.warn('Failed to sync Purchase Return to cloud server:', err);
      }

      showToast(`Debit Note ${debitNoteNumber} issued to ${selectedSupplier.name}! Stock and supplier payable reduced by Rs ${totalReturnAmount.toFixed(2)}.`, 'success');
      onReturnSaved();
    } catch (err: any) {
      console.error('Error saving Purchase Return:', err);
      alert(`Error saving Purchase Return: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-5 bg-[#f3f4f6] overflow-y-auto gap-4 select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-red-600" />
            <span>Create Purchase Return</span>
          </h2>
          <p className="text-xs text-slate-500 font-semibold">Issue a Debit Note to return defective items — Deducts stock & supplier payables</p>
        </div>

        <button
          onClick={onCancel}
          className="btn-vyapar-outline text-xs font-bold cursor-pointer"
        >
          Back to Returns List
        </button>
      </div>

      <form onSubmit={handleSavePurchaseReturn} className="space-y-4">
        {/* Supplier & Details Grid */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Select Supplier *</label>
            <select
              value={selectedSupplier?.id || ''}
              onChange={e => {
                const found = suppliers.find(s => s.id === Number(e.target.value));
                if (found) setSelectedSupplier(found);
              }}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} (Balance: Rs. {safeNum(s.currentBalance).toLocaleString()})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Debit Note #</label>
            <input
              type="text"
              required
              value={debitNoteNumber}
              onChange={e => setDebitNoteNumber(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Return Date</label>
            <input
              type="date"
              value={returnDate}
              onChange={e => setReturnDate(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Ref Original Bill # (Optional)</label>
            <input
              type="text"
              value={purchaseBillNumber}
              onChange={e => setPurchaseBillNumber(e.target.value)}
              placeholder="e.g. PUR-9821"
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>

        {/* Item Selector Section */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="text-xs font-extrabold uppercase text-slate-600 tracking-wider">Select Items to Return</div>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-6">
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Product Item</label>
              <select
                value={selectedItemId}
                onChange={e => setSelectedItemId(e.target.value ? Number(e.target.value) : '')}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">-- Choose Item from Inventory --</option>
                {items.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name} (Stock: {item.currentStock || 0} {item.unitType || 'PCS'})
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Return Qty</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 text-center"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Return Rate (Rs)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={unitPrice}
                onChange={e => setUnitPrice(parseFloat(e.target.value) || 0)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 text-right"
              />
            </div>

            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={handleAddItem}
                disabled={!selectedItemId}
                className="w-full py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-xs transition flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Item</span>
              </button>
            </div>
          </div>

          {/* Table of Returned Items */}
          {returnItems.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden mt-3">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                    <th className="py-2.5 px-3">Item Description</th>
                    <th className="py-2.5 px-3 text-center">Return Qty</th>
                    <th className="py-2.5 px-3 text-right">Return Rate</th>
                    <th className="py-2.5 px-3 text-right">Total Return Amount</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {returnItems.map((item, index) => (
                    <tr key={index} className="hover:bg-slate-50 font-medium">
                      <td className="py-2.5 px-3 font-bold text-slate-900">{item.itemName}</td>
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="number"
                          min="1"
                          value={item.returnQuantity}
                          onChange={e => handleItemQuantityChange(index, Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 p-1 bg-white border border-slate-200 rounded text-center font-mono font-bold"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          step="any"
                          value={item.unitPrice}
                          onChange={e => handleItemPriceChange(index, parseFloat(e.target.value) || 0)}
                          className="w-24 p-1 bg-white border border-slate-200 rounded text-right font-mono font-bold"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-red-600">
                        Rs. {item.totalAmount.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Reason / Notes & Save */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="w-full md:w-1/2">
            <label className="text-xs font-bold text-slate-700 block mb-1">Return Reason / Remarks</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Returned 2 defective units damaged in transit..."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto justify-end">
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold text-slate-400">Total Return Value</div>
              <div className="text-xl font-black text-red-600 font-mono">
                Rs. {totalReturnAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSaving || returnItems.length === 0}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer flex items-center gap-2"
            >
              <span>{isSaving ? 'Saving...' : 'ISSUE DEBIT NOTE'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
