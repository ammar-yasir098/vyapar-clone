import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Plus, 
  Trash2, 
  Printer, 
  User, 
  Check, 
  Barcode, 
  CreditCard, 
  RotateCcw,
  Share2,
  FileText,
  Sparkles,
  Zap,
  Tag
} from 'lucide-react';
import { Item, Party, InvoiceItem, Invoice, PaymentMethod, BusinessDetails } from '../../types';
import { db } from '../../db';
import { postInvoiceJournalEntry } from '../../services/ledger';
import { printA4TaxInvoice, buildWhatsAppInvoiceLink } from '../../services/pdfInvoice';
import { createServerInvoice } from '../../services/api';

interface BillingScreenProps {
  items: Item[];
  parties: Party[];
  business: BusinessDetails;
  onInvoiceCreated: (invoice: Invoice) => void;
}

export const BillingScreen: React.FC<BillingScreenProps> = ({
  items,
  parties,
  business,
  onInvoiceCreated
}) => {
  const [cartItems, setCartItems] = useState<InvoiceItem[]>([]);
  const [selectedParty, setSelectedParty] = useState<Party | null>(
    parties.find(p => (p?.name || '').includes('Walk-in')) || parties[0] || null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [discountTotal, setDiscountTotal] = useState<number>(0);
  const [receivedAmount, setReceivedAmount] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${Date.now().toString().slice(-4)}`);
  const [showAddPartyModal, setShowAddPartyModal] = useState(false);
  const [newPartyName, setNewPartyName] = useState('');
  const [newPartyPhone, setNewPartyPhone] = useState('');

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  // Keyboard Shortcuts: F2 (New), F4 (Barcode), F8 (Save)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        handleResetBill();
      } else if (e.key === 'F4') {
        e.preventDefault();
        barcodeInputRef.current?.focus();
      } else if (e.key === 'F8') {
        e.preventDefault();
        if (cartItems.length > 0) handleSaveAndPrint();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cartItems, selectedParty, discountTotal, receivedAmount, paymentMethod]);

  const filteredItems = items.filter(item => {
    const name = item?.name || '';
    const barcode = item?.barcode || '';
    const sku = item?.skuCode || '';
    return (
      name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      barcode.includes(searchQuery) ||
      sku.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const handleAddItemToCart = (item: Item) => {
    const existingIndex = cartItems.findIndex(i => i.itemId === item.id);
    if (existingIndex > -1) {
      const updated = [...cartItems];
      const newQty = updated[existingIndex].quantity + 1;
      const sub = newQty * updated[existingIndex].unitPrice;
      const tax = (sub * (updated[existingIndex].cgstRate + updated[existingIndex].sgstRate)) / 100;
      
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: newQty,
        taxAmount: tax,
        totalAmount: sub + tax
      };
      setCartItems(updated);
    } else {
      const sub = item.salesPrice;
      const tax = (sub * (item.cgstRate + item.sgstRate)) / 100;
      
      const newItem: InvoiceItem = {
        itemId: item.id!,
        itemName: item.name,
        hsnSacCode: item.hsnSacCode,
        unitType: item.unitType,
        quantity: 1,
        unitPrice: item.salesPrice,
        purchasePrice: item.purchasePrice,
        cgstRate: item.cgstRate,
        sgstRate: item.sgstRate,
        igstRate: item.igstRate,
        taxAmount: tax,
        totalAmount: sub + tax
      };
      setCartItems([...cartItems, newItem]);
    }
    setSearchQuery('');
    barcodeInputRef.current?.focus();
  };

  const updateQuantity = (itemId: number, delta: number) => {
    setCartItems(prev =>
      prev
        .map(item => {
          if (item.itemId === itemId) {
            const newQty = Math.max(1, item.quantity + delta);
            const sub = newQty * item.unitPrice;
            const tax = (sub * (item.cgstRate + item.sgstRate)) / 100;
            return { ...item, quantity: newQty, taxAmount: tax, totalAmount: sub + tax };
          }
          return item;
        })
        .filter(item => item.quantity > 0)
    );
  };

  const updatePrice = (itemId: number, newPrice: number) => {
    setCartItems(prev =>
      prev.map(item => {
        if (item.itemId === itemId) {
          const sub = item.quantity * newPrice;
          const tax = (sub * (item.cgstRate + item.sgstRate)) / 100;
          return { ...item, unitPrice: newPrice, taxAmount: tax, totalAmount: sub + tax };
        }
        return item;
      })
    );
  };

  const removeItem = (itemId: number) => {
    setCartItems(prev => prev.filter(i => i.itemId !== itemId));
  };

  const handleResetBill = () => {
    setCartItems([]);
    setDiscountTotal(0);
    setReceivedAmount('');
    setNotes('');
    setInvoiceNumber(`INV-${Date.now().toString().slice(-4)}`);
  };

  // Quick Preset Discount helper
  const applyPresetDiscount = (percent: number) => {
    const rawSubtotal = cartItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const disc = (rawSubtotal * percent) / 100;
    setDiscountTotal(disc);
  };

  // Create Quick Party directly from POS
  const handleQuickAddParty = async () => {
    if (!newPartyName || !newPartyPhone) return;
    const partyId = await db.parties.add({
      tenantId: 'default-tenant',
      name: newPartyName,
      phone: newPartyPhone,
      type: 'CUSTOMER',
      openingBalance: 0,
      balanceType: 'RECEIVABLE',
      currentBalance: 0,
      createdAt: new Date().toISOString()
    });
    const created = await db.parties.get(partyId);
    if (created) setSelectedParty(created);
    setShowAddPartyModal(false);
    setNewPartyName('');
    setNewPartyPhone('');
  };

  // Calculate Subtotals & Totals
  const subtotal = cartItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxTotal = cartItems.reduce((sum, item) => sum + item.taxAmount, 0);
  const rawGrandTotal = Math.max(0, subtotal + taxTotal - discountTotal);
  const grandTotal = Math.round(rawGrandTotal);

  const recAmtNum = parseFloat(receivedAmount) || 0;
  const changeToReturn = Math.max(0, recAmtNum - grandTotal);
  const dueAmount = paymentMethod === 'CREDIT' ? grandTotal : Math.max(0, grandTotal - recAmtNum);
  const paymentStatus = dueAmount === 0 ? 'PAID' : dueAmount === grandTotal ? 'UNPAID' : 'PARTIAL';

  const handleSaveAndPrint = async () => {
    if (cartItems.length === 0) return;

    const newInvoice: Invoice = {
      invoiceId: `inv-${Date.now()}`,
      tenantId: 'default-tenant',
      partyId: selectedParty?.id,
      partyName: selectedParty ? selectedParty.name : 'Walk-in Retail Customer',
      partyPhone: selectedParty ? selectedParty.phone : '03009999999',
      partyGstin: selectedParty?.gstin,
      invoiceNumber,
      invoiceDate: new Date().toISOString().split('T')[0],
      items: cartItems,
      subtotal,
      cgstTotal: taxTotal / 2,
      sgstTotal: taxTotal / 2,
      igstTotal: 0,
      taxTotal,
      discountTotal,
      grandTotal,
      receivedAmount: paymentMethod === 'CREDIT' ? 0 : recAmtNum || grandTotal,
      dueAmount,
      paymentStatus,
      paymentMethod,
      notes,
      createdAt: new Date().toISOString(),
      syncStatus: 'PENDING'
    };

    // 1. Save to local Dexie IndexedDB
    const savedId = await db.invoices.add(newInvoice);
    newInvoice.id = savedId;

    // 2. Decrement Item stock levels in local DB
    for (const cItem of cartItems) {
      const dbItem = await db.items.get(cItem.itemId);
      if (dbItem) {
        const newStock = Math.max(0, dbItem.currentStock - cItem.quantity);
        await db.items.update(cItem.itemId, { currentStock: newStock, updatedAt: new Date().toISOString() });
      }
    }

    // 3. Post Double-Entry Journal Entry
    await postInvoiceJournalEntry(newInvoice);

    // 4. Send to PostgreSQL backend REST API asynchronously
    createServerInvoice(newInvoice);

    // 5. Trigger Thermal Print
    onInvoiceCreated(newInvoice);

    handleResetBill();
  };

  return (
    <div className="flex-1 flex flex-col bg-[#f3f4f6] overflow-hidden select-none">
      {/* Top POS Action Toolbar */}
      <div className="bg-white border-b border-slate-200 p-3 px-5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-4 flex-1 max-w-2xl">
          {/* Barcode Search Bar */}
          <div className="relative flex-1">
            <input
              ref={barcodeInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Scan Barcode (F4) or Type Product Name..."
              className="w-full h-9 pl-9 pr-4 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-blue-600 focus:bg-white shadow-xs transition"
            />
            <Barcode className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />

            {/* Instant Product Suggestions Dropdown */}
            {searchQuery.trim() !== '' && (
              <div className="absolute top-11 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto divide-y divide-slate-100">
                {filteredItems.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-400">No products found matching query</div>
                ) : (
                  filteredItems.map(item => (
                    <div
                      key={item.id}
                      onClick={() => handleAddItemToCart(item)}
                      className="p-2.5 hover:bg-blue-50/80 flex items-center justify-between cursor-pointer transition"
                    >
                      <div>
                        <div className="font-bold text-xs text-slate-900">{item.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">Barcode: {item.barcode} | SKU: {item.skuCode}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-extrabold text-xs text-emerald-600 font-mono">Rs {item.salesPrice.toFixed(2)}</div>
                        <div className={`text-[10px] font-bold ${item.currentStock <= item.minStockAlert ? 'text-amber-600' : 'text-slate-500'}`}>
                          Stock: {item.currentStock} {item.unitType}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Party Selector */}
          <div className="flex items-center gap-1.5 w-64">
            <select
              value={selectedParty?.id || ''}
              onChange={e => {
                const found = parties.find(p => p.id === Number(e.target.value));
                if (found) setSelectedParty(found);
              }}
              className="flex-1 h-9 bg-slate-50 border border-slate-300 rounded-lg px-2 text-xs font-bold text-slate-800 outline-none"
            >
              {parties.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.phone})
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowAddPartyModal(true)}
              className="h-9 w-9 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 rounded-lg flex items-center justify-center cursor-pointer shrink-0"
              title="Add New Customer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <span className="font-bold text-slate-500">Invoice:</span>
          <span className="font-extrabold text-blue-600 bg-blue-50 px-2.5 py-1 rounded border border-blue-200">{invoiceNumber}</span>
        </div>
      </div>

      {/* Main Billing Table & Summary Drawer */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Line Items Grid */}
        <div className="flex-1 flex flex-col p-4 overflow-hidden gap-3">
          <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs flex flex-col">
            <div className="flex-1 overflow-auto">
              <table className="vyapar-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>#</th>
                    <th>Item Description</th>
                    <th style={{ width: '90px' }}>HSN</th>
                    <th style={{ width: '130px' }}>Qty / Unit</th>
                    <th style={{ width: '110px' }}>Unit Price (Rs)</th>
                    <th style={{ width: '80px' }}>Tax Rate</th>
                    <th style={{ width: '90px' }}>Tax (Rs)</th>
                    <th style={{ width: '120px' }} className="text-right">Total (Rs)</th>
                    <th style={{ width: '50px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {cartItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-20 text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                          <Barcode className="w-12 h-12 text-slate-300 stroke-1" />
                          <p className="text-sm font-bold text-slate-700">No products added to current invoice</p>
                          <p className="text-xs text-slate-500">Scan barcode above or press F4 to search inventory</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    cartItems.map((item, index) => (
                      <tr key={item.itemId}>
                        <td className="font-mono text-slate-400 text-xs">{index + 1}</td>
                        <td>
                          <div className="font-bold text-slate-800 text-xs">{item.itemName}</div>
                        </td>
                        <td className="font-mono text-xs text-slate-500">{item.hsnSacCode}</td>
                        <td>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => updateQuantity(item.itemId, -1)}
                              className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center border border-slate-300 cursor-pointer"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={e => {
                                const val = parseInt(e.target.value) || 1;
                                updateQuantity(item.itemId, val - item.quantity);
                              }}
                              className="w-12 text-center bg-slate-50 border border-slate-300 rounded text-xs text-slate-900 font-bold py-0.5"
                            />
                            <button
                              onClick={() => updateQuantity(item.itemId, 1)}
                              className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center border border-slate-300 cursor-pointer"
                            >
                              +
                            </button>
                            <span className="text-[10px] text-slate-500 font-bold">{item.unitType}</span>
                          </div>
                        </td>
                        <td>
                          <input
                            type="number"
                            value={item.unitPrice}
                            onChange={e => updatePrice(item.itemId, parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 text-xs text-slate-900 font-mono font-bold"
                          />
                        </td>
                        <td className="font-mono text-xs text-slate-500">
                          {item.cgstRate + item.sgstRate}%
                        </td>
                        <td className="font-mono text-xs text-slate-600">
                          Rs {item.taxAmount.toFixed(2)}
                        </td>
                        <td className="font-mono text-xs font-black text-emerald-600 text-right">
                          Rs {item.totalAmount.toFixed(2)}
                        </td>
                        <td className="text-center">
                          <button
                            onClick={() => removeItem(item.itemId)}
                            className="text-slate-400 hover:text-red-500 transition cursor-pointer"
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

        {/* Right Drawer Summary Panel */}
        <div className="w-84 bg-white border-l border-slate-200 flex flex-col p-4 shrink-0 justify-between shadow-xs space-y-3 overflow-y-auto">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h2 className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-blue-600" />
                <span>Checkout Summary</span>
              </h2>
              <button
                onClick={handleResetBill}
                className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 font-semibold cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>

            {/* Quick Preset Discount Pills */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase flex items-center gap-1">
                <Tag className="w-3 h-3 text-amber-500" />
                <span>Quick Discount Presets</span>
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[5, 10, 15].map(pct => (
                  <button
                    key={pct}
                    onClick={() => applyPresetDiscount(pct)}
                    className="py-1 px-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-[11px] font-bold cursor-pointer transition"
                  >
                    {pct}% Off
                  </button>
                ))}
                <button
                  onClick={() => setDiscountTotal(0)}
                  className="py-1 px-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[11px] font-bold cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Totals Breakdown */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600 font-semibold">
                <span>Subtotal ({cartItems.length} items):</span>
                <span className="font-mono text-slate-900 font-bold">Rs {subtotal.toFixed(2)}</span>
              </div>
              
              <div className="flex justify-between text-slate-600 font-semibold">
                <span>Sales Tax Total:</span>
                <span className="font-mono text-slate-800">Rs {taxTotal.toFixed(2)}</span>
              </div>

              {/* Discount Field */}
              <div className="flex items-center justify-between pt-1.5 border-t border-slate-200">
                <span className="text-slate-700 font-bold">Discount (Rs):</span>
                <input
                  type="number"
                  value={discountTotal || ''}
                  onChange={e => setDiscountTotal(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-24 text-right bg-white border border-slate-300 rounded px-2 py-0.5 text-xs text-rose-600 font-mono font-bold"
                />
              </div>

              {/* Net Grand Total */}
              <div className="flex justify-between items-center pt-2.5 border-t-2 border-slate-300 text-sm">
                <span className="font-black text-slate-900">NET GRAND TOTAL:</span>
                <span className="font-mono font-black text-emerald-600 text-lg">
                  Rs {grandTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div>
              <label className="text-[10px] font-extrabold text-slate-500 uppercase block mb-1">
                Payment Method
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['CASH', 'UPI', 'CARD', 'CREDIT'] as PaymentMethod[]).map(method => (
                  <button
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className={`py-2 px-2 rounded-lg font-extrabold text-xs border transition flex items-center justify-center cursor-pointer ${
                      paymentMethod === method
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {method === 'UPI' ? 'DIGITAL / APP' : method === 'CREDIT' ? 'PARTY CREDIT' : method}
                  </button>
                ))}
              </div>
            </div>

            {/* Cash Quick Tender Notes & Change Calculator */}
            {paymentMethod === 'CASH' && (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">Amount Received:</label>
                  <input
                    type="number"
                    value={receivedAmount}
                    onChange={e => setReceivedAmount(e.target.value)}
                    placeholder={`Rs ${grandTotal.toFixed(0)}`}
                    className="w-28 text-right bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-900 font-mono font-bold"
                  />
                </div>

                {/* Quick Tender Note Buttons */}
                <div className="grid grid-cols-3 gap-1 pt-1">
                  {[500, 1000, 5000].map(note => (
                    <button
                      key={note}
                      onClick={() => setReceivedAmount(note.toString())}
                      className="py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-[10px] font-mono font-bold text-slate-700 cursor-pointer"
                    >
                      Rs {note}
                    </button>
                  ))}
                </div>

                {recAmtNum > 0 && recAmtNum >= grandTotal && (
                  <div className="flex justify-between items-center text-xs font-bold text-emerald-600 pt-2 border-t border-slate-200">
                    <span>Change to Return:</span>
                    <span className="font-mono text-sm font-black">Rs {changeToReturn.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleSaveAndPrint}
            disabled={cartItems.length === 0}
            className="btn-vyapar-red w-full py-3.5 text-xs font-extrabold flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>SAVE & PRINT RECEIPT [F8]</span>
          </button>
        </div>
      </div>

      {/* Bottom Hotkey Helper Legend */}
      <div className="bg-slate-900 text-slate-300 p-2 px-5 text-xs font-mono flex items-center justify-between border-t border-slate-800">
        <div className="flex items-center gap-4">
          <span><strong className="text-amber-400 font-extrabold">F2:</strong> New Bill</span>
          <span><strong className="text-amber-400 font-extrabold">F4:</strong> Barcode Search</span>
          <span><strong className="text-amber-400 font-extrabold">F8:</strong> Save & Print Receipt</span>
          <span><strong className="text-amber-400 font-extrabold">Ctrl+F:</strong> Global Search</span>
        </div>
        <div className="text-slate-400 font-bold">Vyapar High-Speed POS Counter</div>
      </div>

      {/* Inline Quick Add Party Modal */}
      {showAddPartyModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white p-5 rounded-2xl w-full max-w-sm space-y-4 shadow-2xl border border-slate-200">
            <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
              <User className="w-4 h-4 text-blue-600" />
              <span>Add Quick Customer</span>
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Customer Name *</label>
                <input
                  type="text"
                  value={newPartyName}
                  onChange={e => setNewPartyName(e.target.value)}
                  placeholder="e.g. Usman Ali"
                  className="input-field text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Phone Number *</label>
                <input
                  type="text"
                  value={newPartyPhone}
                  onChange={e => setNewPartyPhone(e.target.value)}
                  placeholder="03001234567"
                  className="input-field text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setShowAddPartyModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleQuickAddParty}
                className="btn-vyapar-blue text-xs font-bold"
              >
                Save & Select Customer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
