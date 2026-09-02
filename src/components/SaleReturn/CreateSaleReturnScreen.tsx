import React, { useState, useMemo } from 'react';
import { 
  RotateCcw, 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Save, 
  User, 
  PackagePlus, 
  FileText, 
  Banknote, 
  CreditCard, 
  CheckCircle2, 
  Store 
} from 'lucide-react';
import { Party, Item, SaleReturn, SaleReturnItem, BusinessDetails, Invoice } from '../../types';
import { db, getActiveTenantId } from '../../db';
import { createServerSaleReturn, saveServerItemLocation, updateServerParty } from '../../services/api';
import { syncManager } from '../../services/sync';
import { recordCashEntry } from '../../services/cash';
import { useToast } from '../Common/ToastContext';

interface CreateSaleReturnScreenProps {
  parties: Party[];
  items: Item[];
  invoices?: Invoice[];
  business: BusinessDetails;
  onReturnCreated: () => void;
  onCancel: () => void;
}

export const CreateSaleReturnScreen: React.FC<CreateSaleReturnScreenProps> = ({
  parties,
  items,
  invoices = [],
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

  // Settlement / Refund Mode: Cash Payout vs Store Credit (Advance Account Balance)
  const [refundMode, setRefundMode] = useState<'CASH_REFUND' | 'STORE_CREDIT'>('CASH_REFUND');

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

  const selectedPartyObj = parties.find(p => p.id === selectedPartyId);

  // Invoices for the selected party
  const partyInvoices = useMemo(() => {
    if (!selectedPartyId && !partyName) return [];
    return (invoices || []).filter(inv =>
      (selectedPartyId !== '' && String(inv.partyId) === String(selectedPartyId)) ||
      (inv.partyName && inv.partyName.trim().toLowerCase() === partyName.trim().toLowerCase())
    );
  }, [invoices, selectedPartyId, partyName]);

  const handlePartySelect = (partyIdStr: string) => {
    if (!partyIdStr) {
      setSelectedPartyId('');
      setPartyName('');
      setPartyPhone('');
      setInvoiceNumber('');
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

  const handleInvoiceSelect = (invNum: string) => {
    setInvoiceNumber(invNum);
    if (!invNum) return;
    const inv = partyInvoices.find(i => i.invoiceNumber === invNum);
    if (inv && inv.items && inv.items.length > 0) {
      const newItems = inv.items.map(it => ({
        itemId: it.itemId,
        itemName: it.itemName,
        hsnSacCode: it.hsnSacCode || '1000',
        unitType: it.unitType || 'PCS',
        returnQuantity: it.quantity || 1,
        unitPrice: it.unitPrice || 0,
        taxAmount: it.taxAmount || 0,
        totalAmount: (it.quantity || 1) * (it.unitPrice || 0)
      }));
      setReturnItems(newItems);
      showToast(`Loaded ${newItems.length} item(s) from invoice ${invNum}`, 'info');
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
      const activeTenant = getActiveTenantId(business);
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
        refundAmount: refundMode === 'CASH_REFUND' ? grandTotal : 0,
        notes,
        createdAt: new Date().toISOString()
      };

      // 1. Save locally to Dexie IndexedDB
      await db.saleReturns.add(newReturn);

      // 2. Increase Item Stock Levels & RESTOCK into Store Front shelf mapping
      const allLocs = await db.locations.toArray();
      const storeLoc = allLocs.find(l =>
        (l.tenantId === activeTenant) &&
        (l.isStoreFront || l.code === 'STORE-FRONT' || (l.name && l.name.toLowerCase().includes('store front')))
      );

      for (const item of validItems) {
        if (item.itemId) {
          const dbItem = await db.items.get(item.itemId);
          if (dbItem) {
            const currentStock = dbItem.currentStock || 0;
            const newStock = currentStock + item.returnQuantity;
            await db.items.update(item.itemId, {
              currentStock: newStock,
              updatedAt: new Date().toISOString()
            });

            await syncManager.logMutation('ITEM', String(item.itemId), 'UPDATE', { 
              id: item.itemId, 
              name: dbItem.name, 
              skuCode: dbItem.skuCode, 
              currentStock: newStock 
            });
          }

          // Restore specifically to Store Front Shelf Mapping
          if (storeLoc && storeLoc.id) {
            let mappedLoc = await db.itemLocations.filter(il =>
              (il.tenantId || 'default-tenant') === activeTenant &&
              String(il.itemId) === String(item.itemId) &&
              String(il.locationId) === String(storeLoc.id)
            ).first();

            if (!mappedLoc) {
              mappedLoc = await db.itemLocations.filter(il =>
                (il.tenantId || 'default-tenant') === activeTenant &&
                String(il.itemId) === String(item.itemId) &&
                ((il as any).code === 'STORE-FRONT' || ((il as any).locationName && (il as any).locationName.toLowerCase().includes('store front')))
              ).first();
            }

            if (mappedLoc && mappedLoc.id) {
              const newLocStock = (mappedLoc.quantity || 0) + item.returnQuantity;
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
                tenantId: activeTenant,
                itemId: String(item.itemId),
                locationId: String(mappedLoc.locationId),
                quantity: newLocStock
              }).catch(() => {});
            } else {
              const newMapId = `map-${item.itemId}-${storeLoc.id}`;
              const newMap = {
                id: newMapId,
                tenantId: activeTenant,
                itemId: String(item.itemId),
                locationId: String(storeLoc.id),
                quantity: item.returnQuantity,
                updatedAt: new Date().toISOString()
              };
              await db.itemLocations.add(newMap as any);
              await syncManager.logMutation('ITEM_LOCATION', newMapId, 'INSERT', newMap);
              saveServerItemLocation({
                tenantId: activeTenant,
                itemId: String(item.itemId),
                locationId: String(storeLoc.id),
                quantity: item.returnQuantity
              }).catch(() => {});
            }
          }
        }
      }

      // 3. Customer Balance & Cash Handling based on refundMode
      if (refundMode === 'CASH_REFUND') {
        // Record Cash Outflow Refund from Cash Drawer
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

        // If customer had pending balance (dues), reduce dues
        if (selectedPartyId !== '') {
          const party = await db.parties.get(Number(selectedPartyId));
          if (party && (party.currentBalance || 0) > 0) {
            const newBal = Math.max(0, (party.currentBalance || 0) - grandTotal);
            await db.parties.update(Number(selectedPartyId), { currentBalance: newBal });
            await syncManager.logMutation('PARTY', String(selectedPartyId), 'UPDATE', { id: selectedPartyId, currentBalance: newBal });
            updateServerParty(Number(selectedPartyId), { currentBalance: newBal }).catch(() => {});
          }
        }
      } else {
        // STORE_CREDIT: Credit to customer account (Advance balance for future shopping)
        if (selectedPartyId !== '') {
          const party = await db.parties.get(Number(selectedPartyId));
          if (party) {
            const currentBal = party.currentBalance || 0;
            const newBal = currentBal - grandTotal;
            await db.parties.update(Number(selectedPartyId), { currentBalance: newBal });
            await syncManager.logMutation('PARTY', String(selectedPartyId), 'UPDATE', { id: selectedPartyId, currentBalance: newBal });
            updateServerParty(Number(selectedPartyId), { currentBalance: newBal }).catch(() => {});
          }
        }
      }

      // 4. Update Sales Invoice dueAmount & paymentStatus in Dexie IndexedDB if applicable
      let targetInvoice: any = null;
      if (invoiceNumber.trim() !== '') {
        targetInvoice = await db.invoices.where('invoiceNumber').equalsIgnoreCase(invoiceNumber.trim()).first();
      }
      if (!targetInvoice && selectedPartyId !== '') {
        const openInvoices = await db.invoices
          .filter(inv => String(inv.partyId) === String(selectedPartyId) && (inv.dueAmount !== undefined ? inv.dueAmount : inv.grandTotal) > 0)
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

        const updatedInvoice = { ...targetInvoice, dueAmount: newDue, paymentStatus: newStatus };
        await syncManager.logMutation('INVOICE', targetInvoice.invoiceId || String(targetInvoice.id), 'UPDATE', updatedInvoice);
      }

      // 5. Log SaleReturn mutation to offline sync journal
      await syncManager.logMutation('SALE_RETURN', uniqueReturnId, 'INSERT', { ...newReturn, refundMode });

      // 6. Try syncing directly to Express/Sequelize PostgreSQL server
      try {
        await createServerSaleReturn({ ...newReturn, refundMode });
      } catch (serverErr) {
        console.warn('Server sync offline for sale return:', serverErr);
      }

      syncManager.triggerSync();

      const successMsg = refundMode === 'CASH_REFUND'
        ? `Credit Note ${creditNoteNumber} saved! Restocked to Store Front & Cash Refund of Rs. ${grandTotal.toFixed(2)} recorded.`
        : `Credit Note ${creditNoteNumber} saved! Restocked to Store Front & Rs. ${grandTotal.toFixed(2)} credited to ${partyName}'s account.`;
      showToast(successMsg, 'success');
      onReturnCreated();
    } catch (err: any) {
      console.error('Error creating sale return:', err);
      showToast(`Failed to create sale return: ${err?.message || err}`, 'error');
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
              <p className="text-xs text-slate-500 font-medium">Record returned goods from customer — Stock restocks to Store Front & customer balance updates</p>
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
          <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-emerald-600" />
              <span>Customer & Return Information</span>
            </div>
            {selectedPartyObj && (
              <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                (selectedPartyObj.currentBalance || 0) > 0
                  ? 'bg-amber-100 text-amber-800'
                  : (selectedPartyObj.currentBalance || 0) < 0
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-emerald-100 text-emerald-800'
              }`}>
                {(selectedPartyObj.currentBalance || 0) > 0 && `🔴 Outstanding Dues: Rs. ${(selectedPartyObj.currentBalance || 0).toFixed(2)}`}
                {(selectedPartyObj.currentBalance || 0) === 0 && '🟢 All Dues Cleared (Rs. 0.00)'}
                {(selectedPartyObj.currentBalance || 0) < 0 && `🔵 Store Credit / Advance: Rs. ${Math.abs(selectedPartyObj.currentBalance || 0).toFixed(2)}`}
              </span>
            )}
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
                {customerParties.map(p => {
                  const bal = p.currentBalance || 0;
                  const balLabel = bal > 0 ? `Dues: Rs ${bal}` : bal < 0 ? `Advance: Rs ${Math.abs(bal)}` : 'Clear (Rs 0)';
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.phone ? `(${p.phone})` : ''} — [{balLabel}]
                    </option>
                  );
                })}
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
              <label className="block font-bold text-slate-700 mb-1">
                Ref Original Invoice (Auto-Populate Items)
              </label>
              {partyInvoices.length > 0 ? (
                <select
                  value={invoiceNumber}
                  onChange={e => handleInvoiceSelect(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="">-- Choose Customer's Past Invoice --</option>
                  {partyInvoices.map(inv => (
                    <option key={inv.invoiceNumber} value={inv.invoiceNumber}>
                      {inv.invoiceNumber} ({inv.invoiceDate}) — Rs {inv.grandTotal} [{inv.paymentStatus}]
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="e.g. INV-6635"
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              )}
            </div>
          </div>

          {/* Refund Settlement Mode Selection */}
          <div className="pt-3 border-t border-slate-100">
            <label className="block font-bold text-slate-700 mb-2 text-xs">
              Return Settlement Method (How is the customer compensated?)
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div 
                onClick={() => setRefundMode('CASH_REFUND')}
                className={`p-3 rounded-xl border-2 cursor-pointer transition flex items-start gap-3 ${
                  refundMode === 'CASH_REFUND'
                    ? 'border-emerald-500 bg-emerald-50/60'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100/70'
                }`}
              >
                <div className={`p-2 rounded-lg ${refundMode === 'CASH_REFUND' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  <Banknote className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                    <span>💵 Immediate Cash Refund</span>
                    {refundMode === 'CASH_REFUND' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Pay the customer cash directly from the cash drawer. Records a cash outflow entry.
                  </p>
                </div>
              </div>

              <div 
                onClick={() => setRefundMode('STORE_CREDIT')}
                className={`p-3 rounded-xl border-2 cursor-pointer transition flex items-start gap-3 ${
                  refundMode === 'STORE_CREDIT'
                    ? 'border-blue-500 bg-blue-50/60'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100/70'
                }`}
              >
                <div className={`p-2 rounded-lg ${refundMode === 'STORE_CREDIT' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                    <span>💳 Store Credit / Khata (Advance Balance)</span>
                    {refundMode === 'STORE_CREDIT' && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    No cash paid. Credits Rs {grandTotal.toFixed(2)} to {partyName || 'Customer'}'s account to deduct from future purchases.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Returned Items Table Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <PackagePlus className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                Returned Items & Store Front Restock
              </span>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1">
                <Store className="w-3 h-3" />
                <span>Restocks Directly to Store Front Shelf</span>
              </span>
            </div>
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
                  <th className="py-2.5 px-3 text-center">Return Qty (+Store Stock)</th>
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

                    <td className="py-2.5 px-3 text-center w-36">
                      <input
                        type="number"
                        min="1"
                        value={item.returnQuantity}
                        onChange={e => handleItemChange(index, 'returnQuantity', e.target.value)}
                        className="w-20 p-2 text-center bg-emerald-50 border border-emerald-300 rounded-lg text-xs font-bold text-emerald-800 font-mono"
                        required
                      />
                    </td>

                    <td className="py-2.5 px-3 text-right w-36">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={e => handleItemChange(index, 'unitPrice', e.target.value)}
                        className="w-24 p-2 text-right bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-semibold text-slate-800"
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
              placeholder="e.g. 1 bread returned by customer. Restocked into store front shelf display."
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
                <span>TOTAL RETURN VALUE:</span>
                <span className="font-mono text-base font-black">Rs. {grandTotal.toFixed(2)}</span>
              </div>
            </div>

            <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-[11px] text-emerald-800 font-bold space-y-1">
              <div>🏪 Store Front on-shelf stock will <strong>INCREASE</strong> by returned quantities</div>
              {refundMode === 'CASH_REFUND' ? (
                <div>💵 Cash Drawer will record <strong>Rs. {grandTotal.toFixed(2)} CASH REFUND OUT</strong></div>
              ) : (
                <div>💳 Customer account will be <strong>CREDITED with Rs. {grandTotal.toFixed(2)} Store Credit / Advance</strong></div>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
