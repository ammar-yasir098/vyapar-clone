import React, { useState, useMemo } from 'react';
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
  Sparkles,
  Package,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  ShoppingCart,
  ArrowRight
} from 'lucide-react';
import { Invoice, Party, Item } from '../../types';

interface DashboardScreenProps {
  invoices: Invoice[];
  parties: Party[];
  items?: Item[];
  onNavigateTab: (tab: string) => void;
}

const KpiCard: React.FC<{
  title: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  gradientFrom: string;
  gradientTo: string;
  iconColor: string;
  accentColor: string;
  onClick: () => void;
}> = ({ title, value, sub, icon: Icon, gradientFrom, gradientTo, iconColor, accentColor, onClick }) => (
  <div
    onClick={onClick}
    className="card card-glass p-5 flex items-center justify-between cursor-pointer group transition-all duration-200 hover:-translate-y-1 animate-slide-up relative overflow-hidden"
    style={{ borderTop: `3.5px solid ${accentColor}` }}
  >
    <div className="relative z-10">
      <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500 mb-1.5">{title}</div>
      <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight leading-none">{value}</div>
      <div className="text-xs text-slate-500 font-semibold mt-2 flex items-center gap-1.5">{sub}</div>
    </div>
    <div
      className="w-13 h-13 rounded-2xl flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 group-hover:scale-110 relative z-10"
      style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
    >
      <Icon className="w-6 h-6 stroke-[2.5]" style={{ color: iconColor }} />
    </div>
    {/* Subtle background glow */}
    <div
      className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full opacity-15 blur-xl pointer-events-none"
      style={{ background: accentColor }}
    />
  </div>
);

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  invoices = [],
  parties = [],
  items = [],
  onNavigateTab
}) => {
  const [period, setPeriod] = useState<'month' | 'week' | 'year'>('month');

  const safeParties = Array.isArray(parties) ? parties : [];
  const safeInvoices = Array.isArray(invoices) ? invoices : [];
  const safeItems = Array.isArray(items) ? items : [];

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

  const receivablePartiesCount = safeParties.filter(
    p => getPartyEffectiveBalance(p) > 0 && (p?.type === 'CUSTOMER' || p?.type === 'BOTH')
  ).length;

  const fmt = (n: number) => n > 0
    ? `Rs ${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    : 'Rs 0.00';

  // Dynamic Period-aware Sales Plotting & Computation
  const { currentPeriodSales, points, pathD, areaD, peakPoint, xLabels, periodInvoicesCount } = useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth(); // 0-11

    let buckets: number[] = [];
    let xLabels: string[] = [];
    let periodInvoices: Invoice[] = [];

    if (period === 'month') {
      // 31 days of current month
      buckets = Array(31).fill(0);
      xLabels = ['1st', '5th', '10th', '15th', '20th', '25th', '30th'];
      periodInvoices = safeInvoices.filter(inv => {
        if (!inv?.invoiceDate) return false;
        const parts = inv.invoiceDate.split('-');
        if (parts.length >= 3) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          return y === curYear && m === curMonth;
        }
        return true;
      });
      periodInvoices.forEach(inv => {
        const parts = (inv.invoiceDate || '').split('-');
        if (parts.length >= 3) {
          const day = parseInt(parts[2], 10);
          if (day >= 1 && day <= 31) buckets[day - 1] += safeNum(inv.grandTotal);
        }
      });
    } else if (period === 'week') {
      // Past 7 days
      buckets = Array(7).fill(0);
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      xLabels = [];
      const dayDates: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        dayDates.push(`${yyyy}-${mm}-${dd}`);
        xLabels.push(`${days[d.getDay()]} ${d.getDate()}`);
      }
      periodInvoices = safeInvoices.filter(inv => inv?.invoiceDate && dayDates.includes(inv.invoiceDate));
      periodInvoices.forEach(inv => {
        const idx = dayDates.indexOf(inv.invoiceDate);
        if (idx !== -1) buckets[idx] += safeNum(inv.grandTotal);
      });
    } else {
      // 12 months of current year
      buckets = Array(12).fill(0);
      xLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      periodInvoices = safeInvoices.filter(inv => {
        if (!inv?.invoiceDate) return false;
        const parts = inv.invoiceDate.split('-');
        return parts.length >= 1 && parseInt(parts[0], 10) === curYear;
      });
      periodInvoices.forEach(inv => {
        const parts = (inv.invoiceDate || '').split('-');
        if (parts.length >= 2) {
          const m = parseInt(parts[1], 10) - 1;
          if (m >= 0 && m < 12) buckets[m] += safeNum(inv.grandTotal);
        }
      });
    }

    const currentPeriodSales = periodInvoices.reduce((sum, inv) => sum + safeNum(inv?.grandTotal), 0);
    const numPoints = buckets.length;
    const maxVal = Math.max(...buckets, 100);
    const points = buckets.map((val, idx) => ({
      x: 20 + (idx / (numPoints - 1 || 1)) * 460,
      y: 120 - (val / maxVal) * 95,
      val,
      idx
    }));
    const pathD = points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, '');
    const areaD = `${pathD} L 480 120 L 20 120 Z`;
    const peakPoint = points.reduce((prev, cur) => cur.val > prev.val ? cur : prev, points[0]);

    return {
      currentPeriodSales,
      points,
      pathD,
      areaD,
      peakPoint,
      xLabels,
      periodInvoicesCount: periodInvoices.length
    };
  }, [safeInvoices, period]);

  // Inventory Health Metrics
  const { lowStockCount, outOfStockCount } = useMemo(() => {
    let low = 0;
    let out = 0;
    safeItems.forEach(item => {
      const stock = safeNum(item.currentStock);
      const minAlert = safeNum(item.minStockAlert || 5);
      if (stock <= 0) {
        out++;
      } else if (stock <= minAlert) {
        low++;
      }
    });
    return { lowStockCount: low, outOfStockCount: out };
  }, [safeItems]);

  // Recent 4 Invoices
  const recentInvoices = useMemo(() => {
    return [...safeInvoices].slice(0, 4);
  }, [safeInvoices]);

  const quickReports = [
    { label: 'Sale Report',       icon: TrendingUp, tab: 'reports',  color: '#3b82f6', bg: '#eff6ff' },
    { label: 'All Transactions',  icon: FileText,   tab: 'invoices', color: '#8b5cf6', bg: '#f5f3ff' },
    { label: 'Daybook Report',    icon: BookOpen,   tab: 'ledger',   color: '#10b981', bg: '#ecfdf5' },
    { label: 'Party Statement',   icon: Users,      tab: 'parties',  color: '#f59e0b', bg: '#fffbeb' },
  ];

  return (
    <div
      className="flex-1 flex flex-col overflow-y-auto select-none p-4 sm:p-6"
      style={{ background: '#f8fafc' }}
    >
      <div className="flex flex-col lg:flex-row gap-5">

        {/* ── Left Column ──────────────────────────────────── */}
        <div className="flex-1 space-y-5">

          {/* KPI Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <KpiCard
              title="Total Receivable"
              value={fmt(totalReceivable)}
              sub={`From ${receivablePartiesCount} Active Customers`}
              icon={ArrowDownLeft}
              gradientFrom="#d1fae5"
              gradientTo="#a7f3d0"
              iconColor="#047857"
              accentColor="#10b981"
              onClick={() => onNavigateTab('parties')}
            />
            <KpiCard
              title="Total Payable"
              value={fmt(totalPayable)}
              sub={totalPayable > 0 ? 'To Registered Suppliers' : 'No pending payables as of now'}
              icon={ArrowUpRight}
              gradientFrom="#ffe4e6"
              gradientTo="#fecdd3"
              iconColor="#be123c"
              accentColor="#f43f5e"
              onClick={() => onNavigateTab('parties')}
            />
          </div>

          {/* Analytics & Sales Chart Card */}
          <div className="card card-glass p-6 animate-slide-up stagger-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Sales Performance ({periodInvoicesCount} Invoices — {period === 'month' ? 'This Month' : period === 'week' ? 'This Week' : 'Financial Year'})</span>
                </div>
                <div className="text-3xl font-black text-slate-900 font-mono tracking-tight mt-1 leading-none">
                  {fmt(currentPeriodSales)}
                </div>
              </div>
              <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/80 self-start sm:self-auto shadow-2xs">
                {(['month', 'week', 'year'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      period === p
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {p === 'month' ? 'This Month' : p === 'week' ? 'This Week' : 'Financial Year'}
                  </button>
                ))}
              </div>
            </div>

            {/* Bezier SVG Sales Graph */}
            <div className="h-52 w-full">
              <svg className="w-full h-full" viewBox="0 0 500 140" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* Horizontal Grid lines */}
                {[30, 60, 90, 120].map(y => (
                  <line key={y} x1="20" y1={y} x2="480" y2={y} stroke="#e2e8f0" strokeDasharray="3,3" strokeWidth="1" />
                ))}
                <path d={areaD} fill="url(#salesGrad)" />
                <path d={pathD} fill="none" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                {peakPoint && peakPoint.val > 0 && (
                  <>
                    <circle cx={peakPoint.x} cy={peakPoint.y} r="6" fill="#6366f1" stroke="#ffffff" strokeWidth="3" className="animate-pulse" />
                    <line x1={peakPoint.x} y1={peakPoint.y} x2={peakPoint.x} y2="120" stroke="#6366f1" strokeWidth="1.5" strokeDasharray="3,3" opacity="0.6" />
                  </>
                )}
              </svg>
              <div className="flex justify-between text-[10px] text-slate-400 font-mono font-bold mt-2 px-1">
                {xLabels.map(label => (
                  <span key={label}>{label}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Most Used Reports Grid */}
          <div className="card card-glass p-5 animate-slide-up stagger-3">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-slate-700">Most Used Reports</h3>
              <button
                onClick={() => onNavigateTab('reports')}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700 transition cursor-pointer flex items-center gap-0.5"
              >
                <span>View All Reports</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {quickReports.map((r) => (
                <button
                  key={r.label}
                  onClick={() => onNavigateTab(r.tab)}
                  className="flex items-center justify-between p-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer group bg-slate-50/80 border border-slate-200/80 hover:bg-white hover:border-indigo-200 hover:shadow-md"
                >
                  <span className="text-slate-800 group-hover:text-indigo-900">{r.label}</span>
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                    style={{ background: r.bg }}
                  >
                    <r.icon className="w-3.5 h-3.5 shrink-0" style={{ color: r.color }} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right Column ─────────────────────────────────── */}
        <div className="w-full lg:w-80 space-y-4">

          {/* Real Inventory Health & Low Stock Alert Card (Replaced Google Profile placeholder) */}
          <div className="card card-glass p-5 space-y-3.5 animate-slide-up stagger-1 border-t-3 border-amber-500">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-amber-600 bg-amber-100 shadow-2xs">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-slate-900">Inventory Health</div>
                  <div className="text-[10px] text-slate-500 font-semibold">{safeItems.length} Products Monitored</div>
                </div>
              </div>
              {lowStockCount > 0 || outOfStockCount > 0 ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1 animate-pulse">
                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                  <span>{lowStockCount + outOfStockCount} Alert</span>
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Healthy</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <div className="bg-slate-50/90 rounded-xl p-2.5 border border-slate-200/70">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Out of Stock</div>
                <div className={`text-base font-black font-mono mt-0.5 ${outOfStockCount > 0 ? 'text-rose-600 font-extrabold' : 'text-slate-700'}`}>
                  {outOfStockCount}
                </div>
              </div>
              <div className="bg-slate-50/90 rounded-xl p-2.5 border border-slate-200/70">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Low Stock</div>
                <div className={`text-base font-black font-mono mt-0.5 ${lowStockCount > 0 ? 'text-amber-600 font-extrabold' : 'text-slate-700'}`}>
                  {lowStockCount}
                </div>
              </div>
            </div>

            <button
              onClick={() => onNavigateTab('inventory')}
              className="w-full py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 shadow-2xs group"
            >
              <span>Manage Inventory & Stock</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* Quick Actions Grid */}
          <div className="card card-glass p-5 space-y-3 animate-slide-up stagger-2">
            <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Quick Actions</div>
            {[
              { label: 'New Sale Invoice', tab: 'pos',       color: '#ef4444', icon: Zap },
              { label: 'Add Party / Customer', tab: 'parties',   color: '#3b82f6', icon: Users },
              { label: 'Add Product Item', tab: 'inventory', color: '#8b5cf6', icon: Plus },
              { label: 'View Analytics',     tab: 'reports',   color: '#10b981', icon: BarChart3 },
            ].map(item => (
              <button
                key={item.label}
                onClick={() => onNavigateTab(item.tab)}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer bg-slate-50/80 border border-slate-200/80 hover:bg-white hover:border-slate-300 hover:shadow-xs group"
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                  style={{ background: `${item.color}18` }}
                >
                  <item.icon className="w-3.5 h-3.5 stroke-[2.5]" style={{ color: item.color }} />
                </div>
                <span className="text-slate-800 font-semibold">{item.label}</span>
              </button>
            ))}
          </div>

          {/* Real Recent Sales Activity Card (Replaced dummy 'Add Custom Widget' placeholder) */}
          <div className="card card-glass p-5 space-y-3 animate-slide-up stagger-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-indigo-500" />
                <span>Recent Invoices</span>
              </div>
              <button
                onClick={() => onNavigateTab('invoices')}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer flex items-center gap-0.5"
              >
                <span>All Bills</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            {recentInvoices.length === 0 ? (
              <div className="text-center py-6 px-3 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
                <ShoppingCart className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-600">No sales recorded yet</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Start billing to see recent transactions</p>
                <button
                  onClick={() => onNavigateTab('pos')}
                  className="mt-3 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition cursor-pointer"
                >
                  + Add New Sale
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {recentInvoices.map((inv) => (
                  <div
                    key={inv.id || inv.invoiceNumber}
                    onClick={() => onNavigateTab('invoices')}
                    className="p-2.5 rounded-xl bg-slate-50/80 hover:bg-white border border-slate-200/70 hover:border-indigo-200 transition-all cursor-pointer flex items-center justify-between group shadow-2xs hover:shadow-xs"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-bold text-slate-800 group-hover:text-indigo-700 truncate">
                        {inv.partyName || 'Walk-in Customer'}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                        <span>{inv.invoiceNumber}</span>
                        <span>•</span>
                        <span>{inv.invoiceDate || 'Today'}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-black text-slate-900 font-mono">
                        Rs {Number(inv.grandTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-extrabold mt-0.5 ${
                        inv.paymentStatus === 'PAID'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {inv.paymentStatus || 'PAID'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
