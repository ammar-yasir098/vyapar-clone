import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Package, Users, FileText, ShoppingCart, ArrowRight } from 'lucide-react';
import { Item, Party, Invoice } from '../../types';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: Item[];
  parties: Party[];
  invoices: Invoice[];
  onNavigateTab: (tab: string) => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  items,
  parties,
  invoices,
  onNavigateTab
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const q = query.toLowerCase().trim();

  // Search Results
  const matchedItems = q
    ? items.filter(i => {
        const name = i?.name || '';
        const barcode = i?.barcode || '';
        const sku = i?.skuCode || '';
        return name.toLowerCase().includes(q) || barcode.includes(q) || sku.toLowerCase().includes(q);
      }).slice(0, 4)
    : [];

  const matchedParties = q
    ? parties.filter(p => {
        const name = p?.name || '';
        const phone = p?.phone || '';
        return name.toLowerCase().includes(q) || phone.includes(q);
      }).slice(0, 4)
    : [];

  const matchedInvoices = q
    ? invoices.filter(inv => {
        const invNum = inv?.invoiceNumber || '';
        const partyName = inv?.partyName || '';
        return invNum.toLowerCase().includes(q) || partyName.toLowerCase().includes(q);
      }).slice(0, 4)
    : [];

  const pages = [
    { label: 'POS Billing Counter', tab: 'pos', icon: ShoppingCart },
    { label: 'Items & SKU Stock Manager', tab: 'inventory', icon: Package },
    { label: 'Customers & Suppliers Ledger', tab: 'parties', icon: Users },
    { label: 'Purchase Inward Bills', tab: 'purchase', icon: FileText },
    { label: 'Cash & Bank / General Ledger', tab: 'ledger', icon: FileText },
    { label: 'Sales History & Bills', tab: 'invoices', icon: FileText }
  ].filter(p => !q || p.label.toLowerCase().includes(q));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-start justify-center pt-20 p-4 select-none">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col space-y-0 animate-in fade-in zoom-in-95 duration-100">
        
        {/* Search Bar Input */}
        <div className="p-3.5 border-b border-slate-200 flex items-center gap-3 bg-slate-50">
          <Search className="w-5 h-5 text-blue-600 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type to search items, parties, bills, or pages (Press ESC to close)..."
            className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400 placeholder:font-normal"
          />
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-3 space-y-3">
          {/* Matched Products */}
          {matchedItems.length > 0 && (
            <div>
              <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5 px-2">
                Products & Inventory
              </div>
              <div className="space-y-1">
                {matchedItems.map(item => (
                  <div
                    key={item.id}
                    onClick={() => {
                      onNavigateTab('inventory');
                      onClose();
                    }}
                    className="p-2.5 rounded-xl hover:bg-blue-50 border border-transparent hover:border-blue-200 flex items-center justify-between cursor-pointer transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <Package className="w-4 h-4 text-blue-600" />
                      <div>
                        <div className="font-bold text-xs text-slate-800">{item.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">Barcode: {item.barcode} | Stock: {item.currentStock} {item.unitType}</div>
                      </div>
                    </div>
                    <div className="font-black text-xs text-emerald-600 font-mono">Rs {Number(item.salesPrice || 0).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matched Parties */}
          {matchedParties.length > 0 && (
            <div>
              <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5 px-2">
                Customers & Suppliers
              </div>
              <div className="space-y-1">
                {matchedParties.map(party => (
                  <div
                    key={party.id}
                    onClick={() => {
                      onNavigateTab('parties');
                      onClose();
                    }}
                    className="p-2.5 rounded-xl hover:bg-blue-50 border border-transparent hover:border-blue-200 flex items-center justify-between cursor-pointer transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <Users className="w-4 h-4 text-purple-600" />
                      <div>
                        <div className="font-bold text-xs text-slate-800">{party.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">Ph: {party.phone} | {party.type}</div>
                      </div>
                    </div>
                    <div className="font-mono text-xs font-bold text-slate-700">Bal: Rs {Number(party.currentBalance || 0).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Navigation Pages */}
          <div>
            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5 px-2">
              Quick Page Navigation
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {pages.map((p, idx) => {
                const Icon = p.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      onNavigateTab(p.tab);
                      onClose();
                    }}
                    className="p-2.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl flex items-center justify-between text-xs font-bold text-slate-700 transition cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-blue-600" />
                      <span>{p.label}</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Shortcut Bar */}
        <div className="p-2.5 bg-slate-100 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between font-mono">
          <span>Press ESC to exit search</span>
          <span className="font-bold text-blue-600">Vyapar Global Search</span>
        </div>
      </div>
    </div>
  );
};
