import React, { useState } from 'react';
import {
  Home,
  Users,
  Package,
  ShoppingCart,
  BookOpen,
  BarChart3,
  Printer,
  Building2,
  ChevronRight,
  ChevronDown,
  ShoppingBag,
  ShieldCheck,
  Zap
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const SIDEBAR_BG   = '#0b1329';   // Rich midnight dark navy
const ACTIVE_BG    = 'linear-gradient(135deg, rgba(99, 102, 241, 0.22), rgba(139, 92, 246, 0.15))'; // Indigo-violet gradient active
const HOVER_BG     = '#141e38';   // Smooth hover background
const TEXT_NORMAL  = '#94a3b8';   // Default text/icon
const TEXT_ACTIVE  = '#ffffff';   // Active text
const TEXT_HOVER   = '#f1f5f9';   // Hover text

// Top-level nav item
const NavItem: React.FC<{
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  onClick: () => void;
  accentColor?: string;
}> = ({ icon: Icon, label, isActive, onClick, accentColor = '#6366f1' }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer relative group"
      style={{
        background: isActive ? ACTIVE_BG : hovered ? HOVER_BG : 'transparent',
        color: isActive ? TEXT_ACTIVE : hovered ? TEXT_HOVER : TEXT_NORMAL,
        border: isActive ? '1px solid rgba(99, 102, 241, 0.25)' : '1px solid transparent',
      }}
    >
      {/* Accent pill bar on active */}
      {isActive && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full shadow-xs"
          style={{ width: '3.5px', height: '20px', background: accentColor }}
        />
      )}
      <div
        className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
        style={{
          background: isActive ? `${accentColor}25` : 'transparent',
        }}
      >
        <Icon
          style={{
            width: 16, height: 16,
            color: isActive ? accentColor : hovered ? TEXT_HOVER : TEXT_NORMAL,
          }}
        />
      </div>
      <span className="tracking-tight">{label}</span>
    </button>
  );
};

// Expandable group header
const GroupHeader: React.FC<{
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  isOpen: boolean;
  onClick: () => void;
  accentColor?: string;
  badgeCount?: number;
}> = ({ icon: Icon, label, isActive, isOpen, onClick, accentColor = '#6366f1', badgeCount }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer relative group"
      style={{
        background: isActive ? ACTIVE_BG : hovered ? HOVER_BG : 'transparent',
        color: isActive ? TEXT_ACTIVE : hovered ? TEXT_HOVER : TEXT_NORMAL,
        border: isActive ? '1px solid rgba(99, 102, 241, 0.25)' : '1px solid transparent',
      }}
    >
      {isActive && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full shadow-xs"
          style={{ width: '3.5px', height: '20px', background: accentColor }}
        />
      )}
      <div className="flex items-center gap-3">
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
          style={{
            background: isActive ? `${accentColor}25` : 'transparent',
          }}
        >
          <Icon
            style={{
              width: 16, height: 16,
              color: isActive ? accentColor : hovered ? TEXT_HOVER : TEXT_NORMAL,
            }}
          />
        </div>
        <span className="tracking-tight">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {badgeCount !== undefined && badgeCount > 0 && (
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
            {badgeCount}
          </span>
        )}
        <ChevronDown
          style={{
            width: 14, height: 14,
            color: isOpen ? accentColor : '#64748b',
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.22s cubic-bezier(0.16,1,0.3,1)',
            flexShrink: 0,
          }}
        />
      </div>
    </button>
  );
};

// Sub-menu item
const SubItem: React.FC<{
  label: string;
  dotColor: string;
  isActive: boolean;
  onClick: () => void;
  activeColor?: string;
}> = ({ label, dotColor, isActive, onClick, activeColor = '#6366f1' }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-semibold transition-all cursor-pointer"
      style={{
        background: isActive ? activeColor : hovered ? 'rgba(255,255,255,0.07)' : 'transparent',
        color: isActive ? '#ffffff' : hovered ? TEXT_HOVER : TEXT_NORMAL,
      }}
    >
      <span
        style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: isActive ? '#ffffff' : dotColor,
          boxShadow: isActive ? `0 0 8px ${dotColor}` : 'none',
          display: 'inline-block',
        }}
      />
      <span className="truncate">{label}</span>
    </button>
  );
};

// Section divider label
const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="px-3.5 pb-1.5 tracking-wider uppercase font-black"
    style={{
      paddingTop: '18px',
      fontSize: '10px',
      color: '#64748b',
    }}
  >
    {children}
  </div>
);

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [isSaleOpen, setIsSaleOpen] = useState(false);
  const [isPurchaseOpen, setIsPurchaseOpen] = useState(false);
  const [isCashBankOpen, setIsCashBankOpen] = useState(false);

  const isInventoryActive = ['inventory', 'inventory-store', 'inventory-location'].includes(activeTab);
  const isSaleActive      = ['pos','payment-in','estimates','create-estimate','invoices','sale-returns','create-sale-return'].includes(activeTab);
  const isPurchaseActive  = ['purchase','purchase-orders','create-po','payment-out','expenses','purchase-returns','create-purchase-return'].includes(activeTab);
  const isCashBankActive  = ['cash-in-hand','ledger','cash-bank'].includes(activeTab);

  const subMenuStyle: React.CSSProperties = {
    marginLeft: '14px',
    marginTop: '3px',
    marginBottom: '3px',
    padding: '5px',
    borderRadius: '12px',
    background: 'rgba(0,0,0,0.35)',
    borderLeft: '2px solid rgba(255,255,255,0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  };

  return (
    <aside
      className="w-58 flex flex-col shrink-0 select-none shadow-md z-20"
      style={{
        background: SIDEBAR_BG,
        borderRight: '1px solid rgba(255,255,255,0.08)',
        fontFamily: "'Plus Jakarta Sans','Inter',sans-serif",
      }}
    >
      {/* Sidebar Brand Header */}
      <div className="p-3.5 border-b border-white/8 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white flex items-center justify-center font-black shadow-sm">
            <Zap className="w-4 h-4 fill-white" />
          </div>
          <div>
            <div className="text-xs font-black text-white tracking-wider uppercase">Vyapar POS</div>
            <div className="text-[10px] text-slate-400 font-semibold">Offline-First Retail</div>
          </div>
        </div>
        <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
          v2.5
        </span>
      </div>

      {/* Scrollable Nav Items */}
      <div
        className="flex-1 overflow-y-auto sidebar-scroll px-2 py-1 flex flex-col gap-1"
      >
        <SectionLabel>Main Workspace</SectionLabel>

        <NavItem icon={Home}  label="Home Dashboard" isActive={activeTab === 'home'}    onClick={() => setActiveTab('home')} accentColor="#6366f1" />
        <NavItem icon={Users} label="Parties & Directory" isActive={activeTab === 'parties'} onClick={() => setActiveTab('parties')} accentColor="#3b82f6" />

        {/* INVENTORY */}
        <GroupHeader
          icon={Package}
          label="Inventory & Stock"
          isActive={isInventoryActive}
          isOpen={isInventoryOpen}
          onClick={() => setIsInventoryOpen(p => !p)}
          accentColor="#8b5cf6"
        />
        {isInventoryOpen && (
          <div style={subMenuStyle}>
            <SubItem dotColor="#8b5cf6" label="Stock Catalog"      isActive={activeTab === 'inventory'}          onClick={() => setActiveTab('inventory')}          activeColor="#8b5cf6" />
            <SubItem dotColor="#10b981" label="Store Front Stock" isActive={activeTab === 'inventory-store'}    onClick={() => setActiveTab('inventory-store')}    activeColor="#8b5cf6" />
            <SubItem dotColor="#3b82f6" label="Warehouse & Shelf" isActive={activeTab === 'inventory-location'} onClick={() => setActiveTab('inventory-location')} activeColor="#8b5cf6" />
          </div>
        )}

        <SectionLabel>Transactions</SectionLabel>

        {/* SALE */}
        <GroupHeader
          icon={ShoppingCart}
          label="Sale Operations"
          isActive={isSaleActive}
          isOpen={isSaleOpen}
          onClick={() => setIsSaleOpen(p => !p)}
          accentColor="#ef4444"
        />
        {isSaleOpen && (
          <div style={subMenuStyle}>
            <SubItem dotColor="#ef4444" label="POS Checkout"        isActive={activeTab === 'pos'}                                                         onClick={() => setActiveTab('pos')} activeColor="#ef4444" />
            <SubItem dotColor="#10b981" label="Payment-In Receipt"  isActive={activeTab === 'payment-in'}                                                  onClick={() => setActiveTab('payment-in')} activeColor="#ef4444" />
            <SubItem dotColor="#f59e0b" label="Estimate / Quotation" isActive={activeTab === 'estimates' || activeTab === 'create-estimate'}                onClick={() => setActiveTab('estimates')} activeColor="#ef4444" />
            <SubItem dotColor="#64748b" label="Sale Invoices"       isActive={activeTab === 'invoices'}                                                    onClick={() => setActiveTab('invoices')} activeColor="#ef4444" />
            <SubItem dotColor="#10b981" label="Sale Returns (Cr. Note)" isActive={activeTab === 'sale-returns' || activeTab === 'create-sale-return'}     onClick={() => setActiveTab('sale-returns')} activeColor="#ef4444" />
          </div>
        )}

        {/* PURCHASE */}
        <GroupHeader
          icon={ShoppingBag}
          label="Purchase & Expense"
          isActive={isPurchaseActive}
          isOpen={isPurchaseOpen}
          onClick={() => setIsPurchaseOpen(p => !p)}
          accentColor="#3b82f6"
        />
        {isPurchaseOpen && (
          <div style={subMenuStyle}>
            <SubItem dotColor="#3b82f6" label="Purchase Orders"   isActive={activeTab === 'purchase-orders' || activeTab === 'create-po'}                   onClick={() => setActiveTab('purchase-orders')} activeColor="#3b82f6" />
            <SubItem dotColor="#6366f1" label="Purchase Bills"    isActive={activeTab === 'purchase'}                                                       onClick={() => setActiveTab('purchase')} activeColor="#3b82f6" />
            <SubItem dotColor="#f43f5e" label="Payment-Out"       isActive={activeTab === 'payment-out'}                                                    onClick={() => setActiveTab('payment-out')} activeColor="#3b82f6" />
            <SubItem dotColor="#f59e0b" label="Store Expenses"    isActive={activeTab === 'expenses'}                                                       onClick={() => setActiveTab('expenses')} activeColor="#3b82f6" />
            <SubItem dotColor="#ef4444" label="Purchase Returns"  isActive={activeTab === 'purchase-returns' || activeTab === 'create-purchase-return'}      onClick={() => setActiveTab('purchase-returns')} activeColor="#3b82f6" />
          </div>
        )}

        {/* CASH & BANK */}
        <GroupHeader
          icon={BookOpen}
          label="Cash & Ledger"
          isActive={isCashBankActive}
          isOpen={isCashBankOpen}
          onClick={() => setIsCashBankOpen(p => !p)}
          accentColor="#10b981"
        />
        {isCashBankOpen && (
          <div style={subMenuStyle}>
            <SubItem dotColor="#10b981" label="Cash Drawer & Ledger" isActive={activeTab === 'cash-in-hand' || activeTab === 'ledger'} onClick={() => setActiveTab('cash-in-hand')} activeColor="#10b981" />
          </div>
        )}

        <SectionLabel>Analytics & System</SectionLabel>

        <NavItem icon={ShieldCheck} label="GST & E-Way Compliance" isActive={activeTab === 'gst'}      onClick={() => setActiveTab('gst')} accentColor="#8b5cf6" />
        <NavItem icon={BarChart3}   label="Reports & Insights"     isActive={activeTab === 'reports'}   onClick={() => setActiveTab('reports')} accentColor="#f59e0b" />
        <NavItem icon={Printer}     label="Thermal Printer Config" isActive={activeTab === 'settings'}  onClick={() => setActiveTab('settings')} accentColor="#06b6d4" />

        <div style={{ flexGrow: 1, minHeight: 12 }} />
      </div>

      {/* Footer — Settings & Store */}
      <div className="p-2 border-t border-white/8 bg-black/20">
        <button
          type="button"
          onClick={() => setActiveTab('company')}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all cursor-pointer border border-white/6 hover:border-white/15"
          style={{
            background: activeTab === 'company' ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.15))' : 'rgba(255,255,255,0.03)',
            color: activeTab === 'company' ? TEXT_ACTIVE : TEXT_NORMAL,
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-indigo-500/20 border border-indigo-500/30 text-indigo-400"
            >
              <Building2 className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-semibold truncate max-w-[120px]">
              Store & Account Settings
            </span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        </button>
      </div>
    </aside>
  );
};
