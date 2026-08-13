import React, { useState, useEffect } from 'react';
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
  const [isSaleOpen, setIsSaleOpen] = useState(true);

  // Automatically expand Sale group if active tab is under Sale
  useEffect(() => {
    if (activeTab === 'pos' || activeTab === 'invoices' || activeTab === 'estimates' || activeTab === 'create-estimate') {
      setIsSaleOpen(true);
    }
  }, [activeTab]);

  const isSaleActive = activeTab === 'pos' || activeTab === 'invoices' || activeTab === 'estimates' || activeTab === 'create-estimate';

  const menuGroups = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'parties', label: 'Parties', icon: Users },
    { id: 'inventory', label: 'Items', icon: Package },
    // Sale is rendered separately as an expandable menu
    { id: 'purchase', label: 'Purchase & Expense', icon: ShoppingBag },
    { id: 'ledger', label: 'Cash & Bank', icon: BookOpen },
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
                <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-mono font-bold">Counter</span>
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
            </div>
          )}
        </div>

        {/* Render Remaining Menu Items (Purchase, Cash & Bank, GST, Reports, Printer) */}
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
