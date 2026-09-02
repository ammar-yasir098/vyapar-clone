import React, { useState, useEffect, useMemo } from 'react';
import { 
  RotateCcw, 
  Plus, 
  Trash2, 
  Store, 
  Warehouse, 
  Wallet, 
  CreditCard, 
  CheckCircle2, 
  AlertCircle,
  Receipt,
  Building2,
  Calendar,
  DollarSign
} from 'lucide-react';
import { Item, Party, BusinessDetails, PurchaseReturnItem, PurchaseReturn, PurchaseBill, InventoryLocation, ItemLocationMapping } from '../../types';
import { db, getActiveTenantId } from '../../db';
import { createServerPurchaseReturn, saveServerItemLocation } from '../../services/api';
import { syncManager } from '../../services/sync';
import { recordCashEntry } from '../../services/cash';
import { useToast } from '../Common/ToastContext';

interface CreatePurchaseReturnScreenProps {
  items: Item[];
  parties: Party[];
  purchaseBills?: PurchaseBill[];
  business?: BusinessDetails;
  onReturnSaved: () => void;
  onCancel: () => void;
}

export const CreatePurchaseReturnScreen: React.FC<CreatePurchaseReturnScreenProps> = ({
  items,
  parties,
  purchaseBills = [],
  business,
  onReturnSaved,
  onCancel
}) => {
  const activeTenantId = getActiveTenantId(business);
  const { showToast } = useToast();

  const suppliers = parties.filter(p => p.type === 'SUPPLIER' || p.type === 'BOTH');
  const [selectedSupplier, setSelectedSupplier] = useState<Party | null>(suppliers[0] || null);

  const [debitNoteNumber, setDebitNoteNumber] = useState<string>(`DN-${Date.now().toString().slice(-4)}`);
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [purchaseBillNumber, setPurchaseBillNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Settlement Mode: Supplier Credit (Khata Deduction) vs Cash Refund In
  const [settlementMode, setSettlementMode] = useState<'SUPPLIER_CREDIT' | 'CASH_REFUND'>('SUPPLIER_CREDIT');

  // Location Management
  const [availableLocations, setAvailableLocations] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [sourceLocationId, setSourceLocationId] = useState<string>('');
  const [itemLocations, setItemLocations] = useState<ItemLocationMapping[]>([]);

  // Return items table
  const [returnItems, setReturnItems] = useState<PurchaseReturnItem[]>([]);

  // Item selector state
  const [selectedItemId, setSelectedItemId] = useState<number | string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(0);

  const safeNum = (val: any): number => {
    const n = Number(val);
    return isNaN(n) ? 0 : n;
  };

  // Load locations and location mappings for active tenant
  useEffect(() => {
    const loadLocations = async () => {
      const allLocs = await db.locations.toArray();
      const allItemLocs = await db.itemLocations.toArray();
      setItemLocations(allItemLocs);

      const storeLocs = allLocs.filter(l => {
        const lTenant = l.tenantId || 'default-tenant';
        return lTenant === activeTenantId || (activeTenantId === 'default-tenant' && lTenant === 'default-tenant');
      });

      // 1. Find store front
      const sf = storeLocs.find(l => 
        (l as any).type === 'STORE' || 
        (l.name && l.name.toLowerCase().includes('store front')) ||
        String(l.id).startsWith('sf-')
      );

      // 2. Find warehouse root
      const wh = storeLocs.find(l => 
        l.type === 'WAREHOUSE' || 
        (l.name && l.name.toLowerCase().includes('warehouse')) ||
        String(l.id).startsWith('wh-')
      );

      // Only 2 options: Store Front and Warehouse
      const locList: Array<{ id: string; name: string; type: string }> = [
        { 
          id: sf ? String(sf.id) : `sf-${activeTenantId}`, 
          name: sf?.name || 'Store Front / Sales Counter', 
          type: 'STORE_FRONT' 
        },
        { 
          id: wh ? String(wh.id) : (storeLocs.find(l => l.type === 'WAREHOUSE')?.id ? String(storeLocs.find(l => l.type === 'WAREHOUSE')?.id) : `wh-${activeTenantId}`), 
          name: wh?.name || 'Warehouse', 
          type: 'WAREHOUSE' 
        }
      ];

      setAvailableLocations(locList);
      if (locList.length > 0 && !sourceLocationId) {
        setSourceLocationId(locList[0].id);
      }
    };

    loadLocations();
  }, [activeTenantId]);

  // Compute live stock at selected location for an item
  const getStockAtLocation = (itemId: number | string, locId: string): number => {
    if (!itemId || !locId) return 0;
    const loc = availableLocations.find(l => l.id === locId);

    if (loc?.type === 'WAREHOUSE') {
      const whMapping = itemLocations.find(il => 
        String(il.itemId) === String(itemId) && 
        String(il.locationId) === String(locId)
      );
      if (whMapping && whMapping.quantity > 0) {
        return whMapping.quantity;
      }
      const rackSum = itemLocations
        .filter(il => String(il.itemId) === String(itemId) && (String(il.locationId).startsWith('rack-') || String(il.locationId).startsWith('wh-')))
        .reduce((sum, il) => sum + (il.quantity || 0), 0);
      return rackSum > 0 ? rackSum : (whMapping?.quantity || 0);
    }

    const mapping = itemLocations.find(il => 
      String(il.itemId) === String(itemId) && 
      (String(il.locationId) === String(locId) || String(il.locationId).startsWith('sf-'))
    );
    return mapping?.quantity || 0;
  };

  // Live available stock for currently picked item at current source location
  const currentItemAvailableStock = useMemo(() => {
    if (!selectedItemId || !sourceLocationId) return 0;
    return getStockAtLocation(selectedItemId, sourceLocationId);
  }, [selectedItemId, sourceLocationId, itemLocations]);

  // Past Purchase Bills for selected supplier
  const supplierPastBills = useMemo(() => {
    if (!selectedSupplier) return [];
    return (purchaseBills || []).filter(b => 
      (b.supplierId !== undefined && String(b.supplierId) === String(selectedSupplier.id)) ||
      (b.supplierName && b.supplierName.trim().toLowerCase() === selectedSupplier.name.trim().toLowerCase())
    );
  }, [selectedSupplier, purchaseBills]);

  // Auto-fill price when item selected
  useEffect(() => {
    if (selectedItemId) {
      const itemObj = items.find(i => String(i.id) === String(selectedItemId));
      if (itemObj) {
        setUnitPrice(safeNum(itemObj.purchasePrice));
      }
    }
  }, [selectedItemId, items]);

  const handleAddItem = () => {
    if (!selectedItemId) return;
    const itemObj = items.find(i => String(i.id) === String(selectedItemId));
    if (!itemObj) return;

    // Stock Validation against selected source location
    if (quantity > currentItemAvailableStock && currentItemAvailableStock > 0) {
      showToast(`Cannot return ${quantity} PCS. Only ${currentItemAvailableStock} PCS available at selected location!`, 'error');
      return;
    }

    const existingIndex = returnItems.findIndex(i => String(i.itemId) === String(itemObj.id));
    if (existingIndex >= 0) {
      const updated = [...returnItems];
      const newQty = updated[existingIndex].returnQuantity + quantity;
      if (newQty > currentItemAvailableStock && currentItemAvailableStock > 0) {
        showToast(`Total return quantity (${newQty} PCS) exceeds location stock (${currentItemAvailableStock} PCS)!`, 'error');
        return;
      }
      updated[existingIndex].returnQuantity = newQty;
      updated[existingIndex].totalAmount = newQty * updated[existingIndex].unitPrice;
      setReturnItems(updated);
    } else {
      const newItem: PurchaseReturnItem = {
        itemId: itemObj.id as any,
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
    const item = updated[index];
    const avail = getStockAtLocation(item.itemId || '', sourceLocationId);
    if (newQty > avail && avail > 0) {
      showToast(`Exceeds available stock at selected location (Max: ${avail} PCS)!`, 'warning');
    }
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

    if (!sourceLocationId) {
      alert('Please select the source location (Store Front or Warehouse) from where goods are being returned!');
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
        sourceLocationId,
        refundMode: settlementMode === 'CASH_REFUND' ? 'CASH_REFUND' : 'STORE_CREDIT',
        items: returnItems,
        subtotal: totalReturnAmount,
        grandTotal: totalReturnAmount,
        notes,
        createdAt: new Date().toISOString()
      };

      // 1. Add to local Dexie IndexedDB
      await db.purchaseReturns.add(newReturn);

      // 2. Reduce Stock in Dexie DB (item.currentStock -= returnQuantity) & Location Mapping
      for (const rItem of returnItems) {
        if (rItem.itemId) {
          const dbItem = await db.items.get(rItem.itemId);
          if (dbItem) {
            const newStock = Math.max(0, safeNum(dbItem.currentStock) - safeNum(rItem.returnQuantity));
            await db.items.update(rItem.itemId, {
              currentStock: newStock,
              updatedAt: new Date().toISOString()
            });

            await syncManager.logMutation('ITEM', String(rItem.itemId), 'UPDATE', { 
              id: rItem.itemId, 
              name: dbItem.name, 
              skuCode: dbItem.skuCode, 
              currentStock: newStock 
            });
          }

          // Deduct specifically from the chosen source location
          const isWarehouse = String(sourceLocationId).startsWith('wh-') || availableLocations.find(l => l.id === sourceLocationId)?.type === 'WAREHOUSE';

          const mappedLoc = await db.itemLocations.filter(il => 
            String(il.itemId) === String(rItem.itemId) && 
            String(il.locationId) === String(sourceLocationId)
          ).first();

          if (mappedLoc && mappedLoc.id) {
            const newLocStock = Math.max(0, (mappedLoc.quantity || 0) - safeNum(rItem.returnQuantity));
            await db.itemLocations.update(mappedLoc.id, {
              quantity: newLocStock,
              updatedAt: new Date().toISOString()
            });

            await syncManager.logMutation('ITEM_LOCATION', String(mappedLoc.id), 'UPDATE', {
              ...mappedLoc,
              quantity: newLocStock,
              updatedAt: new Date().toISOString()
            });

            saveServerItemLocation({
              tenantId: activeTenantId,
              itemId: String(rItem.itemId),
              locationId: String(sourceLocationId),
              quantity: newLocStock
            }).catch(() => {});
          }

          // If returning from Warehouse, also deduct from warehouse physical racks using FIFO!
          if (isWarehouse) {
            const allRackMaps = await db.itemLocations.filter(il => 
              String(il.itemId) === String(rItem.itemId) && 
              (String(il.locationId).startsWith('rack-') || String(il.locationId).startsWith('shelf-')) &&
              il.quantity > 0
            ).toArray();

            let remainingRackDeduct = safeNum(rItem.returnQuantity);
            for (const rMap of allRackMaps) {
              if (remainingRackDeduct <= 0) break;
              const currentRackQty = rMap.quantity || 0;
              const deductFromThisRack = Math.min(currentRackQty, remainingRackDeduct);
              const newRackQty = currentRackQty - deductFromThisRack;
              remainingRackDeduct -= deductFromThisRack;

              if (rMap.id) {
                await db.itemLocations.update(rMap.id, {
                  quantity: newRackQty,
                  updatedAt: new Date().toISOString()
                });
                await syncManager.logMutation('ITEM_LOCATION', String(rMap.id), 'UPDATE', {
                  ...rMap,
                  quantity: newRackQty,
                  updatedAt: new Date().toISOString()
                });
                saveServerItemLocation({
                  tenantId: activeTenantId,
                  itemId: String(rItem.itemId),
                  locationId: String(rMap.locationId),
                  quantity: newRackQty
                }).catch(() => {});
              }
            }
          }
        }
      }

      // 3. Handle Settlement Mode (Cash Refund vs Supplier Ledger)
      if (settlementMode === 'CASH_REFUND') {
        // Supplier paid back in Cash -> Record Cash Inflow into Cash Drawer
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
      } else {
        // Debit Note / Khata Deduction -> Reduce Supplier Payable Balance
        if (selectedSupplier.id) {
          const curBal = safeNum(selectedSupplier.currentBalance);
          const newBal = Math.max(0, curBal - totalReturnAmount);
          await db.parties.update(selectedSupplier.id, { currentBalance: newBal });
          await syncManager.logMutation('PARTY', String(selectedSupplier.id), 'UPDATE', { 
            id: selectedSupplier.id, 
            currentBalance: newBal 
          });
        }
      }

      // 4. Send to PostgreSQL server API
      try {
        await createServerPurchaseReturn({
          ...newReturn,
          sourceLocationId,
          settlementMode
        });
      } catch (err) {
        console.warn('Failed to sync Purchase Return to cloud server:', err);
      }

      const locName = availableLocations.find(l => l.id === sourceLocationId)?.name || 'Selected Location';
      showToast(`Debit Note ${debitNoteNumber} issued! Stock deducted from ${locName} & ${settlementMode === 'CASH_REFUND' ? 'Cash refund recorded' : 'Supplier khata adjusted'}.`, 'success');
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
            <span>Create Purchase Return (Debit Note)</span>
          </h2>
          <p className="text-xs text-slate-500 font-semibold">
            Return defective or excess items to supplier — Deducts stock from selected location & adjusts payables or cash
          </p>
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
                const found = suppliers.find(s => String(s.id) === String(e.target.value));
                if (found) setSelectedSupplier(found);
              }}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} (Payable: Rs. {safeNum(s.currentBalance).toLocaleString()})
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
              required
              value={returnDate}
              onChange={e => setReturnDate(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Ref Original Bill (Optional)</label>
            {supplierPastBills.length > 0 ? (
              <select
                value={purchaseBillNumber}
                onChange={e => setPurchaseBillNumber(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">-- Manual / Direct Return --</option>
                {supplierPastBills.map(b => (
                  <option key={b.billId || b.billNumber} value={b.billNumber}>
                    {b.billNumber} ({b.billDate}) - Rs. {safeNum(b.grandTotal).toLocaleString()}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder="e.g. PUR-9821"
                value={purchaseBillNumber}
                onChange={e => setPurchaseBillNumber(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            )}
          </div>
        </div>

        {/* 📍 SOURCE LOCATION SELECTOR (Store Front vs Warehouse) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-extrabold text-slate-800 flex items-center gap-2">
                <Store className="w-4 h-4 text-amber-600" />
                <span>Return Stock From (Source Location) *</span>
              </label>
              <p className="text-[11px] text-slate-500 font-medium">
                Choose whether items are being removed from the Store Front retail shelf or the Warehouse
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availableLocations.map(loc => {
              const isSelected = sourceLocationId === loc.id;
              const isStoreFront = loc.type === 'STORE_FRONT' || loc.id.startsWith('sf-');
              return (
                <button
                  type="button"
                  key={loc.id}
                  onClick={() => setSourceLocationId(loc.id)}
                  className={`flex items-center gap-4 p-4 rounded-2xl border text-left cursor-pointer transition-all ${
                    isSelected 
                      ? 'border-red-500 bg-red-50/40 ring-2 ring-red-500/20 shadow-xs' 
                      : 'border-slate-200 bg-slate-50/60 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <div className={`p-3 rounded-xl ${isStoreFront ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                    {isStoreFront ? <Store className="w-6 h-6" /> : <Warehouse className="w-6 h-6" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-extrabold text-slate-800 truncate">{loc.name}</span>
                      {isSelected && <CheckCircle2 className="w-5 h-5 text-red-600 shrink-0" />}
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500 block mt-0.5">
                      {isStoreFront ? 'Retail Sales Counter & Shelf Stock' : 'Main Warehouse & Bulk Storage Stock'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 💵 SETTLEMENT / REFUND MODE */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <label className="text-xs font-extrabold text-slate-800 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-blue-600" />
            <span>Settlement Mode (Supplier Compensation) *</span>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setSettlementMode('SUPPLIER_CREDIT')}
              className={`flex items-start gap-3 p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                settlementMode === 'SUPPLIER_CREDIT'
                  ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-500/20'
                  : 'border-slate-200 bg-slate-50/60 hover:bg-slate-50'
              }`}
            >
              <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
                <CreditCard className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Deduct from Supplier Ledger (Khata / Debit Note)</span>
                  {settlementMode === 'SUPPLIER_CREDIT' && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Reduces supplier's payable balance. Ideal when supplier will adjust this amount in next purchase bill.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSettlementMode('CASH_REFUND')}
              className={`flex items-start gap-3 p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                settlementMode === 'CASH_REFUND'
                  ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20'
                  : 'border-slate-200 bg-slate-50/60 hover:bg-slate-50'
              }`}
            >
              <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                <DollarSign className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Immediate Cash Refund (Naqad Wapsi)</span>
                  {settlementMode === 'CASH_REFUND' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Supplier returned cash immediately. Records cash inflow into Cash Drawer. Supplier khata remains unchanged.
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* 📦 ADD ITEM SECTION */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <label className="text-xs font-bold text-slate-700 block">Select Items to Return</label>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-6">
              <label className="text-[11px] font-semibold text-slate-500 block mb-1">Product Item</label>
              <select
                value={selectedItemId}
                onChange={e => setSelectedItemId(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">-- Choose Item from Inventory --</option>
                {items.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name} (Total Stock: {item.currentStock || 0} {item.unitType || 'PCS'})
                  </option>
                ))}
              </select>

              {/* Dynamic Live Stock Badge at selected location */}
              {selectedItemId !== '' && (
                <div className="flex items-center gap-2 mt-1.5 text-xs">
                  <span className="text-[11px] font-semibold text-slate-500">Available at selected location:</span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                    currentItemAvailableStock > 0 
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                      : 'bg-red-100 text-red-800 border border-red-200'
                  }`}>
                    {currentItemAvailableStock} PCS
                  </span>
                </div>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="text-[11px] font-semibold text-slate-500 block mb-1">Return Qty</label>
              <input
                type="number"
                min="1"
                max={currentItemAvailableStock > 0 ? currentItemAvailableStock : undefined}
                value={quantity}
                onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-[11px] font-semibold text-slate-500 block mb-1">Return Rate (Rs)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={unitPrice}
                onChange={e => setUnitPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="button"
                onClick={handleAddItem}
                disabled={!selectedItemId || (currentItemAvailableStock === 0)}
                className={`w-full p-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-all ${
                  !selectedItemId || currentItemAvailableStock === 0
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-red-600 text-white hover:bg-red-700 shadow-sm'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>Add Item</span>
              </button>
            </div>
          </div>

          {/* Table of items being returned */}
          {returnItems.length > 0 && (
            <div className="overflow-x-auto border border-slate-200 rounded-xl mt-3">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-[11px] font-extrabold text-slate-600 border-b border-slate-200">
                    <th className="p-2.5">Item Name</th>
                    <th className="p-2.5 text-center">Unit</th>
                    <th className="p-2.5 text-center">Return Qty</th>
                    <th className="p-2.5 text-right">Return Rate</th>
                    <th className="p-2.5 text-right">Total Amount</th>
                    <th className="p-2.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                  {returnItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-2.5">{item.itemName}</td>
                      <td className="p-2.5 text-center text-slate-500 text-[11px]">{item.unitType}</td>
                      <td className="p-2.5 text-center">
                        <input
                          type="number"
                          min="1"
                          value={item.returnQuantity}
                          onChange={e => handleItemQuantityChange(idx, Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 p-1 text-center bg-white border border-slate-200 rounded-lg text-xs font-bold"
                        />
                      </td>
                      <td className="p-2.5 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={e => handleItemPriceChange(idx, Math.max(0, parseFloat(e.target.value) || 0))}
                          className="w-20 p-1 text-right bg-white border border-slate-200 rounded-lg text-xs font-bold"
                        />
                      </td>
                      <td className="p-2.5 text-right text-red-600 font-extrabold">
                        Rs. {safeNum(item.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-slate-400 hover:text-red-600 p-1 rounded-md transition-colors cursor-pointer"
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

        {/* Reason / Remarks & Summary */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Return Reason / Remarks</label>
            <input
              type="text"
              placeholder="e.g. Returned 2 defective units damaged in transit or expired..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div className="flex items-center justify-end gap-6">
            <div className="text-right">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Return Value</span>
              <span className="text-xl font-extrabold text-red-600">
                Rs. {totalReturnAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <button
              type="submit"
              disabled={isSaving || returnItems.length === 0}
              className={`px-6 py-3 rounded-xl text-xs font-extrabold flex items-center gap-2 cursor-pointer transition-all shadow-md ${
                isSaving || returnItems.length === 0
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                  : 'bg-red-600 text-white hover:bg-red-700 active:scale-95'
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              <span>{isSaving ? 'Processing Return...' : 'ISSUE DEBIT NOTE'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
