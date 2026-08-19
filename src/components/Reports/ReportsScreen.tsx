import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Receipt,
  FileText,
  Search,
  Printer,
  FileSpreadsheet,
  Plus,
  ArrowUpRight,
  Share2,
  Calendar,
  X,
  PieChart
} from 'lucide-react';
import { Invoice, BusinessDetails, PurchaseBill, PurchaseReturn } from '../../types';
import { triggerThermalPrint } from '../../services/printer';

interface ReportsScreenProps {
  invoices?: Invoice[];
  purchaseBills?: PurchaseBill[];
  purchaseReturns?: PurchaseReturn[];
  business?: BusinessDetails;
  companies?: BusinessDetails[];
  onAddSale?: () => void;
  onAddPurchase?: () => void;
}

type DatePreset = 'this_month' | 'today' | 'yesterday' | 'this_week' | 'last_month' | 'this_quarter' | 'this_year' | 'custom';

// Navigation structure matching reference UI
const REPORT_SECTIONS = [
  {
    title: 'Transaction report',
    items: [
      { id: 'sale', label: 'Sale' },
      { id: 'purchase', label: 'Purchase' },
      { id: 'day-book', label: 'Day book' },
      { id: 'all-transactions', label: 'All Transactions' },
      { id: 'profit-loss', label: 'Profit And Loss' },
      { id: 'bill-wise-profit', label: 'Bill Wise Profit' },
      { id: 'cash-flow', label: 'Cash flow' },
      { id: 'trial-balance', label: 'Trial Balance Report' },
      { id: 'balance-sheet', label: 'Balance Sheet' },
    ]
  },
  {
    title: 'Party report',
    items: [
      { id: 'party-statement', label: 'Party Statement' },
      { id: 'party-profit-loss', label: 'Party wise Profit & Loss' },
      { id: 'all-parties', label: 'All parties' },
      { id: 'party-report-by-item', label: 'Party Report By Item' },
      { id: 'sale-purchase-by-party', label: 'Sale Purchase By Party' },
      { id: 'sale-purchase-by-party-group', label: 'Sale Purchase By Party Group' },
    ]
  },
  {
    title: 'Item/ Stock report',
    items: [
      { id: 'stock-summary', label: 'Stock summary' },
      { id: 'item-report-by-party', label: 'Item Report By Party' },
    ]
  }
];

// Helper to format date string as YYYY-MM-DD
function formatDateISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to format YYYY-MM-DD to DD/MM/YYYY for display
function formatDateDisplay(dateStr?: string): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

// Helper to calculate date range based on preset
function getPresetDates(preset: DatePreset): { startDate: string; endDate: string } {
  const now = new Date();
  const todayISO = formatDateISO(now);

  if (preset === 'today') {
    return { startDate: todayISO, endDate: todayISO };
  }

  if (preset === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const yISO = formatDateISO(y);
    return { startDate: yISO, endDate: yISO };
  }

  if (preset === 'this_week') {
    const day = now.getDay();
    const diffToMon = now.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(now.setDate(diffToMon));
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    return { startDate: formatDateISO(mon), endDate: formatDateISO(sun) };
  }

  if (preset === 'this_month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { startDate: formatDateISO(first), endDate: formatDateISO(last) };
  }

  if (preset === 'last_month') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { startDate: formatDateISO(first), endDate: formatDateISO(last) };
  }

  if (preset === 'this_quarter') {
    const qMonth = Math.floor(now.getMonth() / 3) * 3;
    const first = new Date(now.getFullYear(), qMonth, 1);
    const last = new Date(now.getFullYear(), qMonth + 3, 0);
    return { startDate: formatDateISO(first), endDate: formatDateISO(last) };
  }

  if (preset === 'this_year') {
    const first = new Date(now.getFullYear(), 0, 1);
    const last = new Date(now.getFullYear(), 11, 31);
    return { startDate: formatDateISO(first), endDate: formatDateISO(last) };
  }

  // Default fallback to this month
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { startDate: formatDateISO(first), endDate: formatDateISO(last) };
}

export const ReportsScreen: React.FC<ReportsScreenProps> = ({
  invoices = [],
  purchaseBills = [],
  purchaseReturns = [],
  business = {
    name: 'SuperMarket Retail & Traders',
    gstin: 'NTN: 7654321-0',
    phone: '+92 300 xxxxxxx',
    address: 'Commercial Market, Lahore',
    state: 'Punjab',
    tagline: ''
  },
  companies = [],
  onAddSale,
  onAddPurchase
}) => {
  const [activeTab, setActiveTab] = useState<string>('sale');
  const [datePreset, setDatePreset] = useState<DatePreset>('this_month');
  
  // Initialize default date range to Current Month
  const initialDates = useMemo(() => getPresetDates('this_month'), []);
  const [startDate, setStartDate] = useState<string>(initialDates.startDate);
  const [endDate, setEndDate] = useState<string>(initialDates.endDate);
  
  const activeTenantId = business?.tenantId || 'default-tenant';
  const [selectedFirm, setSelectedFirm] = useState<string>(activeTenantId || 'all');
  const [search, setSearch] = useState<string>('');
  const [showChart, setShowChart] = useState<boolean>(false);

  // Auto-sync selectedFirm whenever active tenant is changed from top-left store selector
  useEffect(() => {
    if (activeTenantId) {
      setSelectedFirm(activeTenantId);
    }
  }, [activeTenantId]);

  const safeInvoices = Array.isArray(invoices) ? invoices : [];
  const safePurchaseBills = Array.isArray(purchaseBills) ? purchaseBills : [];
  const safePurchaseReturns = Array.isArray(purchaseReturns) ? purchaseReturns : [];

  // Handle Preset Change
  const handlePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    if (preset !== 'custom') {
      const dates = getPresetDates(preset);
      setStartDate(dates.startDate);
      setEndDate(dates.endDate);
    }
  };

  // ----------------- SALE REPORT DATA -----------------
  const filteredInvoices = useMemo(() => {
    return safeInvoices.filter(inv => {
      if (!inv) return false;

      const invTenant = inv.tenantId || 'default-tenant';
      if (selectedFirm !== 'all' && invTenant !== selectedFirm) {
        return false;
      }

      const invDate = inv.invoiceDate || (inv.createdAt ? inv.createdAt.split('T')[0] : '');
      if (startDate && invDate < startDate) return false;
      if (endDate && invDate > endDate) return false;

      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const invNum = (inv.invoiceNumber || '').toLowerCase();
        const party = (inv.partyName || '').toLowerCase();
        const pMethod = (inv.paymentMethod || '').toLowerCase();
        return invNum.includes(q) || party.includes(q) || pMethod.includes(q);
      }

      return true;
    });
  }, [safeInvoices, selectedFirm, startDate, endDate, search]);

  const totalSalesAmount = useMemo(() => {
    return filteredInvoices.reduce((sum, inv) => sum + Number(inv.grandTotal || 0), 0);
  }, [filteredInvoices]);

  const totalReceivedAmount = useMemo(() => {
    return filteredInvoices.reduce((sum, inv) => sum + Number(inv.receivedAmount || 0), 0);
  }, [filteredInvoices]);

  const totalBalanceAmount = useMemo(() => {
    return filteredInvoices.reduce((sum, inv) => {
      const due = inv.dueAmount !== undefined ? Number(inv.dueAmount) : (inv.paymentStatus === 'PAID' ? 0 : Number(inv.grandTotal || 0));
      return sum + due;
    }, 0);
  }, [filteredInvoices]);

  // Accurate Payment Breakdown Calculations for Sales
  const collectedSalesTotal = useMemo(() => {
    return totalReceivedAmount;
  }, [totalReceivedAmount]);

  const digitalSalesTotal = useMemo(() => {
    return filteredInvoices
      .filter(i => {
        const pm = (i.paymentMethod || '').toUpperCase();
        return pm === 'UPI' || pm === 'CARD' || pm === 'DIGITAL / APP' || pm === 'CHEQUE' || pm === 'BANK' || pm === 'ONLINE';
      })
      .reduce((sum, i) => sum + Number(i.grandTotal || 0), 0);
  }, [filteredInvoices]);

  const creditUnpaidDuesTotal = useMemo(() => {
    return totalBalanceAmount;
  }, [totalBalanceAmount]);

  const previousMonthSalesTotal = useMemo(() => {
    const prevDates = getPresetDates('last_month');
    return safeInvoices
      .filter(inv => {
        if (!inv) return false;
        const invTenant = inv.tenantId || 'default-tenant';
        if (selectedFirm !== 'all' && invTenant !== selectedFirm) {
          return false;
        }
        const invDate = inv.invoiceDate || (inv.createdAt ? inv.createdAt.split('T')[0] : '');
        return invDate >= prevDates.startDate && invDate <= prevDates.endDate;
      })
      .reduce((sum, inv) => sum + Number(inv.grandTotal || 0), 0);
  }, [safeInvoices, selectedFirm]);

  const growthPercent = useMemo(() => {
    if (previousMonthSalesTotal === 0) return 100;
    const diff = totalSalesAmount - previousMonthSalesTotal;
    return Math.round((diff / previousMonthSalesTotal) * 100);
  }, [totalSalesAmount, previousMonthSalesTotal]);

  const handleExportSaleCSV = () => {
    if (filteredInvoices.length === 0) {
      alert('No transactions available to export for the selected date range.');
      return;
    }

    const headers = ['Date', 'Invoice No', 'Party Name', 'Transaction', 'Payment Type', 'Total Amount (Rs)', 'Balance Due (Rs)', 'Status'];
    const rows = filteredInvoices.map(inv => {
      const due = inv.dueAmount !== undefined ? Number(inv.dueAmount) : (inv.paymentStatus === 'PAID' ? 0 : Number(inv.grandTotal || 0));
      return [
        inv.invoiceDate || '-',
        `"${inv.invoiceNumber || '-'}"`,
        `"${inv.partyName || 'Walk-in Customer'}"`,
        'Sale',
        inv.paymentMethod || 'CASH',
        Number(inv.grandTotal || 0).toFixed(2),
        due.toFixed(2),
        inv.paymentStatus || 'PAID'
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Sale_Report_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ----------------- PURCHASE REPORT DATA -----------------
  const filteredPurchases = useMemo(() => {
    const billsMapped = safePurchaseBills.map(b => ({
      id: b.id || b.billNumber,
      date: b.billDate || (b.createdAt ? b.createdAt.split('T')[0] : ''),
      invoiceNo: b.billNumber || '-',
      partyName: b.supplierName || 'Vendor / Supplier',
      type: 'Purchase',
      paymentType: 'CASH',
      amount: Number(b.grandTotal || 0),
      balanceDue: 0,
      paidAmount: Number(b.grandTotal || 0),
      tenantId: b.tenantId || 'default-tenant'
    }));

    const returnsMapped = safePurchaseReturns.map(r => ({
      id: r.id || r.debitNoteNumber,
      date: r.returnDate || (r.createdAt ? r.createdAt.split('T')[0] : ''),
      invoiceNo: r.debitNoteNumber || r.purchaseBillNumber || '-',
      partyName: r.supplierName || 'Vendor / Supplier',
      type: 'Debit Note',
      paymentType: 'CASH',
      amount: Number(r.grandTotal || 0),
      balanceDue: 0,
      paidAmount: Number(r.grandTotal || 0),
      tenantId: r.tenantId || 'default-tenant'
    }));

    const allTxns = [...billsMapped, ...returnsMapped];

    return allTxns.filter(t => {
      // Tenant Isolation
      if (selectedFirm !== 'all' && t.tenantId !== selectedFirm) {
        return false;
      }

      // Date Filter
      if (startDate && t.date < startDate) return false;
      if (endDate && t.date > endDate) return false;

      // Search Query Filter
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        return (
          t.invoiceNo.toLowerCase().includes(q) ||
          t.partyName.toLowerCase().includes(q) ||
          t.type.toLowerCase().includes(q) ||
          t.paymentType.toLowerCase().includes(q)
        );
      }

      return true;
    }).sort((a, b) => (b.date > a.date ? 1 : -1));
  }, [safePurchaseBills, safePurchaseReturns, selectedFirm, startDate, endDate, search]);

  const purchasePaidTotal = useMemo(() => {
    return filteredPurchases.reduce((sum, t) => sum + t.paidAmount, 0);
  }, [filteredPurchases]);

  const purchaseUnpaidTotal = useMemo(() => {
    return filteredPurchases.reduce((sum, t) => sum + t.balanceDue, 0);
  }, [filteredPurchases]);

  const purchaseTotalAmount = useMemo(() => {
    return purchasePaidTotal + purchaseUnpaidTotal;
  }, [purchasePaidTotal, purchaseUnpaidTotal]);

  // Accurate Payment Breakdown Calculations for Purchases
  const cashPurchasesTotal = useMemo(() => {
    return filteredPurchases
      .filter(p => (p.paymentType || 'CASH').toUpperCase() === 'CASH')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }, [filteredPurchases]);

  const digitalPurchasesTotal = useMemo(() => {
    return filteredPurchases
      .filter(p => {
        const pm = (p.paymentType || '').toUpperCase();
        return pm === 'UPI' || pm === 'CARD' || pm === 'BANK' || pm === 'DIGITAL';
      })
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }, [filteredPurchases]);

  const creditPurchasesTotal = useMemo(() => {
    return filteredPurchases
      .filter(p => {
        const pm = (p.paymentType || '').toUpperCase();
        return pm === 'CREDIT' || p.balanceDue > 0;
      })
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }, [filteredPurchases]);

  const previousMonthPurchaseTotal = useMemo(() => {
    const prevDates = getPresetDates('last_month');
    const prevBills = safePurchaseBills.filter(b => {
      if (!b) return false;
      const bTenant = b.tenantId || 'default-tenant';
      if (selectedFirm !== 'all' && bTenant !== selectedFirm) return false;
      const bDate = b.billDate || (b.createdAt ? b.createdAt.split('T')[0] : '');
      return bDate >= prevDates.startDate && bDate <= prevDates.endDate;
    }).reduce((sum, b) => sum + Number(b.grandTotal || 0), 0);

    const prevReturns = safePurchaseReturns.filter(r => {
      if (!r) return false;
      const rTenant = r.tenantId || 'default-tenant';
      if (selectedFirm !== 'all' && rTenant !== selectedFirm) return false;
      const rDate = r.returnDate || (r.createdAt ? r.createdAt.split('T')[0] : '');
      return rDate >= prevDates.startDate && rDate <= prevDates.endDate;
    }).reduce((sum, r) => sum + Number(r.grandTotal || 0), 0);

    return prevBills + prevReturns;
  }, [safePurchaseBills, safePurchaseReturns, selectedFirm]);

  const purchaseGrowthPercent = useMemo(() => {
    if (previousMonthPurchaseTotal === 0) return 100;
    const diff = purchaseTotalAmount - previousMonthPurchaseTotal;
    return Math.round((diff / previousMonthPurchaseTotal) * 100);
  }, [purchaseTotalAmount, previousMonthPurchaseTotal]);

  const handleExportPurchaseCSV = () => {
    if (filteredPurchases.length === 0) {
      alert('No purchase transactions available to export for the selected date range.');
      return;
    }

    const headers = ['Date', 'Invoice No', 'Party Name', 'Transaction', 'Payment Type', 'Total Amount (Rs)', 'Balance Due (Rs)'];
    const rows = filteredPurchases.map(p => [
      p.date || '-',
      `"${p.invoiceNo}"`,
      `"${p.partyName}"`,
      p.type,
      p.paymentType,
      p.amount.toFixed(2),
      p.balanceDue.toFixed(2)
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Purchase_Report_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="flex-1 flex h-full bg-[#f3f4f6] overflow-hidden select-none">
      {/* ----------------- LEFT SUB-SIDEBAR ----------------- */}
      <div className="w-60 bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-wide">Reports</h2>
        </div>

        <div className="flex-1 py-2">
          {REPORT_SECTIONS.map((sec, secIdx) => (
            <div key={secIdx} className="mb-4">
              <div className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider px-4 py-1.5">
                {sec.title}
              </div>
              <div className="space-y-0.5">
                {sec.items.map(item => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full text-left px-4 py-2 text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-blue-50/80 text-blue-700 font-extrabold border-r-4 border-blue-600'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ----------------- RIGHT MAIN CONTENT AREA ----------------- */}
      <div className="flex-1 flex flex-col overflow-y-auto p-5 sm:p-6 gap-5">
        {/* ================= SALE REPORT ================= */}
        {activeTab === 'sale' && (
          <>
            {/* Header Row */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <span>Sale Invoices</span>
                </h1>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">
                  Summarizes all outgoing sales and revenue generated over specified date ranges.
                </p>
              </div>

              {onAddSale && (
                <button
                  onClick={onAddSale}
                  className="bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>Add Sale</span>
                </button>
              )}
            </div>

            {/* Filter Bar Controls */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                {/* Preset Dropdown */}
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-bold">Filter by:</span>
                  <select
                    value={datePreset}
                    onChange={e => handlePresetChange(e.target.value as DatePreset)}
                    aria-label="Filter date range preset"
                    className="h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-bold outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="this_month">This Month</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="this_week">This Week</option>
                    <option value="last_month">Last Month</option>
                    <option value="this_quarter">This Quarter</option>
                    <option value="this_year">This Year</option>
                    <option value="custom">Custom Date</option>
                  </select>
                </div>

                {/* Date Inputs Display */}
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => {
                      setStartDate(e.target.value);
                      setDatePreset('custom');
                    }}
                    aria-label="Start date"
                    className="bg-transparent font-mono text-slate-700 font-bold outline-none text-xs"
                  />
                  <span className="text-slate-400 font-bold">To</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => {
                      setEndDate(e.target.value);
                      setDatePreset('custom');
                    }}
                    aria-label="End date"
                    className="bg-transparent font-mono text-slate-700 font-bold outline-none text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Summary KPI Card matching reference UI */}
            <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                    Total Sales Amount
                  </div>
                  <div className="text-3xl font-mono font-black text-slate-900 mt-1">
                    Rs {totalSalesAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Percentage Growth Metric */}
                <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-1 text-xs font-black flex items-center gap-1">
                  <ArrowUpRight className="w-3.5 h-3.5 stroke-[3]" />
                  <span>{growthPercent >= 0 ? `${growthPercent}%` : `${growthPercent}%`}</span>
                  <span className="text-[10px] text-emerald-600 font-bold ml-0.5">vs last month</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-slate-200 text-xs font-semibold">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <span>Received:</span>
                  <span className="font-mono font-black text-emerald-600">
                    Rs {totalReceivedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-slate-600">
                  <span>Balance:</span>
                  <span className={`font-mono font-black ${totalBalanceAmount > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                    Rs {totalBalanceAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Visual Sales Graph (Collapsible) */}
            {showChart && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-blue-600" />
                    <span>Visual Payment Breakdown</span>
                  </h3>
                  <button onClick={() => setShowChart(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
                  <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl space-y-1">
                    <div className="text-emerald-800 font-bold text-[11px] uppercase">Cash & Paid Sales</div>
                    <div className="text-lg font-black text-emerald-700">
                      Rs {collectedSalesTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-xl space-y-1">
                    <div className="text-blue-800 font-bold text-[11px] uppercase">Digital / Card / UPI</div>
                    <div className="text-lg font-black text-blue-700">
                      Rs {digitalSalesTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl space-y-1">
                    <div className="text-amber-800 font-bold text-[11px] uppercase">Credit / Unpaid Dues</div>
                    <div className="text-lg font-black text-amber-700">
                      Rs {creditUnpaidDuesTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Transactions Table Section */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">
                  Transactions ({filteredInvoices.length})
                </h3>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search party, invoice no..."
                      className="h-8 pl-8 pr-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-blue-500 w-44 sm:w-56"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>

                  <button
                    onClick={() => setShowChart(!showChart)}
                    title="Toggle Visual Chart"
                    className={`h-8 w-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                      showChart ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <BarChart3 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={handleExportSaleCSV}
                    title="Export to Excel CSV"
                    className="h-8 px-2.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Excel</span>
                  </button>

                  <button
                    onClick={handlePrintReport}
                    title="Print Report"
                    className="h-8 w-8 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="vyapar-table w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 text-slate-500 text-[11px] font-extrabold uppercase tracking-wider border-b border-slate-200">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Invoice no</th>
                      <th className="py-3 px-4">Party Name</th>
                      <th className="py-3 px-4">Transaction</th>
                      <th className="py-3 px-4">Payment Type</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4 text-right">Balance</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                    {filteredInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-slate-400 font-semibold">
                          No sale transactions found for the selected date range.
                        </td>
                      </tr>
                    ) : (
                      filteredInvoices.map(inv => {
                        const dueAmt = inv.dueAmount !== undefined ? Number(inv.dueAmount) : (inv.paymentStatus === 'PAID' ? 0 : Number(inv.grandTotal || 0));
                        return (
                          <tr key={inv.id || inv.invoiceNumber} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                              {formatDateDisplay(inv.invoiceDate || (inv.createdAt ? inv.createdAt.split('T')[0] : ''))}
                            </td>
                            <td className="py-3 px-4 font-mono font-extrabold text-blue-600 whitespace-nowrap">
                              {inv.invoiceNumber || 'INV-000'}
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-800">
                              {inv.partyName || 'Walk-in Retail Customer'}
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 text-[10px] font-extrabold bg-blue-50 text-blue-700 rounded border border-blue-200">
                                Sale
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-slate-700">
                              <span className="px-2 py-0.5 text-[10px] rounded bg-slate-100 border border-slate-200">
                                {inv.paymentMethod || 'CASH'}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono font-black text-slate-900 text-right whitespace-nowrap">
                              Rs {Number(inv.grandTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-4 font-mono font-black text-right whitespace-nowrap">
                              <span className={dueAmt > 0 ? 'text-amber-600 font-extrabold' : 'text-slate-500'}>
                                Rs {dueAmt.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1.5 text-slate-400">
                                <button
                                  onClick={() => triggerThermalPrint(inv, business)}
                                  title="Print Receipt"
                                  className="p-1 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    const shareText = `Invoice #${inv.invoiceNumber} - ${inv.partyName} - Amount: Rs ${inv.grandTotal}`;
                                    navigator.clipboard?.writeText(shareText);
                                    alert('Invoice details copied to clipboard!');
                                  }}
                                  title="Share / Copy"
                                  className="p-1 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors cursor-pointer"
                                >
                                  <Share2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ================= PURCHASE REPORT ================= */}
        {activeTab === 'purchase' && (
          <>
            {/* Header Row */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <span>Purchase Bills</span>
                </h1>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">
                  Tracks all incoming stock purchases and vendor inventory acquisitions.
                </p>
              </div>

              {onAddPurchase && (
                <button
                  onClick={onAddPurchase}
                  className="bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>Add Purchase</span>
                </button>
              )}
            </div>

            {/* Filter Bar Controls matching Sale UI */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                {/* Preset Dropdown */}
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-bold">Filter by:</span>
                  <select
                    value={datePreset}
                    onChange={e => handlePresetChange(e.target.value as DatePreset)}
                    aria-label="Filter date range preset"
                    className="h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-bold outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="this_month">This Month</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="this_week">This Week</option>
                    <option value="last_month">Last Month</option>
                    <option value="this_quarter">This Quarter</option>
                    <option value="this_year">This Year</option>
                    <option value="custom">Custom Date</option>
                  </select>
                </div>

                {/* Date Inputs Display matching Sale UI */}
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => {
                      setStartDate(e.target.value);
                      setDatePreset('custom');
                    }}
                    aria-label="Start date"
                    className="bg-transparent font-mono text-slate-700 font-bold outline-none text-xs"
                  />
                  <span className="text-slate-400 font-bold">To</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => {
                      setEndDate(e.target.value);
                      setDatePreset('custom');
                    }}
                    aria-label="End date"
                    className="bg-transparent font-mono text-slate-700 font-bold outline-none text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Summary KPI Card matching Sale UI design */}
            <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                    Total Purchase Amount
                  </div>
                  <div className="text-3xl font-mono font-black text-slate-900 mt-1">
                    Rs {purchaseTotalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Percentage Growth Metric */}
                <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-1 text-xs font-black flex items-center gap-1">
                  <ArrowUpRight className="w-3.5 h-3.5 stroke-[3]" />
                  <span>{purchaseGrowthPercent >= 0 ? `${purchaseGrowthPercent}%` : `${purchaseGrowthPercent}%`}</span>
                  <span className="text-[10px] text-emerald-600 font-bold ml-0.5">vs last month</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-slate-200 text-xs font-semibold">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <span>Paid:</span>
                  <span className="font-mono font-black text-emerald-600">
                    Rs {purchasePaidTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-slate-600">
                  <span>Balance:</span>
                  <span className={`font-mono font-black ${purchaseUnpaidTotal > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                    Rs {purchaseUnpaidTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Visual Purchase Graph (Collapsible) matching Sale UI */}
            {showChart && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-blue-600" />
                    <span>Visual Purchase & Expense Breakdown</span>
                  </h3>
                  <button onClick={() => setShowChart(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
                  <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl space-y-1">
                    <div className="text-emerald-800 font-bold text-[11px] uppercase">Cash Purchases</div>
                    <div className="text-lg font-black text-emerald-700">
                      Rs {cashPurchasesTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-xl space-y-1">
                    <div className="text-blue-800 font-bold text-[11px] uppercase">Digital / Card / Bank</div>
                    <div className="text-lg font-black text-blue-700">
                      Rs {digitalPurchasesTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl space-y-1">
                    <div className="text-amber-800 font-bold text-[11px] uppercase">Credit / Vendor Dues</div>
                    <div className="text-lg font-black text-amber-700">
                      Rs {creditPurchasesTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Transactions Table Section matching Sale UI */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">
                  Transactions ({filteredPurchases.length})
                </h3>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search vendor, bill no..."
                      className="h-8 pl-8 pr-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-blue-500 w-44 sm:w-56"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>

                  <button
                    onClick={() => setShowChart(!showChart)}
                    title="Toggle Visual Chart"
                    className={`h-8 w-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                      showChart ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <BarChart3 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={handleExportPurchaseCSV}
                    title="Export to Excel CSV"
                    className="h-8 px-2.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Excel</span>
                  </button>

                  <button
                    onClick={handlePrintReport}
                    title="Print Report"
                    className="h-8 w-8 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="vyapar-table w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 text-slate-500 text-[11px] font-extrabold uppercase tracking-wider border-b border-slate-200">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Invoice no</th>
                      <th className="py-3 px-4">Party Name</th>
                      <th className="py-3 px-4">Transaction</th>
                      <th className="py-3 px-4">Payment Type</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4 text-right">Balance</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                    {filteredPurchases.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-slate-400 font-semibold">
                          No purchase transactions found for the selected date range.
                        </td>
                      </tr>
                    ) : (
                      filteredPurchases.map(txn => (
                        <tr key={`${txn.type}-${txn.id}`} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                            {formatDateDisplay(txn.date)}
                          </td>
                          <td className="py-3 px-4 font-mono font-extrabold text-blue-600 whitespace-nowrap">
                            {txn.invoiceNo}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800">
                            {txn.partyName}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-extrabold rounded border ${
                                txn.type === 'Purchase'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-purple-50 text-purple-700 border-purple-200'
                              }`}
                            >
                              {txn.type}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-700">
                            <span className="px-2 py-0.5 text-[10px] rounded bg-slate-100 border border-slate-200">
                              {txn.paymentType}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-black text-slate-900 text-right whitespace-nowrap">
                            Rs {txn.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 font-mono font-black text-right whitespace-nowrap">
                            <span className={txn.balanceDue > 0 ? 'text-amber-600 font-extrabold' : 'text-slate-500'}>
                              Rs {txn.balanceDue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5 text-slate-400">
                              <button
                                onClick={handlePrintReport}
                                title="Print Receipt"
                                className="p-1 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  const shareText = `Purchase Bill #${txn.invoiceNo} - ${txn.partyName} - Amount: Rs ${txn.amount}`;
                                  navigator.clipboard?.writeText(shareText);
                                  alert('Purchase bill details copied to clipboard!');
                                }}
                                title="Share / Copy"
                                className="p-1 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors cursor-pointer"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ================= OTHER REPORT TABS PLACEHOLDER ================= */}
        {activeTab !== 'sale' && activeTab !== 'purchase' && (
          <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm flex flex-col items-center justify-center text-center my-auto min-h-[400px]">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-4">
              <FileText className="w-7 h-7 stroke-[2]" />
            </div>
            <h2 className="text-lg font-black text-slate-800 capitalize">
              {activeTab.replace(/-/g, ' ')} Report
            </h2>
            <p className="text-xs text-slate-500 max-w-sm mt-1 font-medium">
              This report view is ready and scheduled for activation in the next phase of report module updates.
            </p>
            <button
              onClick={() => setActiveTab('sale')}
              className="mt-5 text-xs font-extrabold text-blue-600 hover:text-blue-700 bg-blue-50 border border-blue-200 px-4 py-2 rounded-xl transition-colors cursor-pointer"
            >
              ← Back to Sale Report
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
