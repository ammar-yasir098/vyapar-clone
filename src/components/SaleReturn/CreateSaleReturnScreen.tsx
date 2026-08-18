import React, { useState } from 'react';
import { 
  RotateCcw, 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Save, 
  User, 
  PackagePlus,
  FileText
} from 'lucide-react';
import { Party, Item, SaleReturn, SaleReturnItem, BusinessDetails } from '../../types';
import { db } from '../../db';
import { createServerSaleReturn } from '../../services/api';
import { syncManager } from '../../services/sync';
import { recordCashEntry } from '../../services/cash';
import { useToast } from '../Common/ToastContext';

interface CreateSaleReturnScreenProps {
  parties: Party[];
  items: Item[];
  business: BusinessDetails;
  onReturnCreated: () => void;
  onCancel: () => void;
}

export const CreateSaleReturnScreen: React.FC<CreateSaleReturnScreenProps> = ({
  parties,
  items,
  business,
  onReturnCreated,
  onCancel
}) => {
  const { showToast } = useToast();

  const [creditNoteNumber, setCreditNoteNumber] = useState(`CR-${Date.now().toString().slice(-4)}`);
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [selectedPartyId, setSelectedPartyId] = useState<number | ''>('');
  const [partyName, setPartyName] = useState('');
  const [partyPhone, setPartyPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Return items state
  const [returnItems, setReturnItems] = useState<Array<{
    itemId?: number;
    itemName: string;
    hsnSacCode: string;
    unitType: string;
    returnQuantity: number;
    unitPrice: number;
    taxAmount: number;
    totalAmount: number;
  }>>([
    { itemName: '', hsnSacCode: '1000', unitType: 'PCS', returnQuantity: 1, unitPrice: 0, taxAmount: 0, totalAmount: 0 }
  ]);

  const handlePartySelect = (partyIdStr: string) => {
    if (!partyIdStr) {
      setSelectedPartyId('');
      setPartyName('');
      setPartyPhone('');
      return;
    }
    const pid = Number(partyIdStr);
    setSelectedPartyId(pid);
    const p = parties.find(party => party.id === pid);
    if (p) {
      setPartyName(p.name);
      setPartyPhone(p.phone || '');
    }
  };

  const handleItemSelect = (index: number, itemIdStr: string) => {
    const updated = [...returnItems];
    if (!itemIdStr) {
      updated[index] = { ...updated[index], itemId: undefined, itemName: '', unitPrice: 0, totalAmount: 0 };
      setReturnItems(updated);
      return;
    }
    const itemId = Number(itemIdStr);
    const selectedItem = items.find(i => i.id === itemId);
    if (selectedItem) {
      const price = selectedItem.salesPrice || selectedItem.purchasePrice || 0;
      const qty = updated[index].returnQuantity || 1;
      updated[index] = {
        ...updated[index],
        itemId: selectedItem.id,
        itemName: selectedItem.name,
        hsnSacCode: selectedItem.hsnSacCode || '1000',
        unitType: selectedItem.unitType || 'PCS',
        unitPrice: price,
        totalAmount: qty * price
      };
      setReturnItems(updated);
    }
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const updated = [...returnItems];
    const item = { ...updated[index], [field]: value };
    
    if (field === 'returnQuantity' || field === 'unitPrice') {
      const qty = Number(item.returnQuantity) || 0;
      const price = Number(item.unitPrice) || 0;
      item.totalAmount = qty * price;
    }
    
    updated[index] = item;
    setReturnItems(updated);
  };

  const handleAddItemRow = () => {
    setReturnItems([
      ...returnItems,
      { itemName: '', hsnSacCode: '1000', unitType: 'PCS', returnQuantity: 1, unitPrice: 0, taxAmount: 0, totalAmount: 0 }
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (returnItems.length === 1) return;
    setReturnItems(returnItems.filter((_, i) => i !== index));
  };

  const grandTotal = returnItems.reduce((sum, item) => sum + (item.totalAmount || 0), 0);

  const handleSaveReturn = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!partyName.trim()) {
      showToast('Please select or enter a customer name', 'warning');
      return;
    }

    const validItems = returnItems.filter(item => item.itemName.trim() !== '' && item.returnQuantity > 0);
    if (validItems.length === 0) {
      showToast('Please add at least one valid returned product', 'warning');
      return;
    }

    setIsSaving(true);

    try {
      const activeTenant = business.tenantId || 'default-tenant';
      const uniqueReturnId = `cr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const newReturn: SaleReturn = {
        returnId: uniqueReturnId,
        tenantId: activeTenant,
        creditNoteNumber,
        returnDate,
        invoiceNumber: invoiceNumber.trim() || undefined,
        partyId: selectedPartyId !== '' ? Number(selectedPartyId) : undefined,
        partyName,
        partyPhone,
        items: validItems,
        subtotal: grandTotal,
        taxTotal: 0,
        grandTotal,
        refundAmount: grandTotal,
        notes,
        createdAt: new Date().toISOString()
      };

      // 1. Save locally to Dexie IndexedDB
      await db.saleReturns.add(newReturn);

      // Record Cash Outflow Refund if grandTotal > 0
      if (grandTotal > 0) {
        await recordCashEntry({
          tenantId: activeTenant,
          type: 'OUT',
          amount: grandTotal,
          source: 'SALE_RETURN_REFUND',
          referenceId: creditNoteNumber,
          description: `Cash refund for Sale Return ${creditNoteNumber} (${partyName})`,
          transactionDate: returnDate
        });
      }

      // 2. Increase Item Stock Levels (item.currentStock += returnedQty)
      for (const item of validItems) {
        if (item.itemId) {
          const dbItem = await db.items.get(item.itemId);
          if (dbItem) {
            const currentStock = dbItem.currentStock || 0;
            await db.items.update(item.itemId, {
              currentStock: currentStock + item.returnQuantity
            });
          }
        }
      }

      // 3. Deduct Customer Ledger Balance (customer.balance -= returnAmount)
      if (selectedPartyId !== '') {
        const party = await db.parties.get(Number(selectedPartyId));
        if (party) {
          const currentBal = party.currentBalance || 0;
          await db.parties.update(Number(selectedPartyId), {
            currentBalance: Math.max(0, currentBal - grandTotal)
          });
        }
      }

      // 4. Update corresponding Sales Invoice dueAmount & paymentStatus in Dexie IndexedDB
      let targetInvoice: any = null;
      if (invoiceNumber.trim() !== '') {
        targetInvoice = await db.invoices.where('invoiceNumber').equalsIgnoreCase(invoiceNumber.trim()).first();
      }
      if (!targetInvoice && selectedPartyId !== '') {
        const openInvoices = await db.invoices
          .filter(inv => inv.partyId === Number(selectedPartyId) && (inv.dueAmount !== undefined ? inv.dueAmount : inv.grandTotal) > 0)
          .toArray();
        if (openInvoices.length > 0) targetInvoice = openInvoices[0];
      }

      if (targetInvoice && targetInvoice.id) {
        const curDue = targetInvoice.dueAmount !== undefined ? targetInvoice.dueAmount : targetInvoice.grandTotal;
        const newDue = Math.max(0, curDue - grandTotal);
        const newStatus = newDue === 0 ? 'PAID' : (newDue < targetInvoice.grandTotal ? 'PARTIAL' : targetInvoice.paymentStatus);
        
        await db.invoices.update(targetInvoice.id, {
          dueAmount: newDue,
          paymentStatus: newStatus
        });

        // Log mutation to update sales invoice in sync engine
        const updatedInvoice = { ...targetInvoice, dueAmount: newDue, paymentStatus: newStatus };
        await syncManager.logMutation('INVOICE', targetInvoice.invoiceId || String(targetInvoice.id), 'UPDATE', updatedInvoice);
      }

      // 5. Log SaleReturn mutation to offline sync journal
      await syncManager.logMutation('SALE_RETURN', uniqueReturnId, 'INSERT', newReturn);

      // 6. Try syncing directly to Express/Sequelize PostgreSQL server
      try {
        await createServerSaleReturn(newReturn);
      } catch (serverErr) {
        console.warn('Server sync offline for sale return:', serverErr);
      }

      showToast(`Credit Note ${creditNoteNumber} created! Stock restored (+qty) & customer ledger credited.`, 'success');
      onReturnCreated();
    } catch (err: any) {
      console.error('Error creating sale return:', err);
      showToast(`Failed to create sale return: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const customerParties = parties.filter(p => p.type === 'CUSTOMER' || p.type === 'BOTH');

  return (
    <div className="flex-1 bg-[#f0f4f8] p-6 overflow-y-auto select-none">
      <form onSubmit={handleSaveReturn} className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="p-2 rounded-xl bg-white text-slate-600 hover:text-slate-900 border border-slate-200 transition cursor-pointer shadow-xs"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-emerald-600" />
                <span>Create Sale Return / Credit Note</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium">Record returned goods from customer — Stock restocks & customer balance reduces</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl font-extrabold text-xs shadow-md transition cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4 stroke-[2.5]" />
              <span>{isSaving ? 'Saving...' : 'Save Credit Note'}</span>
            </button>
          </div>
        </div>

        {/* Basic Details Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center gap-2">
            <User className="w-4 h-4 text-emerald-600" />
            <span>Customer & Return Information</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Select Customer *</label>
              <select
                value={selectedPartyId}
                onChange={e => handlePartySelect(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="">-- Choose Customer --</option>
                {customerParties.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.phone ? `(${p.phone})` : ''} - Bal: Rs {p.currentBalance || 0}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Customer Name *</label>
              <input
                type="text"
                placeholder="Customer full name"
                value={partyName}
                onChange={e => setPartyName(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Customer Phone</label>
              <input
                type="text"
                placeholder="Phone number"
                value={partyPhone}
                onChange={e => setPartyPhone(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Credit Note #</label>
              <input
                type="text"
                value={creditNoteNumber}
                onChange={e => setCreditNoteNumber(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Return Date</label>
              <input
                type="date"
                value={returnDate}
                onChange={e => setReturnDate(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Ref Original Invoice # (Optional)</label>
              <input
                type="text"
                placeholder="e.g. INV-2026-0001"
                value={invoiceNumber}
                onChange={e => setInvoiceNumber(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Returned Items Table Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <PackagePlus className="w-4 h-4 text-emerald-600" />
              <span>Returned Items & Restock Quantities</span>
            </h2>
            <button
              type="button"
              onClick={handleAddItemRow}
              className="flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer border border-emerald-200"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Item Row</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="py-2.5 px-3">Select Inventory Product</th>
                  <th className="py-2.5 px-3">Product Name</th>
                  <th className="py-2.5 px-3 text-center">Return Qty (+Stock)</th>
                  <th className="py-2.5 px-3 text-right">Unit Price (Rs)</th>
                  <th className="py-2.5 px-3 text-right">Total Amount (Rs)</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {returnItems.map((item, index) => (
                  <tr key={index} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-3 w-56">
                      <select
                        value={item.itemId || ''}
                        onChange={e => handleItemSelect(index, e.target.value)}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer"
                      >
                        <option value="">-- Choose Item --</option>
                        {items.map(i => (
                          <option key={i.id} value={i.id}>
                            {i.name} (Stock: {i.currentStock}) - Rs {i.salesPrice || i.purchasePrice}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        placeholder="Item name"
                        value={item.itemName}
                        onChange={e => handleItemChange(index, 'itemName', e.target.value)}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                        required
                      />
                    </td>

                    <td className="py-2.5 px-3 text-center w-32">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={item.returnQuantity}
                        onChange={e => handleItemChange(index, 'returnQuantity', parseFloat(e.target.value) || 0)}
                        className="w-full p-2 bg-emerald-50 border border-emerald-300 rounded-lg text-xs font-bold text-center text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        required
                      />
                    </td>

                    <td className="py-2.5 px-3 text-right w-36">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={e => handleItemChange(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-right font-bold text-slate-800"
                        required
                      />
                    </td>

                    <td className="py-2.5 px-3 text-right font-black text-emerald-700 font-mono w-40">
                      Rs. {(item.totalAmount || 0).toFixed(2)}
                    </td>

                    <td className="py-2.5 px-3 text-center w-16">
                      <button
                        type="button"
                        onClick={() => handleRemoveItemRow(index)}
                        disabled={returnItems.length === 1}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition disabled:opacity-30 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Summary & Notes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
            <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Return Reason / Notes</span>
            </label>
            <textarea
              rows={3}
              placeholder="e.g. 2 defective chairs returned by customer. Restocked into inventory."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            ></textarea>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-3">
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-500 font-medium">
                <span>Subtotal Items Returned:</span>
                <span className="font-mono font-bold text-slate-800">Rs. {grandTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-bold border-t border-slate-100 pt-2 text-sm">
                <span>TOTAL CREDIT AMOUNT:</span>
                <span className="font-mono text-base font-black">Rs. {grandTotal.toFixed(2)}</span>
              </div>
            </div>

            <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-[11px] text-emerald-800 font-bold text-center">
              ✓ Stock Level will INCREASE by returned quantities<br />
              ✓ Customer Ledger Balance will DECREASE by Rs {grandTotal.toFixed(2)}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
