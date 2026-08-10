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
  Crown, 
  Building2, 
  ChevronRight, 
  Plus,
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
    { id: 'parties', label: 'Parties', icon: Users, hasPlus: true },
    { id: 'inventory', label: 'Items', icon: Package, hasPlus: true },
    { id: 'pos', label: 'Sale (POS)', icon: ShoppingCart, badge: 'F2' },
    { id: 'purchase', label: 'Purchase & Expense', icon: ShoppingBag, hasPlus: true },
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

              {item.hasPlus && (
                <Plus className="w-3.5 h-3.5 text-slate-500 hover:text-white" />
              )}

              {item.badge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-[#2e2e4a] text-amber-400">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Upgrade Badge & Company Selector */}
      <div className="p-2 space-y-2 border-t border-[#2e2e4a] bg-[#121223]">
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-2.5 rounded-xl text-slate-900 shadow-md space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-extrabold">
            <Crown className="w-4 h-4 text-slate-900" />
            <span>Get Vyapar Premium</span>
          </div>
          <p className="text-[10px] font-semibold opacity-90 leading-tight">
            Unlimited Sync, E-Invoicing & WhatsApp Receipts
          </p>
        </div>

        <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#1d1d36] text-xs font-semibold text-slate-200 cursor-pointer">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-400" />
            <span className="truncate w-32">My Company</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        </div>
      </div>
    </aside>
  );
};
