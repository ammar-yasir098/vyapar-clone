import React, { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Trash2, CheckCircle2, User, FileText, ArrowUpRight } from 'lucide-react';
import { Item, Party, InvoiceItem, PaymentMethod, BusinessDetails } from '../../types';
import { db } from '../../db';
import { createServerPurchase } from '../../services/api';

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
  const suppliers = parties.filter(p => p.type === 'SUPPLIER' || p.type === 'BOTH');
  const [selectedSupplier, setSelectedSupplier] = useState<Party | null>(suppliers[0] || null);
  const [billNumber, setBillNumber] = useState(`PUR-${Date.now().toString().slice(-4)}`);
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [purchaseItems, setPurchaseItems] = useState<InvoiceItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | ''>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [unitRate, setUnitRate] = useState<number>(0);

  useEffect(() => {
    if (!selectedSupplier && suppliers.length > 0) {
      setSelectedSupplier(suppliers[0]);
    }
  }, [suppliers]);

  const handleAddItem = () => {
    if (!selectedItemId) return;
    const item = items.find(i => i.id === Number(selectedItemId));
    if (!item) return;

    const rate = unitRate > 0 ? unitRate : item.purchasePrice;
    const sub = quantity * rate;
    const tax = (sub * (item.cgstRate + item.sgstRate)) / 100;

    const newItem: InvoiceItem = {
      itemId: item.id!,
      itemName: item.name,
      hsnSacCode: item.hsnSacCode,
      unitType: item.unitType,
      quantity,
      unitPrice: rate,
      purchasePrice: rate,
      cgstRate: item.cgstRate,
      sgstRate: item.sgstRate,
      igstRate: item.igstRate,
      taxAmount: tax,
      totalAmount: sub + tax
    };

    setPurchaseItems(prev => [...prev, newItem]);
    setSelectedItemId('');
    setQuantity(1);
    setUnitRate(0);
  };

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (purchaseItems.length === 0 || !selectedSupplier) {
      alert('Please select a supplier and add at least one item to purchase!');
      return;
    }

    const totalAmount = purchaseItems.reduce((sum, i) => sum + i.totalAmount, 0);

    // 1. Stock Inward: Increase Item stock levels in Dexie DB
    for (const pItem of purchaseItems) {
      const dbItem = await db.items.get(pItem.itemId);
      if (dbItem) {
        const newStock = dbItem.currentStock + pItem.quantity;
        await db.items.update(pItem.itemId, {
          currentStock: newStock,
          purchasePrice: pItem.unitPrice,
          updatedAt: new Date().toISOString()
        });
      }
    }

    // 2. Update Supplier Accounts Payable Ledger Balance
    if (selectedSupplier?.id) {
      const newBal = (selectedSupplier.currentBalance || 0) + totalAmount;
      await db.parties.update(selectedSupplier.id, {
        currentBalance: newBal
      });
    }

    // 3. Post Double-Entry Journal (Debit Inventory Asset, Credit Accounts Payable)
    const accounts = await db.ledgerAccounts.toArray();
    const invAcc = accounts.find(a => a.accountCode === '1040') || accounts[0];
    const apAcc = accounts.find(a => a.accountCode === '2010') || accounts[0];

    const count = await db.journalEntries.count();
    const suppName = selectedSupplier?.name || 'Supplier';
    await db.journalEntries.add({
      tenantId: 'default-tenant',
      entryNumber: `JE-2026-${(count + 1).toString().padStart(4, '0')}`,
      referenceId: billNumber,
      transactionDate: billDate,
      description: `Purchase Inward Bill ${billNumber} from ${suppName}`,
      lines: [
        { accountId: invAcc?.id || 1, accountCode: invAcc?.accountCode || '1040', accountName: invAcc?.accountName || 'Inventory Asset', debit: totalAmount, credit: 0 },
        { accountId: apAcc?.id || 2, accountCode: apAcc?.accountCode || '2010', accountName: `Accounts Payable (${suppName})`, debit: 0, credit: totalAmount }
      ],
      totalDebit: totalAmount,
      totalCredit: totalAmount,
      createdAt: new Date().toISOString()
    });

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

    alert(`Purchase Inward Bill ${billNumber} saved successfully! Inventory stock increased.`);
    setPurchaseItems([]);
    setBillNumber(`PUR-${Date.now().toString().slice(-4)}`);
    onPurchaseCreated();
  };

  const totalBillAmount = purchaseItems.reduce((sum, i) => sum + i.totalAmount, 0);

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
          {/* Supplier Info Form */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-3 gap-3">
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
              <label className="text-xs font-bold text-slate-600 block mb-1">Purchase Rate (₹)</label>
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
                    <th>Purchase Rate (₹)</th>
                    <th className="text-right">Total Amount (₹)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-16 text-slate-400 text-xs">
                        No purchase items added yet. Select a product above.
                      </td>
                    </tr>
                  ) : (
                    purchaseItems.map((item, idx) => (
                      <tr key={idx}>
                        <td className="font-bold text-slate-800 text-xs">{item.itemName}</td>
                        <td className="font-mono text-xs text-slate-700">{item.quantity} {item.unitType}</td>
                        <td className="font-mono text-xs text-slate-700">₹{Number(item.unitPrice || 0).toFixed(2)}</td>
                        <td className="font-mono text-xs font-black text-blue-600 text-right">₹{Number(item.totalAmount || 0).toFixed(2)}</td>
                        <td className="text-center">
                          <button
                            onClick={() => setPurchaseItems(prev => prev.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-red-500 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
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
              <div className="flex justify-between text-sm font-black text-blue-600 pt-2 border-t border-slate-200">
                <span>TOTAL COST:</span>
                <span>₹{Number(totalBillAmount || 0).toFixed(2)}</span>
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
