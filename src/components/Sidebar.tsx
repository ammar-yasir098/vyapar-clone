import React, { useState } from 'react';
import { 
  Home, 
  Users, 
  Package, 
  ShoppingCart, 
  CreditCard, 
  BookOpen, 
  BarChart3, 
  Printer, 
  Building2, 
  ChevronRight, 
  ChevronDown,
  ShoppingBag,
  ShieldCheck
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const [isSaleOpen, setIsSaleOpen] = useState(false);
  const [isPurchaseOpen, setIsPurchaseOpen] = useState(false);
  const [isCashBankOpen, setIsCashBankOpen] = useState(false);

  const isSaleActive = activeTab === 'pos' || activeTab === 'payment-in' || activeTab === 'estimates' || activeTab === 'create-estimate' || activeTab === 'invoices' || activeTab === 'sale-returns' || activeTab === 'create-sale-return';
  const isPurchaseActive = activeTab === 'purchase' || activeTab === 'purchase-orders' || activeTab === 'create-po' || activeTab === 'payment-out' || activeTab === 'expenses' || activeTab === 'purchase-returns' || activeTab === 'create-purchase-return';
  const isCashBankActive = activeTab === 'cash-in-hand' || activeTab === 'ledger' || activeTab === 'cash-bank';

  const menuGroups = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'parties', label: 'Parties', icon: Users },
    { id: 'inventory', label: 'Items', icon: Package },
    // Sale, Purchase & Expense, and Cash & Bank are rendered separately as expandable menus
    { id: 'gst', label: 'GST & E-Way Bills', icon: ShieldCheck },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'settings', label: 'Thermal Printer', icon: Printer }
  ];

  return (
    <aside className="w-56 bg-[#17172b] text-slate-300 flex flex-col justify-between shrink-0 select-none border-r border-[#2e2e4a]">
      {/* Top Menu List */}
      <div className="py-2 px-2 overflow-y-auto flex-1 space-y-0.5">
        {/* Render Home, Parties, Items first */}
        {menuGroups.slice(0, 3).map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#232342] text-white shadow-sm border-l-4 border-red-500'
                  : 'text-slate-300 hover:bg-[#22223d] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-red-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
            </button>
          );
        })}

        {/* EXPANDABLE SALE MENU */}
        <div className="pt-0.5 pb-0.5">
          <button
            type="button"
            onClick={() => setIsSaleOpen(!isSaleOpen)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              isSaleActive
                ? 'bg-[#232342] text-white shadow-sm border-l-4 border-red-500'
                : 'text-slate-300 hover:bg-[#22223d] hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <ShoppingCart className={`w-4 h-4 ${isSaleActive ? 'text-red-400' : 'text-slate-400'}`} />
              <span>Sale</span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isSaleOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Sub-menu items under Sale */}
          {isSaleOpen && (
            <div className="mt-1 mb-1 pl-3 pr-1 py-1 space-y-1 bg-[#121223]/60 rounded-lg border-l-2 border-slate-700/60 ml-3">
              {/* POS Sub-option */}
              <button
                type="button"
                onClick={() => setActiveTab('pos')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'pos'
                    ? 'bg-red-600 text-white font-bold shadow-xs'
                    : 'text-slate-300 hover:bg-[#22223d] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${activeTab === 'pos' ? 'bg-white' : 'bg-red-400'}`}></div>
                  <span>POS</span>
                </div>
              </button>

              {/* Payment-In Sub-option */}
              <button
                type="button"
                onClick={() => setActiveTab('payment-in')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'payment-in'
                    ? 'bg-red-600 text-white font-bold shadow-xs'
                    : 'text-slate-300 hover:bg-[#22223d] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${activeTab === 'payment-in' ? 'bg-white' : 'bg-emerald-400'}`}></div>
                  <span>Payment-In</span>
                </div>
              </button>

              {/* Estimate / Quotation Sub-option */}
              <button
                type="button"
                onClick={() => setActiveTab('estimates')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'estimates' || activeTab === 'create-estimate'
                    ? 'bg-red-600 text-white font-bold shadow-xs'
                    : 'text-slate-300 hover:bg-[#22223d] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${activeTab === 'estimates' || activeTab === 'create-estimate' ? 'bg-white' : 'bg-amber-400'}`}></div>
                  <span>Estimate / Quotation</span>
                </div>
              </button>

              {/* Sale Invoices Sub-option */}
              <button
                type="button"
                onClick={() => setActiveTab('invoices')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'invoices'
                    ? 'bg-red-600 text-white font-bold shadow-xs'
                    : 'text-slate-300 hover:bg-[#22223d] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${activeTab === 'invoices' ? 'bg-white' : 'bg-slate-400'}`}></div>
                  <span>Sale Invoices</span>
                </div>
              </button>

              {/* Sale Return / Credit Note Sub-option */}
              <button
                type="button"
                onClick={() => setActiveTab('sale-returns')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'sale-returns' || activeTab === 'create-sale-return'
                    ? 'bg-red-600 text-white font-bold shadow-xs'
                    : 'text-slate-300 hover:bg-[#22223d] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${activeTab === 'sale-returns' || activeTab === 'create-sale-return' ? 'bg-white' : 'bg-emerald-400'}`}></div>
                  <span>Sale Return</span>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* EXPANDABLE PURCHASE & EXPENSE MENU */}
        <div className="pt-0.5 pb-0.5">
          <button
            type="button"
            onClick={() => setIsPurchaseOpen(!isPurchaseOpen)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              isPurchaseActive
                ? 'bg-[#232342] text-white shadow-sm border-l-4 border-blue-500'
                : 'text-slate-300 hover:bg-[#22223d] hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <ShoppingBag className={`w-4 h-4 ${isPurchaseActive ? 'text-blue-400' : 'text-slate-400'}`} />
              <span>Purchase & Expense</span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isPurchaseOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Sub-menu items under Purchase & Expense */}
          {isPurchaseOpen && (
            <div className="mt-1 mb-1 pl-3 pr-1 py-1 space-y-1 bg-[#121223]/60 rounded-lg border-l-2 border-slate-700/60 ml-3">
              {/* Purchase Order Sub-option */}
              <button
                type="button"
                onClick={() => setActiveTab('purchase-orders')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'purchase-orders' || activeTab === 'create-po'
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'text-slate-300 hover:bg-[#22223d] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${activeTab === 'purchase-orders' || activeTab === 'create-po' ? 'bg-white' : 'bg-blue-400'}`}></div>
                  <span>Purchase Order</span>
                </div>
              </button>

              {/* Purchase Bills / Inward Sub-option */}
              <button
                type="button"
                onClick={() => setActiveTab('purchase')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'purchase'
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'text-slate-300 hover:bg-[#22223d] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${activeTab === 'purchase' ? 'bg-white' : 'bg-indigo-400'}`}></div>
                  <span>Purchase Bills</span>
                </div>
              </button>

              {/* Payment-Out Sub-option */}
              <button
                type="button"
                onClick={() => setActiveTab('payment-out')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'payment-out'
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'text-slate-300 hover:bg-[#22223d] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${activeTab === 'payment-out' ? 'bg-white' : 'bg-rose-400'}`}></div>
                  <span>Payment-Out</span>
                </div>
              </button>

              {/* Expenses Sub-option */}
              <button
                type="button"
                onClick={() => setActiveTab('expenses')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'expenses'
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'text-slate-300 hover:bg-[#22223d] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${activeTab === 'expenses' ? 'bg-white' : 'bg-amber-400'}`}></div>
                  <span>Expenses</span>
                </div>
              </button>

              {/* Purchase Return / Dr. Note Sub-option */}
              <button
                type="button"
                onClick={() => setActiveTab('purchase-returns')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'purchase-returns' || activeTab === 'create-purchase-return'
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'text-slate-300 hover:bg-[#22223d] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${activeTab === 'purchase-returns' || activeTab === 'create-purchase-return' ? 'bg-white' : 'bg-red-400'}`}></div>
                  <span>Purchase Return</span>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* EXPANDABLE CASH & BANK MENU */}
        <div className="pt-0.5 pb-0.5">
          <button
            type="button"
            onClick={() => setIsCashBankOpen(!isCashBankOpen)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              isCashBankActive
                ? 'bg-[#232342] text-white shadow-sm border-l-4 border-emerald-500'
                : 'text-slate-300 hover:bg-[#22223d] hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <BookOpen className={`w-4 h-4 ${isCashBankActive ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span>Cash & Bank</span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isCashBankOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Sub-menu items under Cash & Bank */}
          {isCashBankOpen && (
            <div className="mt-1 mb-1 pl-3 pr-1 py-1 space-y-1 bg-[#121223]/60 rounded-lg border-l-2 border-slate-700/60 ml-3">
              {/* Cash In Hand Sub-option */}
              <button
                type="button"
                onClick={() => setActiveTab('cash-in-hand')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'cash-in-hand' || activeTab === 'ledger'
                    ? 'bg-emerald-600 text-white font-bold shadow-xs'
                    : 'text-slate-300 hover:bg-[#22223d] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${activeTab === 'cash-in-hand' || activeTab === 'ledger' ? 'bg-white' : 'bg-emerald-400'}`}></div>
                  <span>Cash In Hand</span>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Render Remaining Menu Items (GST, Reports, Printer) */}
        {menuGroups.slice(3).map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#232342] text-white shadow-sm border-l-4 border-red-500'
                  : 'text-slate-300 hover:bg-[#22223d] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-red-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom Company Selector Footer */}
      <div className="p-2 border-t border-[#2e2e4a] bg-[#121223]">
        <button
          type="button"
          onClick={() => setActiveTab('company')}
          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-semibold cursor-pointer transition ${
            activeTab === 'company'
              ? 'bg-[#2b2b4d] text-white border border-sky-400'
              : 'bg-[#1d1d36] text-slate-200 hover:bg-[#252545]'
          }`}
        >
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-400" />
            <span className="truncate w-32">My Company</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>
    </aside>
  );
};
