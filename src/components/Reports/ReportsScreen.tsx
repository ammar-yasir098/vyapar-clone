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
  PieChart,
  ChevronLeft,
  ChevronRight,
  MoreVertical
} from 'lucide-react';
import { Invoice, BusinessDetails, PurchaseBill, PurchaseReturn, PaymentIn, PaymentOut, Expense, SaleReturn, CashTransaction } from '../../types';
import { triggerThermalPrint } from '../../services/printer';

interface ReportsScreenProps {
  invoices?: Invoice[];
  purchaseBills?: PurchaseBill[];
  purchaseReturns?: PurchaseReturn[];
  paymentsIn?: PaymentIn[];
  paymentsOut?: PaymentOut[];
  expenses?: Expense[];
  saleReturns?: SaleReturn[];
  cashTransactions?: CashTransaction[];
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

// Helper to format date string as YYYY-MM-DD in local time
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

// Helper to extract YYYY-MM-DD & HH:MM in LOCAL TIMEZONE avoiding UTC offset shifts
function parseLocalDate(dateStr?: string, createdAtStr?: string): { dateISO: string; timeStr: string } {
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    let timeStr = '12:00';
    if (createdAtStr) {
      const d = new Date(createdAtStr);
      if (!isNaN(d.getTime())) {
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        timeStr = `${hours}:${minutes}`;
      }
    }
    return { dateISO: dateStr, timeStr };
  }

  const target = createdAtStr || dateStr;
  if (target) {
    const d = new Date(target);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return {
        dateISO: `${year}-${month}-${day}`,
        timeStr: `${hours}:${minutes}`
      };
    }
  }

  const now = new Date();
  return {
    dateISO: formatDateISO(now),
    timeStr: '12:00'
  };
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
  paymentsIn = [],
  paymentsOut = [],
  expenses = [],
  saleReturns = [],
  cashTransactions = [],
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
  
  // Day Book Single Date State (Defaults to Today)
  const [dayBookDate, setDayBookDate] = useState<string>(formatDateISO(new Date()));

  // All Transactions Filters State
  const [allTxnsFirmFilter, setAllTxnsFirmFilter] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');

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
  const safePaymentsIn = Array.isArray(paymentsIn) ? paymentsIn : [];
  const safePaymentsOut = Array.isArray(paymentsOut) ? paymentsOut : [];
  const safeExpenses = Array.isArray(expenses) ? expenses : [];
  const safeSaleReturns = Array.isArray(saleReturns) ? saleReturns : [];
  const safeCashTransactions = Array.isArray(cashTransactions) ? cashTransactions : [];

  // Handle Preset Change
  const handlePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    if (preset !== 'custom') {
      const dates = getPresetDates(preset);
      setStartDate(dates.startDate);
      setEndDate(dates.endDate);
    }
  };

  // Date Navigation Helpers for Day Book
  const handlePrevDay = () => {
    const cur = new Date(dayBookDate);
    cur.setDate(cur.getDate() - 1);
    setDayBookDate(formatDateISO(cur));
  };

  const handleNextDay = () => {
    const cur = new Date(dayBookDate);
    cur.setDate(cur.getDate() + 1);
    setDayBookDate(formatDateISO(cur));
  };

  const handleToday = () => {
    setDayBookDate(formatDateISO(new Date()));
  };

  // ----------------- SALE REPORT DATA -----------------
  // 1. Unified Normalization for Sales
  const normalizedSales = useMemo(() => {
    return safeInvoices.map(inv => {
      const grand = Number(inv.grandTotal || 0);
      const rec = Number(inv.receivedAmount ?? (inv.paymentStatus === 'PAID' ? grand : 0));
      const due = Number(inv.dueAmount ?? (grand - rec));
      const { dateISO } = parseLocalDate(inv.invoiceDate, inv.createdAt);

      return {
        id: `sale-${inv.id || inv.invoiceNumber}`,
        date: dateISO,
        invoiceNumber: inv.invoiceNumber || 'INV-000',
        partyName: inv.partyName || 'Walk-in Retail Customer',
        type: 'Sale' as const,
        paymentMethod: inv.paymentMethod || 'CASH',
        grandTotal: grand,
        receivedAmount: rec,
        dueAmount: due,
        paymentStatus: inv.paymentStatus || (due <= 0 ? 'PAID' : (rec > 0 ? 'PARTIAL' : 'UNPAID')),
        tenantId: inv.tenantId || 'default-tenant',
        rawInvoice: inv
      };
    }).filter(inv => {
      if (selectedFirm !== 'all' && inv.tenantId !== selectedFirm) return false;
      if (startDate && inv.date < startDate) return false;
      if (endDate && inv.date > endDate) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        return (
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.partyName.toLowerCase().includes(q) ||
          inv.paymentMethod.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [safeInvoices, selectedFirm, startDate, endDate, search]);

  // 2. Integration of Sale Returns (Credit Notes) into Sale Report
  const normalizedSaleReturns = useMemo(() => {
    return safeSaleReturns.map(sr => {
      const grand = Number(sr.grandTotal || 0);
      const refund = Number(sr.refundAmount ?? grand);
      const { dateISO } = parseLocalDate(sr.returnDate, sr.createdAt);

      return {
        id: `ret-${sr.id || sr.creditNoteNumber}`,
        date: dateISO,
        invoiceNumber: sr.creditNoteNumber || 'CN-000',
        partyName: sr.partyName || 'Retail Customer',
        type: 'Credit Note' as const,
        paymentMethod: 'CASH',
        grandTotal: grand,
        receivedAmount: refund,
        dueAmount: 0,
        paymentStatus: 'REFUNDED',
        tenantId: sr.tenantId || 'default-tenant',
        rawInvoice: undefined
      };
    }).filter(sr => {
      if (selectedFirm !== 'all' && sr.tenantId !== selectedFirm) return false;
      if (startDate && sr.date < startDate) return false;
      if (endDate && sr.date > endDate) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        return (
          sr.invoiceNumber.toLowerCase().includes(q) ||
          sr.partyName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [safeSaleReturns, selectedFirm, startDate, endDate, search]);

  // All Sale Items (Invoices + Credit Notes) for Table Render
  const filteredInvoices = useMemo(() => {
    return [...normalizedSales, ...normalizedSaleReturns].sort((a, b) => (b.date > a.date ? 1 : -1));
  }, [normalizedSales, normalizedSaleReturns]);

  // Net Sales Computations (Gross Sales - Sale Returns)
  const grossSalesTotal = useMemo(() => {
    return normalizedSales.reduce((sum, inv) => sum + inv.grandTotal, 0);
  }, [normalizedSales]);

  const saleReturnsTotal = useMemo(() => {
    return normalizedSaleReturns.reduce((sum, sr) => sum + sr.grandTotal, 0);
  }, [normalizedSaleReturns]);

  const totalSalesAmount = useMemo(() => {
    return grossSalesTotal - saleReturnsTotal;
  }, [grossSalesTotal, saleReturnsTotal]);

  const totalReceivedAmount = useMemo(() => {
    const invRec = normalizedSales.reduce((sum, inv) => sum + inv.receivedAmount, 0);
    const retRef = normalizedSaleReturns.reduce((sum, sr) => sum + sr.receivedAmount, 0);
    return invRec - retRef;
  }, [normalizedSales, normalizedSaleReturns]);

  const totalBalanceAmount = useMemo(() => {
    return normalizedSales.reduce((sum, inv) => sum + inv.dueAmount, 0);
  }, [normalizedSales]);

  const collectedSalesTotal = useMemo(() => totalReceivedAmount, [totalReceivedAmount]);

  const digitalSalesTotal = useMemo(() => {
    return normalizedSales
      .filter(i => {
        const pm = (i.paymentMethod || '').toUpperCase();
        return pm === 'UPI' || pm === 'CARD' || pm === 'DIGITAL / APP' || pm === 'CHEQUE' || pm === 'BANK' || pm === 'ONLINE';
      })
      .reduce((sum, i) => sum + i.grandTotal, 0);
  }, [normalizedSales]);

  const creditUnpaidDuesTotal = useMemo(() => totalBalanceAmount, [totalBalanceAmount]);

  const previousMonthSalesTotal = useMemo(() => {
    const prevDates = getPresetDates('last_month');
    return safeInvoices
      .filter(inv => {
        if (!inv) return false;
        const invTenant = inv.tenantId || 'default-tenant';
        if (selectedFirm !== 'all' && invTenant !== selectedFirm) return false;
        const { dateISO } = parseLocalDate(inv.invoiceDate, inv.createdAt);
        return dateISO >= prevDates.startDate && dateISO <= prevDates.endDate;
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
    const rows = filteredInvoices.map(inv => [
      formatDateDisplay(inv.date),
      `"${inv.invoiceNumber}"`,
      `"${inv.partyName}"`,
      inv.type,
      inv.paymentMethod,
      inv.grandTotal.toFixed(2),
      inv.dueAmount.toFixed(2),
      inv.paymentStatus
    ]);

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
  // Dynamic Payment Type & Debit Note Return Accounting
  const filteredPurchases = useMemo(() => {
    const billsMapped = safePurchaseBills.map(b => {
      const { dateISO } = parseLocalDate(b.billDate, b.createdAt);
      const grand = Number(b.grandTotal || 0);
      const paid = Number(b.paidAmount ?? (b.paymentStatus === 'PAID' ? grand : 0));
      const due = Number(b.dueAmount ?? (grand - paid));
      const pm = (b as any).paymentMethod || (paid >= grand ? 'CASH' : (paid > 0 ? 'PARTIAL' : 'CREDIT'));

      return {
        id: b.id || b.billNumber,
        date: dateISO,
        invoiceNo: b.billNumber || '-',
        partyName: b.supplierName || 'Vendor / Supplier',
        type: 'Purchase' as const,
        paymentType: pm,
        amount: grand,
        paidAmount: paid,
        balanceDue: due,
        tenantId: b.tenantId || 'default-tenant'
      };
    });

    const returnsMapped = safePurchaseReturns.map(r => {
      const { dateISO } = parseLocalDate(r.returnDate, r.createdAt);
      const grand = Number(r.grandTotal || 0);
      return {
        id: r.id || r.debitNoteNumber,
        date: dateISO,
        invoiceNo: r.debitNoteNumber || r.purchaseBillNumber || '-',
        partyName: r.supplierName || 'Vendor / Supplier',
        type: 'Debit Note' as const,
        paymentType: 'CASH',
        amount: grand,
        paidAmount: grand,
        balanceDue: 0,
        tenantId: r.tenantId || 'default-tenant'
      };
    });

    const allTxns = [...billsMapped, ...returnsMapped];

    return allTxns.filter(t => {
      if (selectedFirm !== 'all' && t.tenantId !== selectedFirm) return false;
      if (startDate && t.date < startDate) return false;
      if (endDate && t.date > endDate) return false;

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

  const grossPurchaseBillsTotal = useMemo(() => {
    return filteredPurchases
      .filter(p => p.type === 'Purchase')
      .reduce((sum, p) => sum + p.amount, 0);
  }, [filteredPurchases]);

  const debitNotesTotal = useMemo(() => {
    return filteredPurchases
      .filter(p => p.type === 'Debit Note')
      .reduce((sum, p) => sum + p.amount, 0);
  }, [filteredPurchases]);

  const purchaseTotalAmount = useMemo(() => {
    return grossPurchaseBillsTotal - debitNotesTotal;
  }, [grossPurchaseBillsTotal, debitNotesTotal]);

  const purchasePaidTotal = useMemo(() => {
    const billsPaid = filteredPurchases
      .filter(p => p.type === 'Purchase')
      .reduce((sum, p) => sum + p.paidAmount, 0);
    return billsPaid - debitNotesTotal;
  }, [filteredPurchases, debitNotesTotal]);

  const purchaseUnpaidTotal = useMemo(() => {
    return filteredPurchases
      .filter(p => p.type === 'Purchase')
      .reduce((sum, p) => sum + p.balanceDue, 0);
  }, [filteredPurchases]);

  const cashPurchasesTotal = useMemo(() => {
    return filteredPurchases
      .filter(p => p.type === 'Purchase' && (p.paymentType || 'CASH').toUpperCase() === 'CASH')
      .reduce((sum, p) => sum + p.amount, 0);
  }, [filteredPurchases]);

  const digitalPurchasesTotal = useMemo(() => {
    return filteredPurchases
      .filter(p => {
        const pm = (p.paymentType || '').toUpperCase();
        return p.type === 'Purchase' && (pm === 'UPI' || pm === 'CARD' || pm === 'BANK' || pm === 'DIGITAL');
      })
      .reduce((sum, p) => sum + p.amount, 0);
  }, [filteredPurchases]);

  const creditPurchasesTotal = useMemo(() => {
    return filteredPurchases
      .filter(p => p.type === 'Purchase' && ((p.paymentType || '').toUpperCase() === 'CREDIT' || p.balanceDue > 0))
      .reduce((sum, p) => sum + p.amount, 0);
  }, [filteredPurchases]);

  const previousMonthPurchaseTotal = useMemo(() => {
    const prevDates = getPresetDates('last_month');
    const prevBills = safePurchaseBills.filter(b => {
      if (!b) return false;
      const bTenant = b.tenantId || 'default-tenant';
      if (selectedFirm !== 'all' && bTenant !== selectedFirm) return false;
      const { dateISO } = parseLocalDate(b.billDate, b.createdAt);
      return dateISO >= prevDates.startDate && dateISO <= prevDates.endDate;
    }).reduce((sum, b) => sum + Number(b.grandTotal || 0), 0);

    const prevReturns = safePurchaseReturns.filter(r => {
      if (!r) return false;
      const rTenant = r.tenantId || 'default-tenant';
      if (selectedFirm !== 'all' && rTenant !== selectedFirm) return false;
      const { dateISO } = parseLocalDate(r.returnDate, r.createdAt);
      return dateISO >= prevDates.startDate && dateISO <= prevDates.endDate;
    }).reduce((sum, r) => sum + Number(r.grandTotal || 0), 0);

    return prevBills - prevReturns;
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
      formatDateDisplay(p.date),
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

  // ----------------- DAY BOOK REPORT AGGREGATION DATA -----------------
  const dayBookTransactions = useMemo(() => {
    const targetDate = dayBookDate;

    // 1. Sales / Invoices
    const sales = safeInvoices.map(inv => {
      const { dateISO, timeStr } = parseLocalDate(inv.invoiceDate, inv.createdAt);
      const tot = Number(inv.grandTotal || 0);
      const rec = Number(inv.receivedAmount ?? (inv.paymentStatus === 'PAID' ? inv.grandTotal : 0));

      return {
        id: `sale-${inv.id || inv.invoiceNumber}`,
        date: dateISO,
        time: timeStr,
        partyName: inv.partyName || 'Walk-in Retail Customer',
        refNo: inv.invoiceNumber || 'INV-000',
        type: 'Sale',
        paymentMode: inv.paymentMethod || 'Cash',
        totalAmount: tot,
        moneyIn: rec,
        moneyOut: null as number | null,
        tenantId: inv.tenantId || 'default-tenant'
      };
    });

    // 2. Purchases / Bills
    const purchases = safePurchaseBills.map(b => {
      const { dateISO, timeStr } = parseLocalDate(b.billDate, b.createdAt);
      const tot = Number(b.grandTotal || 0);
      const paid = Number(b.paidAmount || 0);

      return {
        id: `pur-${b.id || b.billNumber}`,
        date: dateISO,
        time: timeStr,
        partyName: b.supplierName || 'Vendor / Supplier',
        refNo: b.billNumber || '',
        type: 'Purchase',
        paymentMode: (b as any).paymentMethod || (paid >= tot ? 'Cash' : (paid > 0 ? 'Partial' : 'Credit')),
        totalAmount: tot,
        moneyIn: null as number | null,
        moneyOut: paid,
        tenantId: b.tenantId || 'default-tenant'
      };
    });

    // 3. Customer Receipts (Payment-In)
    const payIns = safePaymentsIn.map(p => {
      const { dateISO, timeStr } = parseLocalDate(p.paymentDate, p.createdAt);
      const amt = Number(p.amount || 0);

      return {
        id: `payin-${p.id || p.receiptNumber}`,
        date: dateISO,
        time: timeStr,
        partyName: p.partyName || 'Customer Receipt',
        refNo: p.receiptNumber || '',
        type: 'Payment-In',
        paymentMode: p.paymentMethod || 'Cash',
        totalAmount: amt,
        moneyIn: amt,
        moneyOut: null as number | null,
        tenantId: p.tenantId || 'default-tenant'
      };
    });

    // 4. Vendor Payments (Payment-Out)
    const payOuts = safePaymentsOut.map(po => {
      const { dateISO, timeStr } = parseLocalDate(po.paymentDate, po.createdAt);
      const amt = Number(po.amount || 0);

      return {
        id: `payout-${po.id || po.receiptNumber}`,
        date: dateISO,
        time: timeStr,
        partyName: po.partyName || 'Supplier Payment',
        refNo: po.receiptNumber || '',
        type: 'Payment-Out',
        paymentMode: po.paymentMethod || 'Cash',
        totalAmount: amt,
        moneyIn: null as number | null,
        moneyOut: amt,
        tenantId: po.tenantId || 'default-tenant'
      };
    });

    // 5. Expenses
    const exps = safeExpenses.map(e => {
      const { dateISO, timeStr } = parseLocalDate(e.expenseDate, e.createdAt);
      const amt = Number(e.amount || 0);

      return {
        id: `exp-${e.id || e.expenseNumber}`,
        date: dateISO,
        time: timeStr,
        partyName: e.categoryName || e.notes || 'Business Expense',
        refNo: e.expenseNumber || '',
        type: 'Expense',
        paymentMode: e.paymentMode || 'Cash',
        totalAmount: amt,
        moneyIn: null as number | null,
        moneyOut: amt,
        tenantId: e.tenantId || 'default-tenant'
      };
    });

    // 6. Debit Notes (Purchase Returns)
    const purReturns = safePurchaseReturns.map(pr => {
      const { dateISO, timeStr } = parseLocalDate(pr.returnDate, pr.createdAt);
      const amt = Number(pr.grandTotal || 0);

      return {
        id: `pur-ret-${pr.id || pr.debitNoteNumber}`,
        date: dateISO,
        time: timeStr,
        partyName: pr.supplierName || 'Vendor / Supplier',
        refNo: pr.debitNoteNumber || '1',
        type: 'Debit Note',
        paymentMode: 'Cash',
        totalAmount: amt,
        moneyIn: amt,
        moneyOut: null as number | null,
        tenantId: pr.tenantId || 'default-tenant'
      };
    });

    // 7. Credit Notes (Sale Returns)
    const slReturns = safeSaleReturns.map(sr => {
      const { dateISO, timeStr } = parseLocalDate(sr.returnDate, sr.createdAt);
      const amt = Number(sr.grandTotal || 0);
      const refund = sr.refundAmount !== undefined ? Number(sr.refundAmount) : amt;

      return {
        id: `sale-ret-${sr.id || sr.creditNoteNumber}`,
        date: dateISO,
        time: timeStr,
        partyName: sr.partyName || 'Retail Customer',
        refNo: sr.creditNoteNumber || '',
        type: 'Sale Return',
        paymentMode: 'Cash',
        totalAmount: amt,
        moneyIn: null as number | null,
        moneyOut: refund,
        tenantId: sr.tenantId || 'default-tenant'
      };
    });

    // 8. Cash Adjustments (Manual Cash Entries)
    const manualCashAdjustments = safeCashTransactions
      .filter(ct => {
        const src = ct.source;
        return (
          src === 'MANUAL_ADJUSTMENT' ||
          src === 'BANK_DEPOSIT' ||
          src === 'BANK_WITHDRAWAL'
        );
      })
      .map(ct => {
        const { dateISO, timeStr } = parseLocalDate(ct.transactionDate, ct.createdAt);
        const amt = Number(ct.amount || 0);
        const isIncrease = ct.type === 'IN';

        return {
          id: `cash-adj-${ct.id}`,
          date: dateISO,
          time: timeStr,
          partyName: 'Cash Adjustment',
          refNo: '',
          type: isIncrease ? 'Cash Increase' : 'Cash Reduce',
          paymentMode: '',
          totalAmount: amt,
          moneyIn: isIncrease ? amt : null,
          moneyOut: isIncrease ? null : amt,
          tenantId: ct.tenantId || 'default-tenant'
        };
      });

    const combined = [
      ...sales,
      ...purchases,
      ...payIns,
      ...payOuts,
      ...exps,
      ...purReturns,
      ...slReturns,
      ...manualCashAdjustments
    ];

    const filtered = combined.filter(item => {
      if (selectedFirm !== 'all' && item.tenantId !== selectedFirm) return false;
      if (item.date !== targetDate) return false;

      if (search.trim()) {
        const q = search.toLowerCase().trim();
        return (
          item.refNo.toLowerCase().includes(q) ||
          item.partyName.toLowerCase().includes(q) ||
          item.type.toLowerCase().includes(q) ||
          item.paymentMode.toLowerCase().includes(q)
        );
      }
      return true;
    });

    return filtered.sort((a, b) => a.time.localeCompare(b.time));
  }, [dayBookDate, safeInvoices, safePurchaseBills, safePaymentsIn, safePaymentsOut, safeExpenses, safePurchaseReturns, safeSaleReturns, safeCashTransactions, selectedFirm, search]);

  const dayBookMoneyInTotal = useMemo(() => {
    return dayBookTransactions.reduce((sum, t) => sum + (t.moneyIn || 0), 0);
  }, [dayBookTransactions]);

  const dayBookMoneyOutTotal = useMemo(() => {
    return dayBookTransactions.reduce((sum, t) => sum + (t.moneyOut || 0), 0);
  }, [dayBookTransactions]);

  const dayBookNetBalance = useMemo(() => {
    return dayBookMoneyInTotal - dayBookMoneyOutTotal;
  }, [dayBookMoneyInTotal, dayBookMoneyOutTotal]);

  const handleExportDayBookCSV = () => {
    if (dayBookTransactions.length === 0) {
      alert(`No financial transactions logged for ${formatDateDisplay(dayBookDate)}.`);
      return;
    }

    const headers = ['NAME', 'REF NO.', 'TYPE', 'PAYMENT TYPE', 'TOTAL (Rs)', 'MONEY IN (Rs)', 'MONEY OUT (Rs)'];
    const rows = dayBookTransactions.map(t => [
      `"${t.partyName}"`,
      `"${t.refNo}"`,
      t.type,
      t.paymentMode,
      t.totalAmount.toFixed(2),
      t.moneyIn !== null ? t.moneyIn.toFixed(2) : '-',
      t.moneyOut !== null ? t.moneyOut.toFixed(2) : '-'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `DayBook_${dayBookDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ----------------- ALL TRANSACTIONS AGGREGATION & DATA -----------------
  // Schema: # | DATE | REF NO. | PARTY NAME | CATEGORY NAME | TYPE | TOTAL | RECEIVED / PAID | BALANCE | ACTIONS
  const allTransactionsData = useMemo(() => {
    // 1. Sales
    const sales = safeInvoices.map(inv => {
      const { dateISO, timeStr } = parseLocalDate(inv.invoiceDate, inv.createdAt);
      const grand = Number(inv.grandTotal || 0);
      const rec = Number(inv.receivedAmount ?? (inv.paymentStatus === 'PAID' ? grand : 0));
      const due = Number(inv.dueAmount ?? (grand - rec));

      return {
        id: `sale-${inv.id || inv.invoiceNumber}`,
        date: dateISO,
        time: timeStr,
        refNo: inv.invoiceNumber || '',
        partyName: inv.partyName || 'Walk-in Retail Customer',
        categoryName: '',
        type: 'Sale',
        paymentMode: inv.paymentMethod || 'Cash',
        totalAmount: grand,
        receivedPaidAmount: rec,
        balanceAmount: due,
        tenantId: inv.tenantId || 'default-tenant'
      };
    });

    // 2. Purchases
    const purchases = safePurchaseBills.map(b => {
      const { dateISO, timeStr } = parseLocalDate(b.billDate, b.createdAt);
      const grand = Number(b.grandTotal || 0);
      const paid = Number(b.paidAmount || 0);
      const due = Number(b.dueAmount ?? (grand - paid));
      const pm = (b as any).paymentMethod || (paid >= grand ? 'Cash' : (paid > 0 ? 'Partial' : 'Credit'));

      return {
        id: `pur-${b.id || b.billNumber}`,
        date: dateISO,
        time: timeStr,
        refNo: b.billNumber || '',
        partyName: b.supplierName || 'Vendor / Supplier',
        categoryName: '',
        type: 'Purchase',
        paymentMode: pm,
        totalAmount: grand,
        receivedPaidAmount: paid,
        balanceAmount: due,
        tenantId: b.tenantId || 'default-tenant'
      };
    });

    // 3. Payment-In
    const payIns = safePaymentsIn.map(p => {
      const { dateISO, timeStr } = parseLocalDate(p.paymentDate, p.createdAt);
      const amt = Number(p.amount || 0);

      return {
        id: `payin-${p.id || p.receiptNumber}`,
        date: dateISO,
        time: timeStr,
        refNo: p.receiptNumber || '',
        partyName: p.partyName || 'Customer Receipt',
        categoryName: '',
        type: 'Payment-In',
        paymentMode: p.paymentMethod || 'Cash',
        totalAmount: amt,
        receivedPaidAmount: amt,
        balanceAmount: 0,
        tenantId: p.tenantId || 'default-tenant'
      };
    });

    // 4. Payment-Out
    const payOuts = safePaymentsOut.map(po => {
      const { dateISO, timeStr } = parseLocalDate(po.paymentDate, po.createdAt);
      const amt = Number(po.amount || 0);

      return {
        id: `payout-${po.id || po.receiptNumber}`,
        date: dateISO,
        time: timeStr,
        refNo: po.receiptNumber || '',
        partyName: po.partyName || 'Supplier Payment',
        categoryName: '',
        type: 'Payment-Out',
        paymentMode: po.paymentMethod || 'Cash',
        totalAmount: amt,
        receivedPaidAmount: amt,
        balanceAmount: 0,
        tenantId: po.tenantId || 'default-tenant'
      };
    });

    // 5. Expenses
    const exps = safeExpenses.map(e => {
      const { dateISO, timeStr } = parseLocalDate(e.expenseDate, e.createdAt);
      const amt = Number(e.amount || 0);

      return {
        id: `exp-${e.id || e.expenseNumber}`,
        date: dateISO,
        time: timeStr,
        refNo: e.expenseNumber || '',
        partyName: '',
        categoryName: e.categoryName || e.notes || 'Rent / Expense',
        type: 'Expense',
        paymentMode: e.paymentMode || 'Cash',
        totalAmount: amt,
        receivedPaidAmount: amt,
        balanceAmount: 0,
        tenantId: e.tenantId || 'default-tenant'
      };
    });

    // 6. Debit Notes (Purchase Returns)
    const purReturns = safePurchaseReturns.map(pr => {
      const { dateISO, timeStr } = parseLocalDate(pr.returnDate, pr.createdAt);
      const grand = Number(pr.grandTotal || 0);

      return {
        id: `pur-ret-${pr.id || pr.debitNoteNumber}`,
        date: dateISO,
        time: timeStr,
        refNo: pr.debitNoteNumber || '1',
        partyName: pr.supplierName || 'Vendor / Supplier',
        categoryName: '',
        type: 'Debit Note',
        paymentMode: 'Cash',
        totalAmount: grand,
        receivedPaidAmount: grand,
        balanceAmount: 0,
        tenantId: pr.tenantId || 'default-tenant'
      };
    });

    // 7. Credit Notes (Sale Returns)
    const slReturns = safeSaleReturns.map(sr => {
      const { dateISO, timeStr } = parseLocalDate(sr.returnDate, sr.createdAt);
      const grand = Number(sr.grandTotal || 0);
      const refund = sr.refundAmount !== undefined ? Number(sr.refundAmount) : grand;

      return {
        id: `sale-ret-${sr.id || sr.creditNoteNumber}`,
        date: dateISO,
        time: timeStr,
        refNo: sr.creditNoteNumber || '',
        partyName: sr.partyName || 'Retail Customer',
        categoryName: '',
        type: 'Sale Return',
        paymentMode: 'Cash',
        totalAmount: grand,
        receivedPaidAmount: refund,
        balanceAmount: 0,
        tenantId: sr.tenantId || 'default-tenant'
      };
    });

    // 8. Cash Adjustments
    const manualCashAdjustments = safeCashTransactions
      .filter(ct => {
        const src = ct.source;
        return (
          src === 'MANUAL_ADJUSTMENT' ||
          src === 'BANK_DEPOSIT' ||
          src === 'BANK_WITHDRAWAL'
        );
      })
      .map(ct => {
        const { dateISO, timeStr } = parseLocalDate(ct.transactionDate, ct.createdAt);
        const amt = Number(ct.amount || 0);
        const isIncrease = ct.type === 'IN';

        return {
          id: `cash-adj-${ct.id}`,
          date: dateISO,
          time: timeStr,
          refNo: '',
          partyName: ct.description || (isIncrease ? 'Cash Increase' : 'Cash Reduce'),
          categoryName: 'Cash Adjustment',
          type: isIncrease ? 'Cash Increase' : 'Cash Reduce',
          paymentMode: 'Cash',
          totalAmount: amt,
          receivedPaidAmount: amt,
          balanceAmount: 0,
          tenantId: ct.tenantId || 'default-tenant'
        };
      });

    const combined = [
      ...sales,
      ...purchases,
      ...payIns,
      ...payOuts,
      ...exps,
      ...purReturns,
      ...slReturns,
      ...manualCashAdjustments
    ];

    const filtered = combined.filter(item => {
      if (allTxnsFirmFilter !== 'all' && item.tenantId !== allTxnsFirmFilter) return false;
      if (startDate && item.date < startDate) return false;
      if (endDate && item.date > endDate) return false;
      if (selectedTypeFilter !== 'all' && item.type.toLowerCase() !== selectedTypeFilter.toLowerCase()) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        return (
          item.refNo.toLowerCase().includes(q) ||
          item.partyName.toLowerCase().includes(q) ||
          item.categoryName.toLowerCase().includes(q) ||
          item.type.toLowerCase().includes(q)
        );
      }
      return true;
    });

    return filtered.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });
  }, [safeInvoices, safePurchaseBills, safePaymentsIn, safePaymentsOut, safeExpenses, safePurchaseReturns, safeSaleReturns, safeCashTransactions, allTxnsFirmFilter, startDate, endDate, selectedTypeFilter, search]);

  const handleExportAllTxnsCSV = () => {
    if (allTransactionsData.length === 0) {
      alert('No transactions available to export for the selected date range.');
      return;
    }

    const headers = ['#', 'DATE', 'REF NO.', 'PARTY NAME', 'CATEGORY NAME', 'TYPE', 'TOTAL (Rs)', 'RECEIVED / PAID (Rs)', 'BALANCE (Rs)'];
    const rows = allTransactionsData.map((t, idx) => [
      idx + 1,
      formatDateDisplay(t.date),
      `"${t.refNo}"`,
      `"${t.partyName}"`,
      `"${t.categoryName}"`,
      t.type,
      t.totalAmount.toFixed(2),
      t.receivedPaidAmount.toFixed(2),
      t.balanceAmount.toFixed(2)
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `All_Transactions_${startDate}_to_${endDate}.csv`);
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
                    Total Sales Amount (Net)
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
                  <span>Received (Net):</span>
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
                      filteredInvoices.map(inv => (
                        <tr key={`${inv.type}-${inv.id}`} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                            {formatDateDisplay(inv.date)}
                          </td>
                          <td className="py-3 px-4 font-mono font-extrabold text-blue-600 whitespace-nowrap">
                            {inv.invoiceNumber}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800">
                            {inv.partyName}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-extrabold rounded border ${
                                inv.type === 'Sale'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-purple-50 text-purple-700 border-purple-200'
                              }`}
                            >
                              {inv.type}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-700">
                            <span className="px-2 py-0.5 text-[10px] rounded bg-slate-100 border border-slate-200">
                              {inv.paymentMethod}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-black text-slate-900 text-right whitespace-nowrap">
                            Rs {inv.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 font-mono font-black text-right whitespace-nowrap">
                            <span className={inv.dueAmount > 0 ? 'text-amber-600 font-extrabold' : 'text-slate-500'}>
                              Rs {inv.dueAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5 text-slate-400">
                              {inv.rawInvoice && (
                                <button
                                  onClick={() => triggerThermalPrint(inv.rawInvoice!, business)}
                                  title="Print Receipt"
                                  className="p-1 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  const shareText = `${inv.type} #${inv.invoiceNumber} - ${inv.partyName} - Amount: Rs ${inv.grandTotal}`;
                                  navigator.clipboard?.writeText(shareText);
                                  alert('Transaction details copied to clipboard!');
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
                    Total Purchase Amount (Net)
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
                  <span>Paid (Net):</span>
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
                                  const shareText = `${txn.type} #${txn.invoiceNo} - ${txn.partyName} - Amount: Rs ${txn.amount}`;
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

        {/* ================= DAY BOOK REPORT ================= */}
        {activeTab === 'day-book' && (
          <>
            {/* Filter Bar Controls matching Reference UI */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                {/* Date Picker Input Badge matching Reference UI */}
                <div className="flex items-center bg-white border border-slate-300 rounded-lg overflow-hidden shadow-2xs">
                  <span className="bg-slate-500 text-white text-xs font-bold px-3 py-2">Date</span>
                  <input
                    type="date"
                    value={dayBookDate}
                    onChange={e => setDayBookDate(e.target.value)}
                    className="px-3 py-1.5 text-xs font-mono font-bold text-slate-800 outline-none cursor-pointer"
                  />
                </div>

                {/* Day Navigation Shortcuts */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={handlePrevDay}
                    title="Previous Day"
                    className="h-8 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Prev</span>
                  </button>
                  <button
                    onClick={handleToday}
                    title="Today"
                    className="h-8 px-3 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-black transition-colors cursor-pointer"
                  >
                    Today
                  </button>
                  <button
                    onClick={handleNextDay}
                    title="Next Day"
                    className="h-8 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Action Utilities (Excel & Print matching reference UI) */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportDayBookCSV}
                  title="Excel Report"
                  className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Excel Report</span>
                </button>

                <button
                  onClick={handlePrintReport}
                  title="Print"
                  className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-slate-600" />
                  <span>Print</span>
                </button>
              </div>
            </div>

            {/* Day Book Table Section matching Reference UI */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
              <div className="p-3.5 border-b border-slate-200 flex items-center">
                <div className="relative w-full max-w-sm">
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    aria-label="Search day book transactions"
                    placeholder="Search..."
                    className="h-8 pl-8 pr-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-blue-500 w-full"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="vyapar-table w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 text-slate-500 text-[11px] font-extrabold uppercase tracking-wider border-b border-slate-200">
                      <th className="py-3 px-4">NAME</th>
                      <th className="py-3 px-4">REF NO.</th>
                      <th className="py-3 px-4">TYPE</th>
                      <th className="py-3 px-4">PAYMENT TYPE</th>
                      <th className="py-3 px-4 text-right">TOTAL</th>
                      <th className="py-3 px-4 text-right">MONEY IN</th>
                      <th className="py-3 px-4 text-right">MONEY OUT</th>
                      <th className="py-3 px-4 text-center">PRINT / SHARE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                    {dayBookTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-slate-400 font-semibold">
                          No transactions found for {formatDateDisplay(dayBookDate)}.
                        </td>
                      </tr>
                    ) : (
                      dayBookTransactions.map(t => (
                        <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-800">
                            {t.partyName}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-700 whitespace-nowrap">
                            {t.refNo || ''}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-extrabold rounded border ${
                                t.type === 'Sale'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : t.type === 'Purchase'
                                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                                  : t.type === 'Payment-In'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : t.type === 'Payment-Out'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : t.type === 'Expense'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : t.type === 'Cash Increase'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : t.type === 'Cash Reduce'
                                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {t.type}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-700">
                            {t.paymentMode ? (
                              <span className="px-2 py-0.5 text-[10px] rounded bg-slate-100 border border-slate-200">
                                {t.paymentMode}
                              </span>
                            ) : ''}
                          </td>
                          <td className="py-3 px-4 font-mono font-black text-slate-900 text-right whitespace-nowrap">
                            Rs {t.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 font-mono font-black text-emerald-600 text-right whitespace-nowrap">
                            {t.moneyIn !== null && t.moneyIn > 0 ? `Rs ${t.moneyIn.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : (t.moneyIn === 0 ? 'Rs 0.00' : '')}
                          </td>
                          <td className="py-3 px-4 font-mono font-black text-rose-600 text-right whitespace-nowrap">
                            {t.moneyOut !== null && t.moneyOut > 0 ? `Rs ${t.moneyOut.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : (t.moneyOut === 0 ? 'Rs 0.00' : '')}
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-2 text-slate-400">
                              <button
                                onClick={handlePrintReport}
                                title="Print Details"
                                className="p-1 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  const shareText = `${t.type} #${t.refNo} - ${t.partyName} - Total: Rs ${t.totalAmount}`;
                                  navigator.clipboard?.writeText(shareText);
                                  alert('Transaction details copied to clipboard!');
                                }}
                                title="Share / Copy"
                                className="p-1 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors cursor-pointer"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => alert(`Details for ${t.type} #${t.refNo}`)}
                                title="More options"
                                className="p-1 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Exact Bottom Summary Footer Bar from Reference Screenshot */}
              <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-4 text-xs font-mono font-extrabold border-b border-slate-200 rounded-b-xl shadow-2xs">
                <div className="text-emerald-600">
                  Total Money-In: Rs {dayBookMoneyInTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-rose-600">
                  Total Money-Out: Rs {dayBookMoneyOutTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-teal-600">
                  Total Money In - Total Money Out: Rs {dayBookNetBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ================= ALL TRANSACTIONS REPORT ================= */}
        {activeTab === 'all-transactions' && (
          <>
            {/* Top Filter Controls matching Reference Screenshot */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-3 text-xs">
              {/* Row 1: Date Preset, Date Range Input, Firm Selector, Utilities */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Date Preset Dropdown */}
                  <select
                    value={datePreset}
                    onChange={e => handlePresetChange(e.target.value as DatePreset)}
                    aria-label="Filter date range preset"
                    className="h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-800 font-bold outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
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

                  {/* Date Range Badge (Between ... To ...) */}
                  <div className="flex items-center bg-white border border-slate-300 rounded-lg overflow-hidden shadow-2xs">
                    <span className="bg-slate-400 text-white text-xs font-bold px-3 py-2">Between</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => {
                        setStartDate(e.target.value);
                        setDatePreset('custom');
                      }}
                      aria-label="Start date"
                      className="px-2 py-1 text-xs font-mono font-bold text-slate-800 outline-none"
                    />
                    <span className="text-slate-500 font-bold px-1.5">To</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => {
                        setEndDate(e.target.value);
                        setDatePreset('custom');
                      }}
                      aria-label="End date"
                      className="px-2 py-1 text-xs font-mono font-bold text-slate-800 outline-none"
                    />
                  </div>

                  {/* Firm Filter Dropdown (ALL FIRMS matching reference image) */}
                  <select
                    value={allTxnsFirmFilter}
                    onChange={e => setAllTxnsFirmFilter(e.target.value)}
                    aria-label="Select Firm"
                    className="h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-800 font-bold outline-none focus:border-blue-500 cursor-pointer shadow-2xs min-w-[130px]"
                  >
                    <option value="all">ALL FIRMS</option>
                    {companies.map((c, idx) => (
                      <option key={c.tenantId || idx} value={c.tenantId}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Right Top Action Utilities */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportAllTxnsCSV}
                    title="Excel Report"
                    className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Excel Report</span>
                  </button>

                  <button
                    onClick={handlePrintReport}
                    title="Print"
                    className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-slate-600" />
                    <span>Print</span>
                  </button>
                </div>
              </div>

              {/* Row 2: Type Filter Dropdown */}
              <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
                <select
                  value={selectedTypeFilter}
                  onChange={e => setSelectedTypeFilter(e.target.value)}
                  aria-label="Filter Transaction Type"
                  className="h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-800 font-bold outline-none focus:border-blue-500 cursor-pointer shadow-2xs min-w-[160px]"
                >
                  <option value="all">All Transaction</option>
                  <option value="Sale">Sale</option>
                  <option value="Purchase">Purchase</option>
                  <option value="Payment-In">Payment-In</option>
                  <option value="Payment-Out">Payment-Out</option>
                  <option value="Expense">Expense</option>
                  <option value="Debit Note">Debit Note</option>
                  <option value="Sale Return">Sale Return</option>
                  <option value="Cash Increase">Cash Increase</option>
                  <option value="Cash Reduce">Cash Reduce</option>
                </select>
              </div>
            </div>

            {/* All Transactions Table Section matching Reference UI */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
              {/* Search Bar Input */}
              <div className="p-3.5 border-b border-slate-200 flex items-center">
                <div className="relative w-full max-w-sm">
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    aria-label="Search all transactions"
                    placeholder="Search party, ref no, category..."
                    className="h-8 pl-8 pr-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-blue-500 w-full"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              {/* Table Render (Row index starting from 1 with index + 1) */}
              <div className="overflow-x-auto">
                <table className="vyapar-table w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 text-slate-500 text-[11px] font-extrabold uppercase tracking-wider border-b border-slate-200">
                      <th className="py-3 px-3 w-10">#</th>
                      <th className="py-3 px-4">DATE</th>
                      <th className="py-3 px-4">REF NO.</th>
                      <th className="py-3 px-4">PARTY NAME</th>
                      <th className="py-3 px-4">CATEGORY NAME</th>
                      <th className="py-3 px-4">TYPE</th>
                      <th className="py-3 px-4 text-right">TOTAL</th>
                      <th className="py-3 px-4 text-right">RECEIVED / PAID</th>
                      <th className="py-3 px-4 text-right">BALANCE</th>
                      <th className="py-3 px-4 text-center">PRINT / SHARE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                    {allTransactionsData.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="text-center py-12 text-slate-400 font-semibold">
                          No transactions found matching the selected criteria.
                        </td>
                      </tr>
                    ) : (
                      allTransactionsData.map((t, idx) => (
                        <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-3 font-mono font-bold text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                            {formatDateDisplay(t.date)}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                            {t.refNo || ''}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800">
                            {t.partyName || ''}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-600">
                            {t.categoryName || ''}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-extrabold rounded border ${
                                t.type === 'Sale'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : t.type === 'Purchase'
                                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                                  : t.type === 'Payment-In'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : t.type === 'Payment-Out'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : t.type === 'Expense'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : t.type === 'Debit Note'
                                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                  : t.type === 'Sale Return'
                                  ? 'bg-pink-50 text-pink-700 border-pink-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {t.type}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-black text-slate-900 text-right whitespace-nowrap">
                            Rs {t.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 font-mono font-black text-emerald-600 text-right whitespace-nowrap">
                            Rs {t.receivedPaidAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 font-mono font-black text-right whitespace-nowrap">
                            <span className={t.balanceAmount > 0 ? 'text-amber-600 font-extrabold' : 'text-slate-500'}>
                              Rs {t.balanceAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-2 text-slate-400">
                              <button
                                onClick={handlePrintReport}
                                title="Print Details"
                                className="p-1 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  const shareText = `${t.type} #${t.refNo} - ${t.partyName || t.categoryName} - Total: Rs ${t.totalAmount}`;
                                  navigator.clipboard?.writeText(shareText);
                                  alert('Transaction details copied to clipboard!');
                                }}
                                title="Share / Copy"
                                className="p-1 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors cursor-pointer"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => alert(`Details for ${t.type} #${t.refNo}`)}
                                title="More options"
                                className="p-1 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
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
        {activeTab !== 'sale' && activeTab !== 'purchase' && activeTab !== 'day-book' && activeTab !== 'all-transactions' && (
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
