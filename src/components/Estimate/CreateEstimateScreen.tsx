import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  UserPlus, 
  Trash2, 
  Plus, 
  Minus, 
  Calculator, 
  Printer, 
  FileText, 
  X, 
  ArrowLeft,
  Info,
  CheckCircle2
} from 'lucide-react';
import { Item, Party, BusinessDetails, Estimate } from '../../types';
import { db } from '../../db';
import { saveServerEstimate } from '../../services/api';
import { useToast } from '../Common/ToastContext';

interface CreateEstimateScreenProps {
  items: Item[];
  parties: Party[];
  business: BusinessDetails;
  onEstimateSaved: () => void;
  onCancel: () => void;
}

export const CreateEstimateScreen: React.FC<CreateEstimateScreenProps> = ({
  items,
  parties,
  business,
  onEstimateSaved,
  onCancel
}) => {
  const { showToast } = useToast();
  const activeTenantId = business.tenantId || 'default-tenant';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedParty, setSelectedParty] = useState<Party | null>(
    parties.find(p => p.name === 'Walk-in Retail Customer') || parties[0] || null
  );

  // Invoice line items state
  const [lineItems, setLineItems] = useState<Array<{
    itemId?: number;
    itemName: string;
    hsnSacCode: string;
    unitType: string;
    quantity: number;
    unitPrice: number;
    taxAmount: number;
    totalAmount: number;
  }>>([]);

  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [searchResults, setSearchResults] = useState<Item[]>([]);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Handle Search input change
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    const term = searchTerm.toLowerCase().trim();
    const matches = items.filter(item => 
      item.name.toLowerCase().includes(term) ||
      (item.barcode && item.barcode.includes(term)) ||
      (item.skuCode && item.skuCode.toLowerCase().includes(term))
    );

    setSearchResults(matches);
  }, [searchTerm, items]);

  const handleAddItemToInvoice = (item: Item) => {
    setLineItems(prev => {
      const existingIdx = prev.findIndex(l => l.itemId === item.id || l.itemName === item.name);
      if (existingIdx >= 0) {
        const next = [...prev];
        const currentQty = next[existingIdx].quantity + 1;
        next[existingIdx] = {
          ...next[existingIdx],
          quantity: currentQty,
          totalAmount: currentQty * next[existingIdx].unitPrice
        };
        return next;
      }

      return [
        ...prev,
        {
          itemId: item.id,
          itemName: item.name,
          hsnSacCode: item.hsnSacCode || '1000',
          unitType: item.unitType || 'PCS',
          quantity: 1,
          unitPrice: item.salesPrice || 0,
          taxAmount: 0,
          totalAmount: item.salesPrice || 0
        }
      ];
    });

    setSearchTerm('');
    setSearchResults([]);
  };

  const handleUpdateQuantity = (index: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveLineItem(index);
      return;
    }
    setLineItems(prev => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        quantity: newQty,
        totalAmount: newQty * next[index].unitPrice
      };
      return next;
    });
  };

  const handleUpdatePrice = (index: number, newPrice: number) => {
    setLineItems(prev => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        unitPrice: newPrice,
        totalAmount: next[index].quantity * newPrice
      };
      return next;
    });
  };

  const handleRemoveLineItem = (index: number) => {
    setLineItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // Calculations
  const subtotal = lineItems.reduce((acc, item) => acc + item.totalAmount, 0);
  const grandTotal = Math.max(0, subtotal - discountAmount);

  // Save Estimate (Strictly NO Stock Reduction & NO Ledger Entry)
  const handleSaveEstimate = async () => {
    if (lineItems.length === 0) {
      alert('Please add at least one product to create a quotation');
      return;
    }

    setIsSaving(true);

    const estId = `EST-${Date.now()}`;
    const estNum = `EST-${Math.floor(1000 + Math.random() * 9000)}`;
    const today = new Date().toISOString().split('T')[0];

    const newEstimate: Estimate = {
      estimateId: estId,
      tenantId: activeTenantId,
      estimateNumber: estNum,
      estimateDate: today,
      partyId: selectedParty?.id,
      partyName: selectedParty?.name || 'Walk-in Customer',
      partyPhone: selectedParty?.phone || '',
      partyGstin: selectedParty?.gstin || '',
      subtotal,
      taxTotal: 0,
      discountTotal: discountAmount,
      grandTotal,
      status: 'OPEN',
      items: lineItems.map(item => ({
        itemId: item.itemId,
        itemName: item.itemName,
        hsnSacCode: item.hsnSacCode,
        unitType: item.unitType,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxAmount: 0,
        totalAmount: item.totalAmount
      }))
    };

    try {
      // 1. Save to local Dexie IndexedDB (estimates table)
      await db.estimates.add(newEstimate);

      // 2. Push to PostgreSQL Server API
      await saveServerEstimate(newEstimate);

      setIsSaving(false);
      showToast(`Quotation ${newEstimate.estimateNumber} saved successfully!`, 'success');
      // Return back to Estimate List Screen
      onEstimateSaved();
    } catch (err) {
      console.error('Error saving estimate:', err);
      setIsSaving(false);
      onEstimateSaved();
    }
  };

  return (
    <div className="flex-1 bg-[#f0f4f8] p-4 flex flex-col justify-between overflow-hidden select-none">
      {/* Top Banner & Header */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
            title="Back to Estimate List"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-slate-800 text-base">New Estimate / Quotation</span>
              <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Quotation Mode
              </span>
            </div>
            <p className="text-xs text-amber-700 font-semibold flex items-center gap-1 mt-0.5">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>Items added to this estimate will NOT deduct inventory stock or affect cash balances.</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveEstimate}
            disabled={isSaving || lineItems.length === 0}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            {isSaving ? 'Saving Quotation...' : 'Save Quotation [F8]'}
          </button>
        </div>
      </div>

      {/* Main Billing Grid Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 overflow-hidden">
        {/* Left 2-Columns: Product Search & Line Items Table */}
        <div className="lg:col-span-2 flex flex-col space-y-4 overflow-hidden">
          {/* Top Controls: Search Bar & Customer Selector */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 gap-3 relative">
            {/* Product Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Scan Barcode or Type Product Name..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-amber-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />

              {/* Search Results Dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-12 bg-white rounded-xl shadow-xl border border-slate-200 max-h-60 overflow-y-auto z-50 py-1">
                  {searchResults.map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleAddItemToInvoice(item)}
                      className="w-full px-3 py-2 text-left hover:bg-amber-50 flex items-center justify-between text-xs border-b border-slate-100 last:border-0 cursor-pointer"
                    >
                      <div>
                        <div className="font-bold text-slate-800">{item.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">SKU: {item.skuCode || 'N/A'}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-slate-900">Rs. {item.salesPrice}</div>
                        <div className="text-[10px] text-slate-500 font-medium">In Stock: {item.currentStock}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Customer Selector */}
            <div>
              <select
                value={selectedParty?.id || ''}
                onChange={e => {
                  const p = parties.find(party => party.id === Number(e.target.value));
                  if (p) setSelectedParty(p);
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
              >
                {parties.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.phone || 'Customer'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 grid grid-cols-12 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
              <div className="col-span-1">#</div>
              <div className="col-span-5">Item Description</div>
              <div className="col-span-2 text-center">Qty</div>
              <div className="col-span-2 text-right">Unit Price</div>
              <div className="col-span-2 text-right">Total</div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
              {lineItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                  <Calculator className="w-10 h-10 mb-2 opacity-30" />
                  <div className="text-sm font-bold text-slate-600">No items added to estimate</div>
                  <p className="text-xs text-slate-400 max-w-xs mt-1">
                    Search product name or scan barcode above to add items to this quotation.
                  </p>
                </div>
              ) : (
                lineItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 items-center py-2 px-2 hover:bg-slate-50 text-xs rounded-lg">
                    <div className="col-span-1 font-bold text-slate-400">{idx + 1}</div>
                    <div className="col-span-5">
                      <div className="font-bold text-slate-800">{item.itemName}</div>
                      <div className="text-[10px] text-slate-400">HSN: {item.hsnSacCode}</div>
                    </div>
                    <div className="col-span-2 flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleUpdateQuantity(idx, item.quantity - 1)}
                        className="w-6 h-6 rounded bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-bold w-6 text-center">{item.quantity}</span>
                      <button
                        onClick={() => handleUpdateQuantity(idx, item.quantity + 1)}
                        className="w-6 h-6 rounded bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="col-span-2 text-right">
                      <input
                        type="number"
                        value={item.unitPrice}
                        onChange={e => handleUpdatePrice(idx, Number(e.target.value))}
                        className="w-20 px-1 py-0.5 text-right bg-slate-50 border border-slate-200 rounded text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                    <div className="col-span-2 text-right font-black text-slate-900 flex items-center justify-end gap-2">
                      <span>Rs. {item.totalAmount}</span>
                      <button
                        onClick={() => handleRemoveLineItem(idx)}
                        className="text-slate-400 hover:text-red-500 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right 1-Column: Summary & Action Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="font-extrabold text-slate-800 text-sm">Quotation Summary</h2>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {lineItems.length} Item(s)
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between text-slate-600 font-medium">
                <span>Subtotal:</span>
                <span className="font-bold text-slate-800">Rs. {subtotal.toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-center text-slate-600 font-medium">
                <span>Discount (Rs):</span>
                <input
                  type="number"
                  value={discountAmount}
                  onChange={e => setDiscountAmount(Number(e.target.value))}
                  className="w-24 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-right font-semibold text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
                <span className="font-black text-slate-900 text-sm">Quoted Grand Total:</span>
                <span className="font-black text-emerald-600 text-lg">
                  Rs. {grandTotal.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-amber-800 text-[11px] space-y-1">
              <div className="font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                <span>Quotation Note</span>
              </div>
              <p className="text-amber-700">
                This document is a price estimate for client reference only. No stock is deducted from your inventory.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={handleSaveEstimate}
              disabled={isSaving || lineItems.length === 0}
              className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-sm rounded-xl shadow-md transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4" />
              <span>{isSaving ? 'Saving Quotation...' : 'Save & View Quotation [F8]'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
