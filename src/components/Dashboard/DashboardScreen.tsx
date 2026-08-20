import React, { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Plus,
  FileText,
  BookOpen,
  Users,
  BarChart3,
  TrendingUp,
  Zap,
  Globe
} from 'lucide-react';
import { Invoice, Party } from '../../types';

interface DashboardScreenProps {
  invoices: Invoice[];
  parties: Party[];
  onNavigateTab: (tab: string) => void;
}

const KpiCard: React.FC<{
  title: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  accentColor: string;
  onClick: () => void;
}> = ({ title, value, sub, icon: Icon, iconBg, iconColor, accentColor, onClick }) => (
  <div
    onClick={onClick}
    className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between cursor-pointer group transition-all duration-200 hover:-translate-y-0.5 animate-slide-up"
    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)', borderTop: `3px solid ${accentColor}` }}
    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 24px rgba(0,0,0,0.09)`; }}
    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; }}
  >
    <div>
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">{title}</div>
      <div className="text-2xl font-black text-slate-900 font-mono leading-none">{value}</div>
      <div className="text-[11.5px] text-slate-500 font-medium mt-1.5">{sub}</div>
    </div>
    <div
      className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
      style={{ background: iconBg }}
    >
      <Icon className="w-5 h-5 stroke-[2.5]" style={{ color: iconColor }} />
    </div>
  </div>
);

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ invoices = [], parties = [], onNavigateTab }) => {
  const [period, setPeriod] = useState<'month' | 'week' | 'year'>('month');

  const safeParties = Array.isArray(parties) ? parties : [];
  const safeInvoices = Array.isArray(invoices) ? invoices : [];

  const safeNum = (val: any): number => {
    if (val === null || val === undefined) return 0;
    const n = Number(val);
    return isNaN(n) || !isFinite(n) ? 0 : n;
  };

  const getPartyEffectiveBalance = (party: Party): number =>
    safeNum(party.currentBalance !== undefined ? party.currentBalance : party.openingBalance);

  const totalReceivable = safeParties
    .filter(p => p.type === 'CUSTOMER' || p.type === 'BOTH')
    .reduce((sum, p) => { const b = getPartyEffectiveBalance(p); return sum + (b > 0 ? b : 0); }, 0);

  const totalPayable = safeParties
    .filter(p => p.type === 'SUPPLIER' || p.type === 'BOTH')
    .reduce((sum, p) => { const b = getPartyEffectiveBalance(p); return sum + (b > 0 ? b : 0); }, 0);

  const totalSales = safeInvoices.reduce((sum, inv) => sum + safeNum(inv?.grandTotal), 0);
  const receivablePartiesCount = safeParties.filter(p => getPartyEffectiveBalance(p) > 0 && (p?.type === 'CUSTOMER' || p?.type === 'BOTH')).length;

  const fmt = (n: number) => n > 0
    ? `Rs ${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    : 'Rs 0.00';

  // Dynamic Sales Curve
  const getSalesPlotData = () => {
    const buckets = Array(31).fill(0);
    safeInvoices.forEach(inv => {
      if (!inv?.invoiceDate) return;
      const parts = inv.invoiceDate.split('-');
      if (parts.length === 3) {
        const day = parseInt(parts[2], 10);
        if (day >= 1 && day <= 31) buckets[day - 1] += safeNum(inv.grandTotal);
      }
    });
    const maxVal = Math.max(...buckets, 100);
    const points = buckets.map((val, idx) => ({
      x: 20 + (idx / 30) * 460,
      y: 120 - (val / maxVal) * 95,
      val, day: idx + 1
    }));
    const pathD = points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, '');
    const areaD = `${pathD} L 480 120 L 20 120 Z`;
    const peakPoint = points.reduce((prev, cur) => cur.val > prev.val ? cur : prev, points[0]);
    return { points, pathD, areaD, peakPoint };
  };

  const { pathD, areaD, peakPoint } = getSalesPlotData();

  const quickReports = [
    { label: 'Sale Report',       icon: TrendingUp, tab: 'reports',  color: '#3b82f6', bg: '#eff6ff' },
    { label: 'All Transactions',  icon: FileText,   tab: 'invoices', color: '#8b5cf6', bg: '#f5f3ff' },
    { label: 'Daybook Report',    icon: BookOpen,   tab: 'ledger',   color: '#10b981', bg: '#ecfdf5' },
    { label: 'Party Statement',   icon: Users,      tab: 'parties',  color: '#f59e0b', bg: '#fffbeb' },
  ];

  return (
    <div
      className="flex-1 flex flex-col overflow-y-auto select-none"
      style={{ background: '#f1f5f9', padding: '24px' }}
    >
      <div className="flex flex-col lg:flex-row gap-5">

        {/* ── Left Column ──────────────────────────────────── */}
        <div className="flex-1 space-y-5">

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <KpiCard
              title="Total Receivable"
              value={fmt(totalReceivable)}
              sub={`From ${receivablePartiesCount} Customers`}
              icon={ArrowDownLeft}
              iconBg="#ecfdf5"
              iconColor="#10b981"
              accentColor="#10b981"
              onClick={() => onNavigateTab('parties')}
            />
            <KpiCard
              title="Total Payable"
              value={fmt(totalPayable)}
              sub={totalPayable > 0 ? 'To Registered Suppliers' : 'No pending payables as of now.'}
              icon={ArrowUpRight}
              iconBg="#fff1f2"
              iconColor="#f43f5e"
              accentColor="#f43f5e"
              onClick={() => onNavigateTab('parties')}
            />
          </div>

          {/* Sales Chart Card */}
          <div
            className="bg-white rounded-2xl border border-slate-200 p-6 animate-slide-up stagger-2"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                  Total Sales ({safeInvoices.length} Bills Saved)
                </div>
                <div className="text-3xl font-black text-slate-900 font-mono mt-1 leading-none">
                  {fmt(totalSales)}
                </div>
              </div>
              <select
                value={period}
                onChange={e => setPeriod(e.target.value as any)}
                className="h-8 px-3 text-xs font-bold rounded-lg border outline-none cursor-pointer transition"
                style={{
                  background: '#eff6ff', borderColor: '#bfdbfe',
                  color: '#1d4ed8', fontFamily: 'inherit',
                }}
              >
                <option value="month">This Month</option>
                <option value="week">This Week</option>
                <option value="year">Financial Year</option>
              </select>
            </div>

            {/* SVG Chart */}
            <div className="h-48 w-full">
              <svg className="w-full h-full" viewBox="0 0 500 140" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* Grid lines */}
                {[30, 60, 90, 120].map(y => (
                  <line key={y} x1="20" y1={y} x2="480" y2={y} stroke="#f1f5f9" strokeWidth="1" />
                ))}
                <path d={areaD} fill="url(#salesGrad)" />
                <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                {peakPoint && peakPoint.val > 0 && (
                  <>
                    <circle cx={peakPoint.x} cy={peakPoint.y} r="6" fill="#3b82f6" stroke="#ffffff" strokeWidth="2.5" />
                    <line x1={peakPoint.x} y1={peakPoint.y} x2={peakPoint.x} y2="120" stroke="#3b82f6" strokeWidth="1" strokeDasharray="3,3" opacity="0.4" />
                  </>
                )}
              </svg>
              <div className="flex justify-between text-[10px] text-slate-400 font-mono font-bold mt-1.5 px-1">
                {['1st','4th','7th','10th','13th','16th','19th','22nd','25th','28th','31st'].map(d => (
                  <span key={d}>{d}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Reports */}
          <div
            className="bg-white rounded-2xl border border-slate-200 p-5 animate-slide-up stagger-3"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Most Used Reports</h3>
              <button
                onClick={() => onNavigateTab('reports')}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 transition cursor-pointer flex items-center gap-0.5"
              >
                View All Reports <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {quickReports.map((r) => (
                <button
                  key={r.label}
                  onClick={() => onNavigateTab(r.tab)}
                  className="flex items-center justify-between p-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer group"
                  style={{
                    background: '#f8fafc',
                    border: '1.5px solid #e2e8f0',
                    color: '#334155',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = r.bg;
                    (e.currentTarget as HTMLButtonElement).style.borderColor = r.color + '55';
                    (e.currentTarget as HTMLButtonElement).style.color = r.color;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = '#f8fafc';
                    (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0';
                    (e.currentTarget as HTMLButtonElement).style.color = '#334155';
                  }}
                >
                  <span>{r.label}</span>
                  <r.icon className="w-3.5 h-3.5 shrink-0" style={{ color: r.color, opacity: 0.8 }} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right Column ─────────────────────────────────── */}
        <div className="w-full lg:w-72 space-y-4">

          {/* Google Profile card */}
          <div
            className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3.5 animate-slide-up stagger-1"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm"
                style={{ background: 'linear-gradient(135deg, #4285F4, #34A853)', color: '#fff' }}
              >
                G
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">Google Profile Manager</div>
                <div className="text-[10px] text-slate-400 font-medium">Business visibility tool</div>
              </div>
            </div>
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              Businesses with 4+ star ratings get <strong className="text-slate-800">28% more</strong> customer calls on Google Maps.
            </p>
            <button
              onClick={() => alert('Connected Google Business Profile!')}
              className="w-full py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5"
              style={{ background: '#eff6ff', color: '#2563eb', border: '1.5px solid #bfdbfe' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#dbeafe'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#eff6ff'; }}
            >
              <Globe className="w-3.5 h-3.5" />
              Connect Profile
            </button>
          </div>

          {/* Quick actions */}
          <div
            className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 animate-slide-up stagger-2"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
          >
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Quick Actions</div>
            {[
              { label: 'New Sale Invoice', tab: 'pos',       color: '#e53e3e', icon: Zap },
              { label: 'Add Party',        tab: 'parties',   color: '#3b82f6', icon: Users },
              { label: 'Add Item',         tab: 'inventory', color: '#8b5cf6', icon: Plus },
              { label: 'View Reports',     tab: 'reports',   color: '#10b981', icon: BarChart3 },
            ].map(item => (
              <button
                key={item.label}
                onClick={() => onNavigateTab(item.tab)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                style={{ background: '#f8fafc', color: '#334155', border: '1px solid #e2e8f0' }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = item.color + '66';
                  (e.currentTarget as HTMLButtonElement).style.color = item.color;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0';
                  (e.currentTarget as HTMLButtonElement).style.color = '#334155';
                }}
              >
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: item.color + '15' }}
                >
                  <item.icon className="w-3.5 h-3.5" style={{ color: item.color }} />
                </div>
                {item.label}
              </button>
            ))}
          </div>

          {/* Add widget placeholder */}
          <div
            onClick={() => onNavigateTab('pos')}
            className="rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all group"
            style={{
              border: '2px dashed #cbd5e1',
              padding: '28px 16px',
              color: '#94a3b8',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLDivElement).style.borderColor = '#3b82f6';
              (e.currentTarget as HTMLDivElement).style.color = '#3b82f6';
              (e.currentTarget as HTMLDivElement).style.background = '#eff6ff';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.borderColor = '#cbd5e1';
              (e.currentTarget as HTMLDivElement).style.color = '#94a3b8';
              (e.currentTarget as HTMLDivElement).style.background = 'transparent';
            }}
          >
            <Plus className="w-5 h-5 stroke-[2.5]" />
            <span className="text-xs font-bold">Add Custom Widget</span>
          </div>
        </div>
      </div>
    </div>
  );
};
