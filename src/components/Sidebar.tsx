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
  ShieldCheck
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const SIDEBAR_BG   = '#111827';   // rich dark navy
const ACTIVE_BG    = '#1f2d3d';   // slightly lighter active bg
const HOVER_BG     = '#1a2535';   // hover background
const TEXT_NORMAL  = '#9ca3af';   // default text/icon
const TEXT_ACTIVE  = '#ffffff';   // active text
const TEXT_HOVER   = '#e2e8f0';   // hover text

// Top-level nav item
const NavItem: React.FC<{
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  onClick: () => void;
  accentColor?: string;
}> = ({ icon: Icon, label, isActive, onClick, accentColor = '#e53e3e' }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all cursor-pointer relative"
      style={{
        background: isActive ? ACTIVE_BG : hovered ? HOVER_BG : 'transparent',
        color: isActive ? TEXT_ACTIVE : hovered ? TEXT_HOVER : TEXT_NORMAL,
        fontWeight: isActive ? 600 : 500,
      }}
    >
      {/* Accent bar on active */}
      {isActive && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
          style={{ width: '3px', height: '18px', background: accentColor }}
        />
      )}
      <Icon
        style={{
          width: 16, height: 16, flexShrink: 0,
          color: isActive ? accentColor : hovered ? TEXT_HOVER : TEXT_NORMAL,
        }}
      />
      <span style={{ letterSpacing: '-0.1px' }}>{label}</span>
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
}> = ({ icon: Icon, label, isActive, isOpen, onClick, accentColor = '#e53e3e' }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] transition-all cursor-pointer relative"
      style={{
        background: isActive ? ACTIVE_BG : hovered ? HOVER_BG : 'transparent',
        color: isActive ? TEXT_ACTIVE : hovered ? TEXT_HOVER : TEXT_NORMAL,
        fontWeight: isActive ? 600 : 500,
      }}
    >
      {isActive && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
          style={{ width: '3px', height: '18px', background: accentColor }}
        />
      )}
      <div className="flex items-center gap-3">
        <Icon
          style={{
            width: 16, height: 16, flexShrink: 0,
            color: isActive ? accentColor : hovered ? TEXT_HOVER : TEXT_NORMAL,
          }}
        />
        <span style={{ letterSpacing: '-0.1px' }}>{label}</span>
      </div>
      <ChevronDown
        style={{
          width: 14, height: 14,
          color: '#475569',
          transform: isOpen ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s',
          flexShrink: 0,
        }}
      />
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
}> = ({ label, dotColor, isActive, onClick, activeColor = '#e53e3e' }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] transition-all cursor-pointer"
      style={{
        background: isActive ? activeColor : hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
        color: isActive ? '#fff' : hovered ? TEXT_HOVER : TEXT_NORMAL,
        fontWeight: isActive ? 700 : 500,
      }}
    >
      <span
        style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: isActive ? 'rgba(255,255,255,0.8)' : dotColor,
          display: 'inline-block',
        }}
      />
      {label}
    </button>
  );
};

// Section divider label
const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="px-3 pb-1.5"
    style={{
      paddingTop: '20px',
      fontSize: '10.5px',
      fontWeight: 800,
      textTransform: 'uppercase',
      letterSpacing: '0.12em',
      color: '#94a3b8',
    }}
  >
    {children}
  </div>
);

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const [isSaleOpen, setIsSaleOpen] = useState(false);
  const [isPurchaseOpen, setIsPurchaseOpen] = useState(false);
  const [isCashBankOpen, setIsCashBankOpen] = useState(false);

  const isSaleActive     = ['pos','payment-in','estimates','create-estimate','invoices','sale-returns','create-sale-return'].includes(activeTab);
  const isPurchaseActive = ['purchase','purchase-orders','create-po','payment-out','expenses','purchase-returns','create-purchase-return'].includes(activeTab);
  const isCashBankActive = ['cash-in-hand','ledger','cash-bank'].includes(activeTab);

  const subMenuStyle: React.CSSProperties = {
    marginLeft: '14px',
    marginTop: '3px',
    marginBottom: '3px',
    padding: '6px',
    borderRadius: '12px',
    background: 'rgba(0,0,0,0.3)',
    borderLeft: '2px solid rgba(255,255,255,0.07)',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  };

  return (
    <aside
      className="w-56 flex flex-col shrink-0 select-none"
      style={{
        background: SIDEBAR_BG,
        borderRight: '1px solid rgba(255,255,255,0.07)',
        fontFamily: "'Inter','Plus Jakarta Sans',sans-serif",
      }}
    >
      {/* Scrollable nav area */}
      <div
        className="flex-1 overflow-y-auto sidebar-scroll"
        style={{ padding: '8px 8px 0', display: 'flex', flexDirection: 'column', gap: '2px' }}
      >
        <SectionLabel>Main</SectionLabel>

        <NavItem icon={Home}    label="Home"    isActive={activeTab === 'home'}      onClick={() => setActiveTab('home')} />
        <NavItem icon={Users}   label="Parties" isActive={activeTab === 'parties'}   onClick={() => setActiveTab('parties')} />
        <NavItem icon={Package} label="Items"   isActive={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} />

        <SectionLabel>Transactions</SectionLabel>

        {/* SALE */}
        <GroupHeader
          icon={ShoppingCart}
          label="Sale"
          isActive={isSaleActive}
          isOpen={isSaleOpen}
          onClick={() => setIsSaleOpen(p => !p)}
          accentColor="#e53e3e"
        />
        {isSaleOpen && (
          <div style={subMenuStyle}>
            <SubItem dotColor="#e53e3e" label="POS"                 isActive={activeTab === 'pos'}                                                         onClick={() => setActiveTab('pos')} activeColor="#e53e3e" />
            <SubItem dotColor="#10b981" label="Payment-In"          isActive={activeTab === 'payment-in'}                                                  onClick={() => setActiveTab('payment-in')} activeColor="#e53e3e" />
            <SubItem dotColor="#f59e0b" label="Estimate / Quotation" isActive={activeTab === 'estimates' || activeTab === 'create-estimate'}                onClick={() => setActiveTab('estimates')} activeColor="#e53e3e" />
            <SubItem dotColor="#64748b" label="Sale Invoices"       isActive={activeTab === 'invoices'}                                                    onClick={() => setActiveTab('invoices')} activeColor="#e53e3e" />
            <SubItem dotColor="#10b981" label="Sale Return"         isActive={activeTab === 'sale-returns' || activeTab === 'create-sale-return'}           onClick={() => setActiveTab('sale-returns')} activeColor="#e53e3e" />
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
            <SubItem dotColor="#3b82f6" label="Purchase Order"   isActive={activeTab === 'purchase-orders' || activeTab === 'create-po'}                   onClick={() => setActiveTab('purchase-orders')} activeColor="#3b82f6" />
            <SubItem dotColor="#6366f1" label="Purchase Bills"   isActive={activeTab === 'purchase'}                                                       onClick={() => setActiveTab('purchase')} activeColor="#3b82f6" />
            <SubItem dotColor="#f43f5e" label="Payment-Out"      isActive={activeTab === 'payment-out'}                                                    onClick={() => setActiveTab('payment-out')} activeColor="#3b82f6" />
            <SubItem dotColor="#f59e0b" label="Expenses"         isActive={activeTab === 'expenses'}                                                       onClick={() => setActiveTab('expenses')} activeColor="#3b82f6" />
            <SubItem dotColor="#ef4444" label="Purchase Return"  isActive={activeTab === 'purchase-returns' || activeTab === 'create-purchase-return'}      onClick={() => setActiveTab('purchase-returns')} activeColor="#3b82f6" />
          </div>
        )}

        {/* CASH & BANK */}
        <GroupHeader
          icon={BookOpen}
          label="Cash & Bank"
          isActive={isCashBankActive}
          isOpen={isCashBankOpen}
          onClick={() => setIsCashBankOpen(p => !p)}
          accentColor="#10b981"
        />
        {isCashBankOpen && (
          <div style={subMenuStyle}>
            <SubItem dotColor="#10b981" label="Cash In Hand" isActive={activeTab === 'cash-in-hand' || activeTab === 'ledger'} onClick={() => setActiveTab('cash-in-hand')} activeColor="#10b981" />
          </div>
        )}

        <SectionLabel>More</SectionLabel>

        <NavItem icon={ShieldCheck} label="GST & E-Way Bills" isActive={activeTab === 'gst'}      onClick={() => setActiveTab('gst')} />
        <NavItem icon={BarChart3}   label="Reports"           isActive={activeTab === 'reports'}   onClick={() => setActiveTab('reports')} />
        <NavItem icon={Printer}     label="Thermal Printer"   isActive={activeTab === 'settings'}  onClick={() => setActiveTab('settings')} />

        {/* bottom spacer */}
        <div style={{ flexGrow: 1, minHeight: 12 }} />
      </div>

      {/* Bottom — My Company */}
      <div style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <button
          type="button"
          onClick={() => setActiveTab('company')}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all cursor-pointer"
          style={{
            background: activeTab === 'company' ? ACTIVE_BG : 'rgba(255,255,255,0.04)',
            color: activeTab === 'company' ? TEXT_ACTIVE : TEXT_NORMAL,
            border: activeTab === 'company' ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
          }}
          onMouseEnter={e => {
            if (activeTab !== 'company') {
              (e.currentTarget as HTMLButtonElement).style.background = HOVER_BG;
              (e.currentTarget as HTMLButtonElement).style.color = TEXT_HOVER;
            }
          }}
          onMouseLeave={e => {
            if (activeTab !== 'company') {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
              (e.currentTarget as HTMLButtonElement).style.color = TEXT_NORMAL;
            }
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'rgba(59,130,246,0.18)', border: '1px solid rgba(59,130,246,0.2)' }}
            >
              <Building2 style={{ width: 14, height: 14, color: '#60a5fa' }} />
            </div>
            <span style={{ fontSize: '13px', fontWeight: 500, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              My Company
            </span>
          </div>
          <ChevronRight style={{ width: 14, height: 14, color: '#374151', flexShrink: 0 }} />
        </button>
      </div>
    </aside>
  );
};
