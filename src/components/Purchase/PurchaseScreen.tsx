import React, { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Trash2, CheckCircle2, User, FileText, ArrowUpRight } from 'lucide-react';
import { Item, Party, InvoiceItem, PaymentMethod, BusinessDetails, PurchaseBill, InventoryLocation } from '../../types';
import { db } from '../../db';
import { createServerPurchase } from '../../services/api';
import { syncManager } from '../../services/sync';
import { useToast } from '../Common/ToastContext';

interface PurchaseScreenProps {
  items: Item[];
  parties: Party[];
  business: BusinessDetails;
  onPurchaseCreated: () => void;
}

export const PurchaseScreen: React.FC<PurchaseScreenProps> = ({
  items,
  parties,
  business,
  onPurchaseCreated
}) => {
  const { showToast } = useToast();
  const suppliers = parties.filter(p => p.type === 'SUPPLIER' || p.type === 'BOTH');
  const [selectedSupplier, setSelectedSupplier] = useState<Party | null>(suppliers[0] || null);
  const [billNumber, setBillNumber] = useState(`PUR-${Date.now().toString().slice(-4)}`);
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CREDIT');
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [purchaseItems, setPurchaseItems] = useState<InvoiceItem[]>([]);
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
    const sub = qty * rate;
    const cgst = safeNum(item.cgstRate);
    const sgst = safeNum(item.sgstRate);
    const igst = safeNum(item.igstRate);
    const tax = (sub * (cgst + sgst)) / 100;
    const totalAmount = sub + tax;

    const newItem: InvoiceItem = {
      itemId: item.id!,
      itemName: item.name,
      hsnSacCode: item.hsnSacCode || '1000',
      unitType: item.unitType || 'PCS',
      quantity: qty,
      unitPrice: rate,
      purchasePrice: rate,
      cgstRate: cgst,
      sgstRate: sgst,
      igstRate: igst,
      taxAmount: tax,
      totalAmount: totalAmount
    };

    setPurchaseItems(prev => [...prev, newItem]);
    setSelectedItemId('');
    setQuantity(1);
    setUnitRate(0);
  };

  const updatePurchaseItemQty = (idx: number, newQty: number) => {
    setPurchaseItems(prev =>
      prev.map((item, i) => {
        if (i === idx) {
          const qty = Math.max(1, newQty);
          const sub = qty * item.unitPrice;
          const cgst = safeNum(item.cgstRate);
          const sgst = safeNum(item.sgstRate);
          const tax = (sub * (cgst + sgst)) / 100;
          return { ...item, quantity: qty, taxAmount: tax, totalAmount: sub + tax };
        }
        return item;
      })
    );
  };

  const updatePurchaseItemRate = (idx: number, newRate: number) => {
    setPurchaseItems(prev =>
      prev.map((item, i) => {
        if (i === idx) {
          const rate = Math.max(0, newRate);
          const sub = item.quantity * rate;
          const cgst = safeNum(item.cgstRate);
          const sgst = safeNum(item.sgstRate);
          const tax = (sub * (cgst + sgst)) / 100;
          return { ...item, unitPrice: rate, purchasePrice: rate, taxAmount: tax, totalAmount: sub + tax };
        }
        return item;
      })
    );
  };

  const updatePurchaseItemTax = (idx: number, newTaxRate: number) => {
    setPurchaseItems(prev =>
      prev.map((item, i) => {
        if (i === idx) {
          const taxPct = Math.max(0, newTaxRate);
          const half = taxPct / 2;
          const sub = item.quantity * item.unitPrice;
          const tax = (sub * taxPct) / 100;
          return {
            ...item,
            cgstRate: half,
            sgstRate: half,
            igstRate: taxPct,
            taxAmount: tax,
            totalAmount: sub + tax
          };
        }
        return item;
      })
    );
  };

  const subtotalCost = purchaseItems.reduce((sum, i) => sum + (safeNum(i.quantity) * safeNum(i.unitPrice)), 0);
  const taxTotalCost = purchaseItems.reduce((sum, i) => sum + safeNum(i.taxAmount), 0);
  const totalBillAmount = subtotalCost + taxTotalCost;

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (purchaseItems.length === 0 || !selectedSupplier) {
      alert('Please select a supplier and add at least one item to purchase!');
      return;
    }

    const currentTenantId = business?.tenantId || localStorage.getItem('vyapar_current_tenant') || 'default-tenant';
    const totalAmount = totalBillAmount;
    const paidAmt = paymentMethod === 'CREDIT' ? 0 : (paidAmount ? Math.max(0, parseFloat(paidAmount)) : totalAmount);
    const dueAmt = paymentMethod === 'CREDIT' ? totalAmount : Math.max(0, totalAmount - paidAmt);
    const status: 'PAID' | 'UNPAID' | 'PARTIAL' = paymentMethod === 'CREDIT' ? 'UNPAID' : (dueAmt === 0 ? 'PAID' : (dueAmt >= totalAmount ? 'UNPAID' : 'PARTIAL'));

    const newPurchaseBill: PurchaseBill = {
      billId: `PUR-BILL-${Date.now()}`,
      tenantId: currentTenantId,
      billNumber,
      billDate,
      supplierId: selectedSupplier?.id,
      supplierName: selectedSupplier?.name || 'Walk-in Vendor',
      supplierPhone: selectedSupplier?.phone || '',
      supplierGstin: selectedSupplier?.gstin || '',
      receivingLocationId: receivingLocationId ? Number(receivingLocationId) : undefined,
      items: purchaseItems.map(i => ({
        itemId: i.itemId,
        itemName: i.itemName,
        hsnSacCode: i.hsnSacCode,
        unitType: i.unitType,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        purchasePrice: i.purchasePrice,
        taxAmount: i.taxAmount,
        totalAmount: i.totalAmount
      })),
      subtotal: totalAmount,
      taxTotal: taxTotalCost,
      grandTotal: totalAmount,
      paidAmount: paidAmt,
      dueAmount: dueAmt,
      paymentStatus: status,
      paymentMethod: paymentMethod || 'CASH',
      createdAt: new Date().toISOString()
    };

    await db.purchaseBills.add(newPurchaseBill);

    for (const pItem of purchaseItems) {
      const dbItem = await db.items.get(pItem.itemId);
      if (dbItem) {
        const newStock = safeNum(dbItem.currentStock) + safeNum(pItem.quantity);
        await db.items.update(pItem.itemId, {
          currentStock: newStock,
          purchasePrice: pItem.unitPrice,
          updatedAt: new Date().toISOString()
        });
        await syncManager.logMutation('ITEM', String(pItem.itemId), 'UPDATE', { id: pItem.itemId, name: dbItem.name, skuCode: dbItem.skuCode, currentStock: newStock, purchasePrice: pItem.unitPrice });
      }

      if (receivingLocationId) {
        const locIdNum = Number(receivingLocationId);
        const existingMapping = await db.itemLocations
          .filter(il => Number(il.itemId) === Number(pItem.itemId) && Number(il.locationId) === locIdNum)
          .first();

        if (existingMapping && existingMapping.id) {
          const newLocQty = (existingMapping.quantity || 0) + pItem.quantity;
          await db.itemLocations.update(existingMapping.id, {
            quantity: newLocQty,
            updatedAt: new Date().toISOString()
          });
        } else {
          await db.itemLocations.add({
            tenantId: currentTenantId,
            itemId: pItem.itemId,
            locationId: locIdNum,
            quantity: pItem.quantity,
            updatedAt: new Date().toISOString()
          });
        }
      }

      await db.itemRestocks.add({
        itemId: pItem.itemId,
        itemName: pItem.itemName,
        tenantId: currentTenantId,
        supplierId: selectedSupplier?.id,
        supplierName: selectedSupplier?.name || 'Supplier Restock',
        supplierPhone: selectedSupplier?.phone || '',
        billNumber,
        restockDate: billDate,
        quantityAdded: pItem.quantity,
        purchasePrice: pItem.unitPrice,
        totalCost: pItem.totalAmount,
        source: 'PURCHASE_BILL',
        createdAt: new Date().toISOString()
      });
    }

    // 2. Update Supplier Accounts Payable Ledger Balance (only for dueAmt)
    if (selectedSupplier?.id && dueAmt > 0) {
      const curBal = safeNum(selectedSupplier.currentBalance);
      const newBal = curBal + dueAmt;
      await db.parties.update(selectedSupplier.id, {
        currentBalance: newBal
      });
      await syncManager.logMutation('PARTY', String(selectedSupplier.id), 'UPDATE', { id: selectedSupplier.id, currentBalance: newBal });
    }

    // 4. Send to PostgreSQL backend REST API
    if (selectedSupplier) {
      await createServerPurchase({
        billNumber,
        billDate,
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.name,
        items: purchaseItems
      });
    }

    showToast(`Purchase Inward Bill ${billNumber} saved successfully! Total Rs ${totalAmount.toFixed(2)} added to stock & supplier payable.`, 'success');
    setPurchaseItems([]);
    setBillNumber(`PUR-${Date.now().toString().slice(-4)}`);
    onPurchaseCreated();
  };

  return (
    <div className="flex-1 flex flex-col p-5 bg-[#f3f4f6] overflow-hidden gap-4 select-none">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-blue-600" />
            <span>Purchase Inward & Supplier Bills</span>
          </h2>
          <p className="text-xs text-slate-500 font-semibold">Record purchase bills from suppliers to add stock and update payables</p>
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
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.phone})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Receive Inbound Stock To</label>
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
              <label className="text-xs font-bold text-slate-600 block mb-1">Supplier Bill #</label>
              <input
                type="text"
                value={billNumber}
                onChange={e => setBillNumber(e.target.value)}
                className="input-field text-xs font-mono font-bold"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Bill Date</label>
              <input
                type="date"
                value={billDate}
                onChange={e => setBillDate(e.target.value)}
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
                <option value="">-- Choose SKU Item --</option>
                {items.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.name} (Stock: {i.currentStock})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Inward Quantity</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={e => setQuantity(parseInt(e.target.value) || 1)}
                className="input-field text-xs font-mono font-bold text-center"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Purchase Rate (Rs)</label>
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
              className="btn-vyapar-blue text-xs font-bold py-2 flex items-center justify-center gap-1 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add to Purchase</span>
            </button>
          </div>

          {/* Purchase Items List Table */}
          <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
            <div className="flex-1 overflow-auto">
              <table className="vyapar-table">
                <thead>
                  <tr>
                    <th>Item Description</th>
                    <th>Inward Qty</th>
                    <th>Purchase Rate (Rs)</th>
                    <th>GST Tax %</th>
                    <th className="text-right">Total Amount (Rs)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-16 text-slate-400 text-xs">
                        No purchase items added yet. Select a product above.
                      </td>
                    </tr>
                  ) : (
                    purchaseItems.map((item, idx) => {
                      const itemTaxRate = Number(item.igstRate || (Number(item.cgstRate || 0) + Number(item.sgstRate || 0)));
                      const itemTotal = safeNum(item.totalAmount) > 0
                        ? safeNum(item.totalAmount)
                        : safeNum(item.quantity) * safeNum(item.unitPrice) + safeNum(item.taxAmount);
                      return (
                        <tr key={idx}>
                          <td className="font-bold text-slate-800 text-xs">{item.itemName}</td>
                          <td>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => updatePurchaseItemQty(idx, item.quantity - 1)}
                                className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center border border-slate-300 cursor-pointer"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={e => updatePurchaseItemQty(idx, parseInt(e.target.value) || 1)}
                                className="w-12 text-center bg-slate-50 border border-slate-300 rounded text-xs text-slate-900 font-bold py-0.5"
                              />
                              <button
                                type="button"
                                onClick={() => updatePurchaseItemQty(idx, item.quantity + 1)}
                                className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center border border-slate-300 cursor-pointer"
                              >
                                +
                              </button>
                              <span className="text-[10px] text-slate-500 font-bold ml-1">{item.unitType}</span>
                            </div>
                          </td>
                          <td>
                            <input
                              type="number"
                              value={item.unitPrice}
                              onChange={e => updatePurchaseItemRate(idx, parseFloat(e.target.value) || 0)}
                              className="w-20 bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 text-xs text-slate-900 font-mono font-bold"
                            />
                          </td>
                          <td>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={itemTaxRate}
                                onChange={e => updatePurchaseItemTax(idx, parseFloat(e.target.value) || 0)}
                                className="w-14 bg-slate-50 border border-slate-300 rounded px-1 py-0.5 text-xs text-slate-900 font-mono font-bold text-center"
                              />
                              <span className="text-[10px] text-slate-500 font-bold">%</span>
                            </div>
                          </td>
                          <td className="font-mono text-xs font-black text-blue-600 text-right">Rs {itemTotal.toFixed(2)}</td>
                          <td className="text-center">
                            <button
                              onClick={() => setPurchaseItems(prev => prev.filter((_, i) => i !== idx))}
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

        {/* Right Summary & Checkout Panel */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="font-extrabold text-sm text-slate-800 border-b border-slate-200 pb-2">
              Purchase Summary
            </h3>

            <div className="bg-slate-50 p-4 rounded-xl space-y-2 text-xs font-mono">
              <div className="flex justify-between text-slate-600">
                <span>Supplier:</span>
                <span className="font-bold text-slate-900">{selectedSupplier?.name}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Total Items:</span>
                <span className="font-bold text-slate-900">{purchaseItems.length}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Subtotal (Net):</span>
                <span className="font-bold text-slate-900">Rs {subtotalCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Tax Total (GST):</span>
                <span className="font-bold text-amber-600">+Rs {taxTotalCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-black text-blue-600 pt-2 border-t border-slate-200">
                <span>TOTAL COST:</span>
                <span>Rs {totalBillAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleSavePurchase}
            disabled={purchaseItems.length === 0}
            className="btn-vyapar-blue w-full py-3 text-sm font-extrabold shadow-md disabled:opacity-50 cursor-pointer"
          >
            SAVE PURCHASE BILL & INWARD STOCK
          </button>
        </div>
      </div>
    </div>
  );
};
