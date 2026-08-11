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
  Sparkles
} from 'lucide-react';
import { Invoice, Party } from '../../types';

interface DashboardScreenProps {
  invoices: Invoice[];
  parties: Party[];
  onNavigateTab: (tab: string) => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ invoices = [], parties = [], onNavigateTab }) => {
  const [period, setPeriod] = useState<'month' | 'week' | 'year'>('month');

  const safeParties = Array.isArray(parties) ? parties : [];
  const safeInvoices = Array.isArray(invoices) ? invoices : [];

  const safeNum = (val: any): number => {
    if (val === null || val === undefined) return 0;
    const n = Number(val);
    return isNaN(n) || !isFinite(n) ? 0 : n;
  };

  const getPartyEffectiveBalance = (party: Party): number => {
    const pId = party.id;
    const pName = (party.name || '').trim().toLowerCase();

    const partyInvoices = safeInvoices.filter(
      inv => (pId !== undefined && inv?.partyId === pId) || (inv?.partyName && inv.partyName.trim().toLowerCase() === pName)
    );

    const unpaidInvoicesDue = partyInvoices.reduce((sum, inv) => {
      if (inv?.paymentStatus === 'PAID') return sum;
      const dueVal = inv?.dueAmount !== undefined && !isNaN(Number(inv.dueAmount))
        ? safeNum(inv.dueAmount)
        : Math.max(0, safeNum(inv?.grandTotal) - safeNum(inv?.receivedAmount));
      return sum + safeNum(dueVal);
    }, 0);

    const opening = safeNum(party.openingBalance);
    const current = safeNum(party.currentBalance);

    if (party.type === 'CUSTOMER') {
      if (current === 0) {
        return unpaidInvoicesDue;
      }
      return safeNum(opening + unpaidInvoicesDue);
    }
    return current;
  };

  const totalReceivable = safeParties
    .filter(p => p.type === 'CUSTOMER' || p.type === 'BOTH')
    .reduce((sum, p) => {
      const bal = getPartyEffectiveBalance(p);
      return sum + (bal > 0 ? bal : 0);
    }, 0);

  const totalPayable = safeParties
    .filter(p => p.type === 'SUPPLIER' || p.type === 'BOTH')
    .reduce((sum, p) => {
      const bal = getPartyEffectiveBalance(p);
      return sum + (bal > 0 ? bal : 0);
    }, 0);

  const totalSales = safeInvoices.reduce((sum, inv) => sum + safeNum(inv?.grandTotal), 0);
  const receivablePartiesCount = safeParties.filter(p => getPartyEffectiveBalance(p) > 0 && (p?.type === 'CUSTOMER' || p?.type === 'BOTH')).length;

  // Dynamic Sales Curve Calculation
  const getSalesPlotData = () => {
    const buckets = Array(31).fill(0);
    safeInvoices.forEach(inv => {
      if (!inv || !inv.invoiceDate) return;
      const parts = inv.invoiceDate.split('-');
      if (parts.length === 3) {
        const day = parseInt(parts[2], 10);
        if (day >= 1 && day <= 31) {
          buckets[day - 1] += safeNum(inv.grandTotal);
        }
      }
    });

    const maxVal = Math.max(...buckets, 100);
    const points = buckets.map((val, idx) => {
      const x = 20 + (idx / 30) * 460;
      const y = 130 - (val / maxVal) * 100;
      return { x, y, val, day: idx + 1 };
    });

    const pathD = points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, '');
    const areaD = `${pathD} L 480 130 L 20 130 Z`;
    const peakPoint = points.reduce((prev, current) => (current.val > prev.val ? current : prev), points[0]);

    return { points, pathD, areaD, peakPoint };
  };

  const { points, pathD, areaD, peakPoint } = getSalesPlotData();

  return (
    <div className="flex-1 flex flex-col p-6 bg-[#f3f4f6] overflow-y-auto gap-6 select-none">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Column: Metrics & Charts */}
        <div className="flex-1 space-y-6">
          {/* Top KPI Cards (Total Receivable & Total Payable) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Total Receivable Card */}
            <div 
              onClick={() => onNavigateTab('parties')}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between hover:border-emerald-500 hover:shadow-md cursor-pointer transition-all"
            >
              <div>
                <div className="text-xs text-slate-600 font-bold mb-1 uppercase tracking-wider">Total Receivable</div>
                <div className="text-2xl font-extrabold text-slate-900 font-mono">
                  Rs {totalReceivable > 0 ? totalReceivable.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
                </div>
                <div className="text-xs text-slate-500 font-medium mt-1">
                  From <strong className="text-slate-800 font-bold">{receivablePartiesCount}</strong> Customers
                </div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                <ArrowDownLeft className="w-6 h-6 stroke-[2.5]" />
              </div>
            </div>

            {/* Total Payable Card */}
            <div 
              onClick={() => onNavigateTab('parties')}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between hover:border-rose-500 hover:shadow-md cursor-pointer transition-all"
            >
              <div>
                <div className="text-xs text-slate-600 font-bold mb-1 uppercase tracking-wider">Total Payable</div>
                <div className="text-2xl font-extrabold text-slate-900 font-mono">
                  Rs {totalPayable > 0 ? totalPayable.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
                </div>
                <div className="text-xs text-slate-500 font-medium mt-1">
                  {totalPayable > 0 ? 'To Registered Suppliers' : "No pending payables as of now."}
                </div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                <ArrowUpRight className="w-6 h-6 stroke-[2.5]" />
              </div>
            </div>
          </div>

          {/* Total Sales Graph Card */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Total Sales ({invoices.length} Bills Saved)</div>
                <div className="text-3xl font-black text-slate-900 font-mono mt-1">
                  Rs {totalSales > 0 ? totalSales.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
                </div>
              </div>

              <select 
                value={period}
                onChange={e => setPeriod(e.target.value as any)}
                className="bg-blue-50/80 border border-blue-200 text-blue-700 font-extrabold text-xs px-3.5 py-2 rounded-lg outline-none cursor-pointer hover:bg-blue-100/80 transition"
              >
                <option value="month">This Month</option>
                <option value="week">This Week</option>
                <option value="year">Financial Year</option>
              </select>
            </div>

            {/* Dynamic SVG Sales Curve */}
            <div className="h-52 w-full pt-2">
              <svg className="w-full h-full" viewBox="0 0 500 150" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                <line x1="0" y1="30" x2="500" y2="30" stroke="#f1f5f9" strokeWidth="1" />
                <line x1="0" y1="70" x2="500" y2="70" stroke="#f1f5f9" strokeWidth="1" />
                <line x1="0" y1="110" x2="500" y2="110" stroke="#f1f5f9" strokeWidth="1" />

                <path d={areaD} fill="url(#salesGrad)" />
                <path d={pathD} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />

                {peakPoint && peakPoint.val > 0 && (
                  <circle cx={peakPoint.x} cy={peakPoint.y} r="5" fill="#2563eb" stroke="#ffffff" strokeWidth="2.5" />
                )}
              </svg>

              <div className="flex justify-between text-[11px] text-slate-500 font-mono font-bold pt-2">
                <span>1st</span>
                <span>4th</span>
                <span>7th</span>
                <span>10th</span>
                <span>13th</span>
                <span>16th</span>
                <span>19th</span>
                <span>22nd</span>
                <span>25th</span>
                <span>28th</span>
                <span>31st</span>
              </div>
            </div>
          </div>

          {/* Most Used Reports Quick Action Cards */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Most Used Reports</h3>
              <button
                onClick={() => onNavigateTab('reports')}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 transition cursor-pointer"
              >
                View All Reports →
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              {[
                { label: 'Sale Report', tab: 'reports' },
                { label: 'All Transactions', tab: 'invoices' },
                { label: 'Daybook Report', tab: 'ledger' },
                { label: 'Party Statement', tab: 'parties' }
              ].map((rpt, i) => (
                <button
                  key={i}
                  onClick={() => onNavigateTab(rpt.tab)}
                  className="bg-slate-50 border border-slate-200/80 hover:border-blue-400 hover:bg-blue-50/50 p-3.5 rounded-xl flex items-center justify-between text-xs font-bold text-slate-800 transition cursor-pointer group"
                >
                  <span>{rpt.label}</span>
                  <ChevronRight className="w-4 h-4 text-blue-600 group-hover:translate-x-0.5 transition-transform" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Google Profile & Add Widget Panel */}
        <div className="w-full lg:w-72 space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3.5">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-600 font-extrabold text-xs">
                G
              </div>
              <span className="font-extrabold text-xs text-slate-900">Google Profile Manager</span>
            </div>
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              Businesses with 4+ star ratings get 28% more customer calls on Google Maps.
            </p>
            <button 
              onClick={() => alert('Connected Google Business Profile for SuperMarket Retail & Traders!')}
              className="w-full py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition border border-blue-200 cursor-pointer"
            >
              Connect Profile
            </button>
          </div>

          <div 
            onClick={() => onNavigateTab('pos')}
            className="bg-white border-2 border-dashed border-slate-200 p-8 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/30 transition cursor-pointer group"
          >
            <Plus className="w-6 h-6 stroke-[2.5] group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold">Add Custom Widget</span>
          </div>
        </div>
      </div>
    </div>
  );
};
