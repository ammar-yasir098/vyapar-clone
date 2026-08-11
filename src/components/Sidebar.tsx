import React from 'react';
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
  ShoppingBag,
  ShieldCheck
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const menuGroups = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'parties', label: 'Parties', icon: Users },
    { id: 'inventory', label: 'Items', icon: Package },
    { id: 'pos', label: 'Sale (POS)', icon: ShoppingCart },
    { id: 'purchase', label: 'Purchase & Expense', icon: ShoppingBag },
    { id: 'ledger', label: 'Cash & Bank', icon: BookOpen },
    { id: 'invoices', label: 'Sales History', icon: CreditCard },
    { id: 'gst', label: 'GST & E-Way Bills', icon: ShieldCheck },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'settings', label: 'Thermal Printer', icon: Printer }
  ];

  return (
    <aside className="w-56 bg-[#17172b] text-slate-300 flex flex-col justify-between shrink-0 select-none border-r border-[#2e2e4a]">
      {/* Top Menu List */}
      <div className="py-2 px-2 overflow-y-auto flex-1 space-y-0.5">
        {menuGroups.map((item) => {
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
