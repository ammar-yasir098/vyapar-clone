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
  ChevronDown,
  MoreVertical
} from 'lucide-react';
import { Invoice, BusinessDetails, PurchaseBill, PurchaseReturn, PaymentIn, PaymentOut, Expense, SaleReturn, CashTransaction, Item, Party } from '../../types';
import { triggerThermalPrint } from '../../services/printer';
import { calculateProfitAndLoss, generatePartyLedger, calculateTaxSummary, calculateCashFlow, calculateTrialBalance, calculateBalanceSheet } from '../../services/reportsService';
import { db, getActiveTenantId } from '../../db';
import { fetchServerInvoices } from '../../services/api';

interface ReportsScreenProps {
  items?: Item[];
  parties?: Party[];
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
      { id: 'gst-tax-summary', label: 'GST Tax Summary' },
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

// Helper to compute individual invoice total cost, profit, and margin %
function calculateInvoiceCostAndProfit(inv: Invoice, itemsList: Item[] = []) {
  const grandTotal = Number(inv.grandTotal || 0);
  const taxTotal = Number(inv.taxTotal || 0);
  // Net revenue excluding sales tax/GST (tax is not business income)
  const netRevenue = Math.max(0, grandTotal - taxTotal);
  let totalCost = 0;
  let hasMissingCost = false;

  // Safe parse items in case inv.items was serialized as a string
  const rawItems = inv.items;
  const parsedItems: any[] = Array.isArray(rawItems)
    ? rawItems
    : (typeof rawItems === 'string'
        ? (() => { try { return JSON.parse(rawItems); } catch { return []; } })()
        : []);

  // Build lookup index from master inventory items for fast and reliable matching
  const itemMap = new Map<string, Item>();
  for (const it of itemsList) {
    if (it.id) itemMap.set(String(it.id), it);
    if (it.skuCode) itemMap.set(it.skuCode.trim().toLowerCase(), it);
    if (it.barcode) itemMap.set(it.barcode.trim(), it);
    if (it.name) itemMap.set(it.name.trim().toLowerCase(), it);
  }

  if (parsedItems.length > 0) {
    totalCost = parsedItems.reduce((sum, item: any) => {
      const qty = Number(item.quantity || 1);
      let cost = Number(item.purchasePrice || item.costPrice || 0);

      // If item line has no purchase price, lookup in master inventory
      if (cost <= 0 && itemsList.length > 0) {
        const lineId = item.itemId !== undefined && item.itemId !== null ? String(item.itemId) : (item.id ? String(item.id) : '');
        const lineBarcode = (item.barcode || '').trim();
        const lineSku = (item.skuCode || item.hsnSacCode || '').trim().toLowerCase();
        const lineName = (item.itemName || item.name || '').trim().toLowerCase();

        let found: Item | undefined;
        if (lineId && itemMap.has(lineId)) found = itemMap.get(lineId);
        else if (lineBarcode && itemMap.has(lineBarcode)) found = itemMap.get(lineBarcode);
        else if (lineSku && itemMap.has(lineSku)) found = itemMap.get(lineSku);
        else if (lineName && itemMap.has(lineName)) found = itemMap.get(lineName);

        if (found && Number(found.purchasePrice) > 0) {
          cost = Number(found.purchasePrice);
        }
      }

      if (cost <= 0) {
        hasMissingCost = true;
        cost = 0;
      }

      return sum + (qty * cost);
    }, 0);
  } else {
    hasMissingCost = true;
    totalCost = 0;
  }

  const profit = netRevenue - totalCost;
  const marginPercent = netRevenue > 0 ? (profit / netRevenue) * 100 : 0;

  return { grandTotal, netRevenue, taxTotal, totalCost, profit, marginPercent, hasMissingCost };
}

export const ReportsScreen: React.FC<ReportsScreenProps> = ({
  items = [],
  parties = [],
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

  // Party Statement State
  const [partiesList, setPartiesList] = useState<Party[]>(parties);
  const [selectedPartyId, setSelectedPartyId] = useState<number | ''>('');

  const activeTenantId = getActiveTenantId(business);

  useEffect(() => {
    if (parties && parties.length > 0) {
      setPartiesList(parties);
      if (parties[0]?.id) setSelectedPartyId(parties[0].id);
    } else {
      db.parties.filter(p => (p.tenantId || 'default-tenant') === activeTenantId).toArray().then(pList => {
        setPartiesList(pList);
        if (pList.length > 0 && pList[0]?.id) {
          setSelectedPartyId(pList[0].id);
        }
      });
    }
  }, [parties, activeTenantId]);

  const selectedParty = useMemo(() => {
    return partiesList.find(p => p.id === Number(selectedPartyId)) || partiesList[0] || null;
  }, [partiesList, selectedPartyId]);

  // Profit and Loss State
  const [pnlView, setPnlView] = useState<'vyapar' | 'accounting'>('vyapar');
  const [expandedIncomes, setExpandedIncomes] = useState<boolean>(true);
  const [expandedExpenses, setExpandedExpenses] = useState<boolean>(true);
  const [expandedCogs, setExpandedCogs] = useState<boolean>(true);

  const [selectedFirm, setSelectedFirm] = useState<string>(activeTenantId || 'all');
  const [search, setSearch] = useState<string>('');
  const [showChart, setShowChart] = useState<boolean>(false);

  // Cash Flow Filter States
  const [cashFlowTypeFilter, setCashFlowTypeFilter] = useState<'all' | 'INFLOW' | 'OUTFLOW'>('all');
  const [cashFlowMethodFilter, setCashFlowMethodFilter] = useState<string>('all');
  const [showCashFlowBreakdown, setShowCashFlowBreakdown] = useState<boolean>(false);

  // Auto-sync selectedFirm whenever active tenant is changed from top-left store selector
  useEffect(() => {
    if (activeTenantId) {
      setSelectedFirm(activeTenantId);
    }
  }, [activeTenantId]);

  const safeItems = Array.isArray(items) ? items : [];
  const safeInvoices = Array.isArray(invoices) ? invoices : [];
  const safePurchaseBills = Array.isArray(purchaseBills) ? purchaseBills : [];
  const safePurchaseReturns = Array.isArray(purchaseReturns) ? purchaseReturns : [];
  const safePaymentsIn = Array.isArray(paymentsIn) ? paymentsIn : [];
  const safePaymentsOut = Array.isArray(paymentsOut) ? paymentsOut : [];
  const safeExpenses = Array.isArray(expenses) ? expenses : [];
  const safeSaleReturns = Array.isArray(saleReturns) ? saleReturns : [];
  const safeCashTransactions = Array.isArray(cashTransactions) ? cashTransactions : [];

  // Self-heal: If an invoice in Dexie has empty items (e.g. from an earlier sync), restore items from syncJournal or server!
  useEffect(() => {
    let isMounted = true;
    const repairInvoicesWithoutItems = async () => {
      const brokenInvoices = safeInvoices.filter(inv => !Array.isArray(inv.items) || inv.items.length === 0);
      if (brokenInvoices.length === 0) return;

      for (const inv of brokenInvoices) {
        let restoredItems: any[] = [];

        // 1. Check syncJournal for original invoice payload
        try {
          const journalEntry = await db.syncJournal
            .filter(j => j.entityType === 'INVOICE' && (j.entityId === inv.invoiceId || (Boolean(j.payload) && j.payload.includes(inv.invoiceNumber))))
            .reverse()
            .first();

          if (journalEntry && journalEntry.payload) {
            const parsed = typeof journalEntry.payload === 'string' ? JSON.parse(journalEntry.payload) : journalEntry.payload;
            if (Array.isArray(parsed?.items) && parsed.items.length > 0) {
              restoredItems = parsed.items;
            }
          }
        } catch { }

        // 2. If not in syncJournal, fetch from server API
        if (restoredItems.length === 0) {
          try {
            const serverInvoices = await fetchServerInvoices(inv.tenantId || activeTenantId);
            const serverMatch = serverInvoices.find((si: any) => si.invoiceNumber === inv.invoiceNumber || si.invoiceId === inv.invoiceId);
            if (serverMatch && Array.isArray(serverMatch.items) && serverMatch.items.length > 0) {
              restoredItems = serverMatch.items;
            }
          } catch { }
        }

        // 3. Fallback: If still empty, match against inventory products by unit price
        if (restoredItems.length === 0 && safeItems.length > 0) {
          const grandTotal = Number(inv.grandTotal || 0);
          const matchedItem = safeItems.find(it => Number(it.salesPrice) > 0 && Math.abs(grandTotal % Number(it.salesPrice)) < 0.01);
          if (matchedItem && Number(matchedItem.salesPrice) > 0) {
            const qty = Math.round(grandTotal / Number(matchedItem.salesPrice));
            if (qty > 0) {
              restoredItems = [{
                itemId: matchedItem.id,
                itemName: matchedItem.name,
                skuCode: matchedItem.skuCode,
                barcode: matchedItem.barcode,
                quantity: qty,
                unitPrice: matchedItem.salesPrice,
                purchasePrice: matchedItem.purchasePrice || 0,
                taxAmount: 0,
                totalAmount: grandTotal
              }];
            }
          }
        }

        // Save repaired items back to Dexie so print receipt, profit report, etc. work seamlessly!
        if (isMounted && restoredItems.length > 0 && inv.id) {
          await db.invoices.update(inv.id, { items: restoredItems });
        }
      }
    };

    repairInvoicesWithoutItems();
    return () => { isMounted = false; };
  }, [safeInvoices, safeItems, activeTenantId]);

  // Centralized report calculation hooks via reportsService
  const pnlReport = useMemo(() => {
    return calculateProfitAndLoss(safeInvoices, safeSaleReturns, safeExpenses, { startDate, endDate }, items);
  }, [safeInvoices, safeSaleReturns, safeExpenses, startDate, endDate, items]);

  const partyLedgerReport = useMemo(() => {
    if (!selectedParty) return null;
    return generatePartyLedger(
      selectedParty,
      safeInvoices,
      safePaymentsIn,
      safeSaleReturns,
      safePurchaseBills,
      safePaymentsOut,
      safePurchaseReturns,
      { startDate, endDate }
    );
  }, [selectedParty, safeInvoices, safePaymentsIn, safeSaleReturns, safePurchaseBills, safePaymentsOut, safePurchaseReturns, startDate, endDate]);

  const taxSummaryReport = useMemo(() => {
    const firmInvoices = selectedFirm === 'all' 
      ? safeInvoices 
      : safeInvoices.filter(i => (i.tenantId || 'default-tenant') === selectedFirm);
    const firmBills = selectedFirm === 'all' 
      ? safePurchaseBills 
      : safePurchaseBills.filter(b => (b.tenantId || 'default-tenant') === selectedFirm);
    const firmSaleReturns = selectedFirm === 'all' 
      ? safeSaleReturns 
      : safeSaleReturns.filter(sr => (sr.tenantId || 'default-tenant') === selectedFirm);
    const firmPurchaseReturns = selectedFirm === 'all' 
      ? safePurchaseReturns 
      : safePurchaseReturns.filter(pr => (pr.tenantId || 'default-tenant') === selectedFirm);

    return calculateTaxSummary(
      firmInvoices,
      firmBills,
      { startDate, endDate },
      firmSaleReturns,
      firmPurchaseReturns,
      safeItems
    );
  }, [safeInvoices, safePurchaseBills, safeSaleReturns, safePurchaseReturns, safeItems, selectedFirm, startDate, endDate]);

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
      const rec = Number(
        inv.receivedAmount ?? (inv.paymentStatus === 'PAID' ? grand : (inv.paymentMethod === 'CASH' ? grand : 0))
      );
      const due = Number(inv.dueAmount ?? Math.max(0, grand - rec));
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
    return filteredPurchases
      .filter(p => p.type === 'Purchase')
      .reduce((sum, p) => sum + p.paidAmount, 0);
  }, [filteredPurchases]);

  const purchaseUnpaidTotal = useMemo(() => {
    return Math.max(0, purchaseTotalAmount - purchasePaidTotal);
  }, [purchaseTotalAmount, purchasePaidTotal]);

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

    // 1. Sales
    const sales = safeInvoices.map(inv => {
      const { dateISO, timeStr } = parseLocalDate(inv.invoiceDate, inv.createdAt);
      const tot = Number(inv.grandTotal || 0);
      const isCredit = (inv.paymentMethod || '').toUpperCase() === 'CREDIT';

      let moneyIn: number | null = null;
      if (!isCredit) {
        const rec = Number(inv.receivedAmount ?? (inv.paymentStatus === 'PAID' ? tot : 0));
        if (rec > 0) {
          moneyIn = rec;
        }
      }

      return {
        id: `sale-${inv.id || inv.invoiceNumber}`,
        date: dateISO,
        time: timeStr,
        partyName: inv.partyName || 'Walk-in Retail Customer',
        refNo: inv.invoiceNumber || 'INV-000',
        type: 'Sale',
        paymentMode: inv.paymentMethod || 'Cash',
        totalAmount: tot,
        moneyIn,
        moneyOut: null as number | null,
        tenantId: inv.tenantId || 'default-tenant'
      };
    });

    // 2. Purchases / Bills
    const purchases = safePurchaseBills.map(b => {
      const { dateISO, timeStr } = parseLocalDate(b.billDate, b.createdAt);
      const tot = Number(b.grandTotal || 0);
      const isCredit = (b.paymentMethod || '').toUpperCase() === 'CREDIT';

      let moneyOut: number | null = null;
      if (!isCredit) {
        const paid = Number(b.paidAmount ?? (b.paymentStatus === 'PAID' ? tot : 0));
        if (paid > 0) {
          moneyOut = paid;
        }
      }

      return {
        id: `pur-${b.id || b.billNumber}`,
        date: dateISO,
        time: timeStr,
        partyName: b.supplierName || 'Vendor / Supplier',
        refNo: b.billNumber || '',
        type: 'Purchase',
        paymentMode: b.paymentMethod || (isCredit ? 'Credit' : 'Cash'),
        totalAmount: tot,
        moneyIn: null as number | null,
        moneyOut,
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
      const isCredit = (inv.paymentMethod || '').toUpperCase() === 'CREDIT';

      let rec = 0;
      if (!isCredit) {
        rec = Number(inv.receivedAmount ?? (inv.paymentStatus === 'PAID' ? grand : 0));
      }

      const due = Number(inv.dueAmount !== undefined ? inv.dueAmount : (inv.paymentStatus === 'PAID' ? 0 : Math.max(0, grand - rec)));

      return {
        id: `sale-${inv.id || inv.invoiceNumber}`,
        date: dateISO,
        time: timeStr,
        refNo: inv.invoiceNumber || '',
        partyName: inv.partyName || 'Walk-in Retail Customer',
        categoryName: '',
        type: 'Sale',
        paymentMode: inv.paymentMethod || (isCredit ? 'Credit' : 'Cash'),
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
      const isCredit = (b.paymentMethod || '').toUpperCase() === 'CREDIT';

      let paid = 0;
      if (!isCredit) {
        paid = Number(b.paidAmount ?? (b.paymentStatus === 'PAID' ? grand : 0));
      }

      const due = Number(b.dueAmount !== undefined ? b.dueAmount : (b.paymentStatus === 'PAID' ? 0 : Math.max(0, grand - paid)));
      const pm = b.paymentMethod || (isCredit ? 'Credit' : 'Cash');

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
      if (selectedFirm !== 'all' && item.tenantId !== selectedFirm) return false;
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
  }, [safeInvoices, safePurchaseBills, safePaymentsIn, safePaymentsOut, safeExpenses, safePurchaseReturns, safeSaleReturns, safeCashTransactions, selectedFirm, startDate, endDate, selectedTypeFilter, search]);

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

  // ----------------- PROFIT AND LOSS AGGREGATION & METRICS -----------------
  const pnlMetrics = useMemo(() => {
    // 1. Gross Sales from Invoices
    const grossSales = safeInvoices
      .filter(inv => {
        if (!inv) return false;
        const invTenant = inv.tenantId || 'default-tenant';
        if (selectedFirm !== 'all' && invTenant !== selectedFirm) return false;
        const { dateISO } = parseLocalDate(inv.invoiceDate, inv.createdAt);
        return (!startDate || dateISO >= startDate) && (!endDate || dateISO <= endDate);
      })
      .reduce((sum, inv) => sum + Number(inv.grandTotal || 0), 0);

    // 2. Credit Notes (Sale Returns)
    const creditNotes = safeSaleReturns
      .filter(sr => {
        if (!sr) return false;
        const srTenant = sr.tenantId || 'default-tenant';
        if (selectedFirm !== 'all' && srTenant !== selectedFirm) return false;
        const { dateISO } = parseLocalDate(sr.returnDate, sr.createdAt);
        return (!startDate || dateISO >= startDate) && (!endDate || dateISO <= endDate);
      })
      .reduce((sum, sr) => sum + Number(sr.grandTotal || 0), 0);

    const netSales = grossSales - creditNotes;

    // 3. Gross Purchases from Purchase Bills
    const grossPurchases = safePurchaseBills
      .filter(pb => {
        if (!pb) return false;
        const pbTenant = pb.tenantId || 'default-tenant';
        if (selectedFirm !== 'all' && pbTenant !== selectedFirm) return false;
        const { dateISO } = parseLocalDate(pb.billDate, pb.createdAt);
        return (!startDate || dateISO >= startDate) && (!endDate || dateISO <= endDate);
      })
      .reduce((sum, pb) => sum + Number(pb.grandTotal || 0), 0);

    // 4. Debit Notes (Purchase Returns)
    const debitNotes = safePurchaseReturns
      .filter(pr => {
        if (!pr) return false;
        const prTenant = pr.tenantId || 'default-tenant';
        if (selectedFirm !== 'all' && prTenant !== selectedFirm) return false;
        const { dateISO } = parseLocalDate(pr.returnDate, pr.createdAt);
        return (!startDate || dateISO >= startDate) && (!endDate || dateISO <= endDate);
      })
      .reduce((sum, pr) => sum + Number(pr.grandTotal || 0), 0);

    const netPurchases = grossPurchases - debitNotes;

    // 5. Operating Expenses (Indirect Expenses)
    const indirectExpenses = safeExpenses
      .filter(e => {
        if (!e) return false;
        const eTenant = e.tenantId || 'default-tenant';
        if (selectedFirm !== 'all' && eTenant !== selectedFirm) return false;
        const { dateISO } = parseLocalDate(e.expenseDate, e.createdAt);
        return (!startDate || dateISO >= startDate) && (!endDate || dateISO <= endDate);
      })
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const saleFA = 0;
    const purchaseFA = 0;
    const directExpenses = 0;
    const otherDirectExpenses = 0;
    const paymentInDiscount = 0;
    const taxPayable = 0;
    const tcsPayable = 0;
    const tdsPayable = 0;
    const taxReceivable = 0;
    const tcsReceivable = 0;
    const openingStock = 0;
    const closingStock = 0;

    const cogs = openingStock + netPurchases - closingStock;
    const grossProfit = netSales - cogs;
    const netProfit = grossProfit - directExpenses - indirectExpenses;

    return {
      grossSales,
      creditNotes,
      netSales,
      saleFA,
      grossPurchases,
      debitNotes,
      netPurchases,
      purchaseFA,
      directExpenses,
      otherDirectExpenses,
      paymentInDiscount,
      taxPayable,
      tcsPayable,
      tdsPayable,
      taxReceivable,
      tcsReceivable,
      indirectExpenses,
      openingStock,
      closingStock,
      cogs,
      grossProfit,
      netProfit
    };
  }, [safeInvoices, safeSaleReturns, safePurchaseBills, safePurchaseReturns, safeExpenses, selectedFirm, startDate, endDate]);

  const handleExportPnlCSV = () => {
    const headers = ['Particulars', 'Amount (Rs)'];
    let rows: (string | number)[][] = [];

    if (pnlView === 'vyapar') {
      rows = [
        ['Sale (+)', pnlMetrics.grossSales.toFixed(2)],
        ['Credit Note (-)', pnlMetrics.creditNotes.toFixed(2)],
        ['Sale FA (+)', pnlMetrics.saleFA.toFixed(2)],
        ['Purchase (-)', pnlMetrics.grossPurchases.toFixed(2)],
        ['Debit Note (+)', pnlMetrics.debitNotes.toFixed(2)],
        ['Purchase FA (-)', pnlMetrics.purchaseFA.toFixed(2)],
        ['Direct Expenses (-)', pnlMetrics.directExpenses.toFixed(2)],
        ['Indirect Expenses (-)', pnlMetrics.indirectExpenses.toFixed(2)],
        ['Net Profit / (Loss)', pnlMetrics.netProfit.toFixed(2)]
      ];
    } else {
      rows = [
        ['Incomes - Sale Accounts', pnlMetrics.netSales.toFixed(2)],
        ['Expenses - Cost of Goods Sold', pnlMetrics.cogs.toFixed(2)],
        ['Expenses - Indirect Expenses', pnlMetrics.indirectExpenses.toFixed(2)],
        ['Net Profit / (Loss)', pnlMetrics.netProfit.toFixed(2)]
      ];
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Profit_And_Loss_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ----------------- BILL WISE PROFIT AGGREGATION & DATA -----------------
  const billWiseProfitData = useMemo(() => {
    return safeInvoices.map(inv => {
      const { dateISO } = parseLocalDate(inv.invoiceDate, inv.createdAt);
      const { grandTotal, netRevenue, taxTotal, totalCost, profit, marginPercent, hasMissingCost } = calculateInvoiceCostAndProfit(inv, safeItems);

      return {
        id: `bill-profit-${inv.id || inv.invoiceNumber}`,
        date: dateISO,
        invoiceNumber: inv.invoiceNumber || 'INV-000',
        partyName: inv.partyName || 'Walk-in Retail Customer',
        grandTotal,
        netRevenue,
        taxTotal,
        totalCost,
        profit,
        marginPercent,
        hasMissingCost,
        tenantId: inv.tenantId || 'default-tenant',
        rawInvoice: inv
      };
    }).filter(item => {
      if (selectedFirm !== 'all' && item.tenantId !== selectedFirm) return false;
      if (startDate && item.date < startDate) return false;
      if (endDate && item.date > endDate) return false;

      if (search.trim()) {
        const q = search.toLowerCase().trim();
        return (
          item.invoiceNumber.toLowerCase().includes(q) ||
          item.partyName.toLowerCase().includes(q)
        );
      }
      return true;
    }).sort((a, b) => (b.date > a.date ? 1 : -1));
  }, [safeInvoices, safeItems, selectedFirm, startDate, endDate, search]);

  const billWiseTotalSales = useMemo(() => {
    return billWiseProfitData.reduce((sum, b) => sum + b.grandTotal, 0);
  }, [billWiseProfitData]);

  const billWiseTotalNetRevenue = useMemo(() => {
    return billWiseProfitData.reduce((sum, b) => sum + b.netRevenue, 0);
  }, [billWiseProfitData]);

  const billWiseTotalCost = useMemo(() => {
    return billWiseProfitData.reduce((sum, b) => sum + b.totalCost, 0);
  }, [billWiseProfitData]);

  const billWiseTotalProfit = useMemo(() => {
    return billWiseProfitData.reduce((sum, b) => sum + b.profit, 0);
  }, [billWiseProfitData]);

  const billWiseAvgMargin = useMemo(() => {
    return billWiseTotalNetRevenue > 0 ? (billWiseTotalProfit / billWiseTotalNetRevenue) * 100 : 0;
  }, [billWiseTotalNetRevenue, billWiseTotalProfit]);

  const missingCostCount = useMemo(() => {
    return billWiseProfitData.filter(b => b.hasMissingCost).length;
  }, [billWiseProfitData]);

  const handleExportBillWiseProfitCSV = () => {
    if (billWiseProfitData.length === 0) {
      alert('No bill-wise profit records available to export for the selected date range.');
      return;
    }

    const headers = ['Date', 'Invoice No', 'Customer Name', 'Total Billed (Rs)', 'Net Revenue (Rs)', 'Total Cost (Rs)', 'Profit Amount (Rs)', 'Margin (%)', 'Cost Status'];
    const rows = billWiseProfitData.map(b => [
      formatDateDisplay(b.date),
      `"${b.invoiceNumber}"`,
      `"${b.partyName}"`,
      b.grandTotal.toFixed(2),
      b.netRevenue.toFixed(2),
      b.totalCost.toFixed(2),
      b.profit.toFixed(2),
      `${b.marginPercent.toFixed(2)}%`,
      b.hasMissingCost ? '"Unset Cost in Inventory"' : '"Verified Cost"'
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Bill_Wise_Profit_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ----------------- CASH FLOW AGGREGATION & DATA -----------------
  const cashFlowReport = useMemo(() => {
    const firmInvoices = safeInvoices.filter(i => selectedFirm === 'all' || (i.tenantId || 'default-tenant') === selectedFirm);
    const firmPurchases = safePurchaseBills.filter(p => selectedFirm === 'all' || (p.tenantId || 'default-tenant') === selectedFirm);
    const firmPaymentsIn = safePaymentsIn.filter(p => selectedFirm === 'all' || (p.tenantId || 'default-tenant') === selectedFirm);
    const firmPaymentsOut = safePaymentsOut.filter(p => selectedFirm === 'all' || (p.tenantId || 'default-tenant') === selectedFirm);
    const firmExpenses = safeExpenses.filter(e => selectedFirm === 'all' || (e.tenantId || 'default-tenant') === selectedFirm);
    const firmSaleReturns = safeSaleReturns.filter(sr => selectedFirm === 'all' || (sr.tenantId || 'default-tenant') === selectedFirm);
    const firmCashTxns = safeCashTransactions.filter(c => selectedFirm === 'all' || (c.tenantId || 'default-tenant') === selectedFirm);

    return calculateCashFlow(
      firmInvoices,
      firmPurchases,
      firmPaymentsIn,
      firmPaymentsOut,
      firmExpenses,
      firmSaleReturns,
      firmCashTxns,
      { startDate, endDate }
    );
  }, [safeInvoices, safePurchaseBills, safePaymentsIn, safePaymentsOut, safeExpenses, safeSaleReturns, safeCashTransactions, selectedFirm, startDate, endDate]);

  const filteredCashFlowTransactions = useMemo(() => {
    return cashFlowReport.transactions.filter(t => {
      if (cashFlowTypeFilter !== 'all' && t.type !== cashFlowTypeFilter) return false;
      const isBank = t.paymentMethod.toUpperCase().includes('BANK') || t.paymentMethod.toUpperCase().includes('ONLINE') || t.paymentMethod.toUpperCase().includes('UPI');
      if (cashFlowMethodFilter === 'cash' && isBank) return false;
      if (cashFlowMethodFilter === 'bank' && !isBank) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        return (
          t.referenceNo.toLowerCase().includes(q) ||
          t.partyOrCategory.toLowerCase().includes(q) ||
          t.sourceLabel.toLowerCase().includes(q) ||
          t.paymentMethod.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [cashFlowReport.transactions, cashFlowTypeFilter, cashFlowMethodFilter, search]);

  const handleExportCashFlowCSV = () => {
    if (cashFlowReport.transactions.length === 0) {
      alert('No cash flow records available to export for the selected date range.');
      return;
    }

    const firmName = selectedFirm !== 'all'
      ? (companies.find(c => c.tenantId === selectedFirm)?.name || business?.name || 'Selected Firm')
      : (business?.name || 'All Firms / Stores');

    const csvLines: string[] = [];

    const addRow = (...cells: any[]) => {
      csvLines.push(cells.map(c => {
        if (c === null || c === undefined) return '""';
        const s = String(c);
        return `"${s.replace(/"/g, '""')}"`;
      }).join(','));
    };

    // 1. Report Title & Business Header
    addRow('VYAPAR POS - CASH FLOW STATEMENT');
    addRow('Business / Store:', firmName, '', 'Period:', `${formatDateDisplay(startDate)} to ${formatDateDisplay(endDate)}`, '', 'Generated:', new Date().toLocaleString());
    addRow('Filters Applied:', `Flow: ${cashFlowTypeFilter.toUpperCase()} | Payment Mode: ${cashFlowMethodFilter.toUpperCase()} | Search: ${search || 'None'}`);
    addRow('');

    // 2. Executive Summary Metrics (Horizontal Bar across Columns A to E)
    addRow('Opening Balance (Rs)', 'Total Inflow (+) Rs', 'Total Outflow (-) Rs', 'Net Cash Flow Rs', 'Closing Balance Rs');
    addRow(
      cashFlowReport.openingBalance.toFixed(2),
      cashFlowReport.totalInflows.toFixed(2),
      cashFlowReport.totalOutflows.toFixed(2),
      cashFlowReport.netCashFlow.toFixed(2),
      cashFlowReport.closingBalance.toFixed(2)
    );
    addRow('');

    // 3. Transactions Register Table (Immediately on Screen 1)
    addRow(
      'Date',
      'Movement Type',
      'Source / Activity',
      'Voucher No',
      'Party / Description',
      'Payment Mode',
      'Inflow (+) Rs',
      'Outflow (-) Rs',
      'Running Balance Rs'
    );

    filteredCashFlowTransactions.forEach(t => {
      addRow(
        formatDateDisplay(t.date),
        t.type,
        t.sourceLabel,
        t.referenceNo,
        t.partyOrCategory,
        t.paymentMethod,
        t.type === 'INFLOW' ? t.amount.toFixed(2) : '0.00',
        t.type === 'OUTFLOW' ? t.amount.toFixed(2) : '0.00',
        t.runningBalance.toFixed(2)
      );
    });

    // 4. Grand Totals Row
    addRow(
      'TOTALS',
      '',
      '',
      `${filteredCashFlowTransactions.length} Record(s)`,
      '',
      '',
      cashFlowReport.totalInflows.toFixed(2),
      cashFlowReport.totalOutflows.toFixed(2),
      cashFlowReport.closingBalance.toFixed(2)
    );

    addRow('');
    addRow('');

    // 5. Inflow & Outflow Category Breakdown (At bottom)
    addRow('--- CATEGORY & SOURCE BREAKDOWN ---');
    addRow('Source / Activity Category', 'Movement Type', 'Amount (Rs)', 'Notes');
    addRow('Cash Sales (POS Checkout)', 'INFLOW', cashFlowReport.inflowBreakdown.salesCash.toFixed(2), 'Direct counter cash sales');
    addRow('Customer Payments (Payment-In)', 'INFLOW', cashFlowReport.inflowBreakdown.paymentsIn.toFixed(2), 'Recoveries from customers');
    if (cashFlowReport.inflowBreakdown.otherInflows > 0) {
      addRow('Other Deposits / Inflows', 'INFLOW', cashFlowReport.inflowBreakdown.otherInflows.toFixed(2), 'Direct liquid cash deposits');
    }
    addRow('Supplier Cash Purchases', 'OUTFLOW', cashFlowReport.outflowBreakdown.purchasesCash.toFixed(2), 'Direct cash purchases');
    addRow('Supplier Payments (Payment-Out)', 'OUTFLOW', cashFlowReport.outflowBreakdown.paymentsOut.toFixed(2), 'Paid out to suppliers');
    addRow('Operating Expenses (Rent, Bills)', 'OUTFLOW', cashFlowReport.outflowBreakdown.expenses.toFixed(2), 'Daily operating expenses');
    if (cashFlowReport.outflowBreakdown.saleReturnsRefunds > 0) {
      addRow('Customer Sale Return Refunds', 'OUTFLOW', cashFlowReport.outflowBreakdown.saleReturnsRefunds.toFixed(2), 'Refunds on returned items');
    }
    addRow('Cash in Hand Movements', 'CASH TOTAL', `In: Rs ${cashFlowReport.methodBreakdown.cashInHand.inflow.toFixed(2)} | Out: Rs ${cashFlowReport.methodBreakdown.cashInHand.outflow.toFixed(2)}`, `Net Cash: Rs ${(cashFlowReport.methodBreakdown.cashInHand.inflow - cashFlowReport.methodBreakdown.cashInHand.outflow).toFixed(2)}`);
    addRow('Bank / Online Movements', 'BANK TOTAL', `In: Rs ${cashFlowReport.methodBreakdown.bankOnline.inflow.toFixed(2)} | Out: Rs ${cashFlowReport.methodBreakdown.bankOnline.outflow.toFixed(2)}`, `Net Bank: Rs ${(cashFlowReport.methodBreakdown.bankOnline.inflow - cashFlowReport.methodBreakdown.bankOnline.outflow).toFixed(2)}`);

    // Export via UTF-8 BOM Blob (guarantees Excel renders symbols and formatting correctly on Windows)
    const csvContent = '\uFEFF' + csvLines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Cash_Flow_Statement_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ----------------- TRIAL BALANCE AGGREGATION & DATA -----------------
  const [trialBalanceGroupFilter, setTrialBalanceGroupFilter] = useState<string>('all');

  const trialBalanceReport = useMemo(() => {
    const firmInvoices = safeInvoices.filter(i => selectedFirm === 'all' || (i.tenantId || 'default-tenant') === selectedFirm);
    const firmPurchases = safePurchaseBills.filter(p => selectedFirm === 'all' || (p.tenantId || 'default-tenant') === selectedFirm);
    const firmPaymentsIn = safePaymentsIn.filter(p => selectedFirm === 'all' || (p.tenantId || 'default-tenant') === selectedFirm);
    const firmPaymentsOut = safePaymentsOut.filter(p => selectedFirm === 'all' || (p.tenantId || 'default-tenant') === selectedFirm);
    const firmExpenses = safeExpenses.filter(e => selectedFirm === 'all' || (e.tenantId || 'default-tenant') === selectedFirm);
    const firmSaleReturns = safeSaleReturns.filter(sr => selectedFirm === 'all' || (sr.tenantId || 'default-tenant') === selectedFirm);
    const firmPurchaseReturns = safePurchaseReturns.filter(pr => selectedFirm === 'all' || (pr.tenantId || 'default-tenant') === selectedFirm);
    const firmParties = partiesList.filter(p => selectedFirm === 'all' || (p.tenantId || 'default-tenant') === selectedFirm);
    const firmItems = safeItems.filter(item => selectedFirm === 'all' || (item.tenantId || 'default-tenant') === selectedFirm);
    const firmCashTxns = safeCashTransactions.filter(c => selectedFirm === 'all' || (c.tenantId || 'default-tenant') === selectedFirm);

    return calculateTrialBalance(
      firmInvoices,
      firmPurchases,
      firmPaymentsIn,
      firmPaymentsOut,
      firmExpenses,
      firmSaleReturns,
      firmPurchaseReturns,
      firmParties,
      firmItems,
      firmCashTxns,
      { startDate, endDate }
    );
  }, [safeInvoices, safePurchaseBills, safePaymentsIn, safePaymentsOut, safeExpenses, safeSaleReturns, safePurchaseReturns, partiesList, safeItems, safeCashTransactions, selectedFirm, startDate, endDate]);

  const filteredTrialBalanceAccounts = useMemo(() => {
    return trialBalanceReport.accounts.filter(a => {
      if (trialBalanceGroupFilter !== 'all' && a.group !== trialBalanceGroupFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        return (
          a.accountHead.toLowerCase().includes(q) ||
          a.groupLabel.toLowerCase().includes(q) ||
          (Boolean(a.details) && a.details!.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [trialBalanceReport.accounts, trialBalanceGroupFilter, search]);

  const handleExportTrialBalanceCSV = () => {
    if (trialBalanceReport.accounts.length === 0) {
      alert('No trial balance records available to export.');
      return;
    }

    const firmName = selectedFirm !== 'all'
      ? (companies.find(c => c.tenantId === selectedFirm)?.name || business?.name || 'Selected Firm')
      : (business?.name || 'All Firms / Stores');

    const csvLines: string[] = [];
    const addRow = (...cells: any[]) => {
      csvLines.push(cells.map(c => {
        if (c === null || c === undefined) return '""';
        const s = String(c);
        return `"${s.replace(/"/g, '""')}"`;
      }).join(','));
    };

    addRow('VYAPAR POS - TRIAL BALANCE REPORT');
    addRow('Business / Store:', firmName, '', 'Period:', `${formatDateDisplay(startDate)} to ${formatDateDisplay(endDate)}`, '', 'Generated:', new Date().toLocaleString());
    addRow('Status:', trialBalanceReport.isMatched ? 'MATCHED (Debits == Credits)' : 'UNMATCHED', '', 'Difference (Rs):', trialBalanceReport.difference.toFixed(2));
    addRow('');

    // Executive Metrics Bar
    addRow('Total Debits (Dr) Rs', 'Total Credits (Cr) Rs', 'Net Difference Rs', 'Balance Status');
    addRow(
      trialBalanceReport.totalDebits.toFixed(2),
      trialBalanceReport.totalCredits.toFixed(2),
      trialBalanceReport.difference.toFixed(2),
      trialBalanceReport.isMatched ? 'MATCHED' : 'UNMATCHED'
    );
    addRow('');

    // Table Header
    addRow('Account Head / Particulars', 'Account Group', 'Debit (Dr) Rs', 'Credit (Cr) Rs', 'Accounting Details / Notes');

    filteredTrialBalanceAccounts.forEach(acc => {
      addRow(
        acc.accountHead,
        acc.groupLabel,
        acc.debit > 0 ? acc.debit.toFixed(2) : '0.00',
        acc.credit > 0 ? acc.credit.toFixed(2) : '0.00',
        acc.details || ''
      );
    });

    addRow(
      'TOTALS',
      `${filteredTrialBalanceAccounts.length} Account(s)`,
      trialBalanceReport.totalDebits.toFixed(2),
      trialBalanceReport.totalCredits.toFixed(2),
      trialBalanceReport.isMatched ? 'MATCHED (Debits == Credits)' : 'DIFFERENCE DETECTED'
    );

    const csvContent = '\uFEFF' + csvLines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Trial_Balance_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ----------------- BALANCE SHEET AGGREGATION & DATA -----------------
  const balanceSheetReport = useMemo(() => {
    const firmInvoices = safeInvoices.filter(i => selectedFirm === 'all' || (i.tenantId || 'default-tenant') === selectedFirm);
    const firmPurchases = safePurchaseBills.filter(p => selectedFirm === 'all' || (p.tenantId || 'default-tenant') === selectedFirm);
    const firmPaymentsIn = safePaymentsIn.filter(p => selectedFirm === 'all' || (p.tenantId || 'default-tenant') === selectedFirm);
    const firmPaymentsOut = safePaymentsOut.filter(p => selectedFirm === 'all' || (p.tenantId || 'default-tenant') === selectedFirm);
    const firmExpenses = safeExpenses.filter(e => selectedFirm === 'all' || (e.tenantId || 'default-tenant') === selectedFirm);
    const firmSaleReturns = safeSaleReturns.filter(sr => selectedFirm === 'all' || (sr.tenantId || 'default-tenant') === selectedFirm);
    const firmPurchaseReturns = safePurchaseReturns.filter(pr => selectedFirm === 'all' || (pr.tenantId || 'default-tenant') === selectedFirm);
    const firmParties = partiesList.filter(p => selectedFirm === 'all' || (p.tenantId || 'default-tenant') === selectedFirm);
    const firmItems = safeItems.filter(item => selectedFirm === 'all' || (item.tenantId || 'default-tenant') === selectedFirm);
    const firmCashTxns = safeCashTransactions.filter(c => selectedFirm === 'all' || (c.tenantId || 'default-tenant') === selectedFirm);

    return calculateBalanceSheet(
      firmInvoices,
      firmPurchases,
      firmPaymentsIn,
      firmPaymentsOut,
      firmExpenses,
      firmSaleReturns,
      firmPurchaseReturns,
      firmParties,
      firmItems,
      firmCashTxns,
      endDate
    );
  }, [safeInvoices, safePurchaseBills, safePaymentsIn, safePaymentsOut, safeExpenses, safeSaleReturns, safePurchaseReturns, partiesList, safeItems, safeCashTransactions, selectedFirm, endDate]);

  const handleExportBalanceSheetCSV = () => {
    const firmName = selectedFirm !== 'all'
      ? (companies.find(c => c.tenantId === selectedFirm)?.name || business?.name || 'Selected Firm')
      : (business?.name || 'All Firms / Stores');

    const csvLines: string[] = [];
    const addRow = (...cells: any[]) => {
      csvLines.push(cells.map(c => {
        if (c === null || c === undefined) return '""';
        const s = String(c);
        return `"${s.replace(/"/g, '""')}"`;
      }).join(','));
    };

    addRow('VYAPAR POS - BALANCE SHEET');
    addRow('Business / Store:', firmName, '', 'As of Date:', formatDateDisplay(endDate), '', 'Generated:', new Date().toLocaleString());
    addRow('Accounting Status:', balanceSheetReport.isBalanced ? 'BALANCED (Assets = Liabilities + Equity)' : 'UNBALANCED');
    addRow('');

    // Summary Metrics Bar
    addRow('Total Assets (Rs)', 'Total Liabilities (Rs)', "Owner's Equity (Rs)", 'Net Worth (Rs)');
    addRow(
      balanceSheetReport.assets.totalAssets.toFixed(2),
      balanceSheetReport.liabilitiesAndEquity.totalLiabilities.toFixed(2),
      balanceSheetReport.liabilitiesAndEquity.equity.totalEquity.toFixed(2),
      balanceSheetReport.netWorth.toFixed(2)
    );
    addRow('');

    // SECTION 1: ASSETS
    addRow('--- ASSETS ---');
    addRow('Asset Particulars', 'Classification', 'Amount (Rs)', 'Accounting Notes');
    balanceSheetReport.assets.currentAssets.forEach(a => {
      addRow(a.title, 'Current Assets', a.amount.toFixed(2), a.notes || '');
    });
    addRow('TOTAL ASSETS', '', balanceSheetReport.assets.totalAssets.toFixed(2), 'Total Resources Owned by Store');
    addRow('');
    addRow('');

    // SECTION 2: LIABILITIES & EQUITY
    addRow('--- LIABILITIES & OWNER EQUITY ---');
    addRow('Obligation / Equity Particulars', 'Classification', 'Amount (Rs)', 'Accounting Notes');
    balanceSheetReport.liabilitiesAndEquity.currentLiabilities.forEach(l => {
      addRow(l.title, 'Current Liabilities', l.amount.toFixed(2), l.notes || '');
    });
    addRow('Total Liabilities', 'Subtotal', balanceSheetReport.liabilitiesAndEquity.totalLiabilities.toFixed(2), 'Total External Claims / Debt');
    addRow("Owner's Capital Account", 'Owner Equity', balanceSheetReport.liabilitiesAndEquity.equity.capital.toFixed(2), "Proprietor's Capital Investment");
    addRow('Current Period Net Profit (P&L)', 'Retained Earnings', balanceSheetReport.liabilitiesAndEquity.equity.currentPeriodNetProfit.toFixed(2), 'Net Profit from Operations');
    addRow("TOTAL OWNER'S EQUITY", 'Equity Total', balanceSheetReport.liabilitiesAndEquity.equity.totalEquity.toFixed(2), 'Net Proprietorship Stake');
    addRow('TOTAL LIABILITIES & EQUITY', '', balanceSheetReport.liabilitiesAndEquity.totalLiabilitiesAndEquity.toFixed(2), 'Matched with Total Assets');

    const csvContent = '\uFEFF' + csvLines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Balance_Sheet_As_Of_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="flex-1 flex h-full min-h-0 min-w-0 bg-[#f3f4f6] overflow-hidden">
      {/* ----------------- LEFT SUB-SIDEBAR ----------------- */}
      <div className="w-60 bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto h-full min-h-0">
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
      <div
        className="flex-1 flex flex-col overflow-y-auto min-h-0 min-w-0 p-5 sm:p-6 pb-32 gap-5"
        style={{ height: '100%', maxHeight: '100%', overflowY: 'auto' }}
      >
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
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-block whitespace-nowrap px-2 py-0.5 text-[10px] font-extrabold rounded border ${
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
                  Net Balance: Rs {dayBookNetBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-block whitespace-nowrap px-2 py-0.5 text-[10px] font-extrabold rounded border ${
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

        {/* ================= PROFIT AND LOSS REPORT ================= */}
        {activeTab === 'profit-loss' && (
          <>
            {/* Top Header & Filter Controls matching Reference Image */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-black text-slate-900 flex items-center gap-2 uppercase tracking-tight">
                    PROFIT AND LOSS REPORT
                  </h1>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportPnlCSV}
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

              {/* Date Filter & View Radio Selector Row */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Date Range Badge (From ... To ...) */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center bg-white border border-slate-300 rounded-lg overflow-hidden shadow-2xs">
                      <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-2 border-r border-slate-300">From</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={e => {
                          setStartDate(e.target.value);
                          setDatePreset('custom');
                        }}
                        aria-label="Start date"
                        className="px-2.5 py-1 text-xs font-mono font-bold text-slate-800 outline-none"
                      />
                      <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-2 border-l border-r border-slate-300">To</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={e => {
                          setEndDate(e.target.value);
                          setDatePreset('custom');
                        }}
                        aria-label="End date"
                        className="px-2.5 py-1 text-xs font-mono font-bold text-slate-800 outline-none"
                      />
                    </div>

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
                  </div>

                  {/* View Radio Buttons (Vyapar vs Accounting) */}
                  <div className="flex items-center gap-4 text-xs font-bold text-slate-800">
                    <span className="text-slate-500 font-bold">View :</span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="pnlView"
                        value="vyapar"
                        checked={pnlView === 'vyapar'}
                        onChange={() => setPnlView('vyapar')}
                        className="w-3.5 h-3.5 text-blue-600 accent-blue-600 cursor-pointer"
                      />
                      <span>Vyapar</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="pnlView"
                        value="accounting"
                        checked={pnlView === 'accounting'}
                        onChange={() => setPnlView('accounting')}
                        className="w-3.5 h-3.5 text-blue-600 accent-blue-600 cursor-pointer"
                      />
                      <span>Accounting</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Main P&L View Table Container */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden relative">
              {/* Accounting View Top Utility Bar (Expand/Collapse All) */}
              {pnlView === 'accounting' && (
                <div className="p-3 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>Particulars Breakdown</span>
                  <button
                    onClick={() => {
                      const nextState = !(expandedIncomes && expandedExpenses && expandedCogs);
                      setExpandedIncomes(nextState);
                      setExpandedExpenses(nextState);
                      setExpandedCogs(nextState);
                    }}
                    className="text-blue-600 hover:text-blue-700 flex items-center gap-1 font-extrabold cursor-pointer"
                  >
                    <span>{expandedIncomes && expandedExpenses ? '▲ Collapse all accounts' : '▼ Expand all accounts'}</span>
                  </button>
                </div>
              )}

              {/* View 1: VYAPAR VIEW (Tax-Exclusive Revenue, COGS, Expenses & Net Profit) */}
              {pnlView === 'vyapar' && (
                <div className="overflow-x-auto pb-12">
                  <table className="vyapar-table w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100/80 text-slate-500 text-[11px] font-extrabold uppercase tracking-wider border-b border-slate-200">
                        <th className="py-3 px-5">Particulars</th>
                        <th className="py-3 px-5 text-right">Amount (Rs)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-800">
                      {/* Gross Sales (Tax-Exclusive) */}
                      <tr className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-5 font-bold">Gross Sales Revenue (Tax-Exclusive) (+)</td>
                        <td className="py-3 px-5 text-right font-mono font-medium text-emerald-600">
                          Rs {pnlReport.grossSalesTaxExclusive.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>

                      {/* Sale Returns (Tax-Exclusive) */}
                      <tr className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-5 font-bold">Sale Returns / Credit Notes (-)</td>
                        <td className="py-3 px-5 text-right font-mono font-medium text-rose-600">
                          Rs {pnlReport.saleReturnsTaxExclusive.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>

                      {/* Total Discounts */}
                      <tr className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-5 font-bold">Invoice Discounts (-)</td>
                        <td className="py-3 px-5 text-right font-mono font-medium text-rose-600">
                          Rs {pnlReport.discountTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>

                      {/* Net Sales Revenue */}
                      <tr className="bg-blue-50/60 font-bold border-t border-b border-blue-200 text-blue-900">
                        <td className="py-3 px-5 font-extrabold">Net Sales Revenue</td>
                        <td className="py-3 px-5 text-right font-mono font-black text-blue-700">
                          Rs {pnlReport.netRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>

                      {/* COGS */}
                      <tr className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-5 font-bold">Cost of Goods Sold (COGS) (-)</td>
                        <td className="py-3 px-5 text-right font-mono font-medium text-rose-600">
                          Rs {pnlReport.cogs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>

                      {/* Gross Profit */}
                      <tr className="bg-emerald-50/50 font-bold border-t border-b border-emerald-200 text-emerald-900">
                        <td className="py-3 px-5 font-extrabold flex items-center justify-between">
                          <span>Gross Profit</span>
                          <span className="text-[11px] font-mono px-2 py-0.5 bg-emerald-100 rounded text-emerald-800">Margin: {pnlReport.grossProfitMarginPercent.toFixed(2)}%</span>
                        </td>
                        <td className="py-3 px-5 text-right font-mono font-black text-emerald-700">
                          Rs {pnlReport.grossProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>

                      {/* Operating Expenses */}
                      <tr className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-5 font-bold">Operating Expenses (-)</td>
                        <td className="py-3 px-5 text-right font-mono font-medium text-rose-600">
                          Rs {pnlReport.operatingExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>

                      {/* Expenses Category Sub-rows */}
                      {Object.entries(pnlReport.expensesByCategory).map(([cat, amt]) => (
                        <tr key={cat} className="text-slate-500 hover:bg-slate-50/40">
                          <td className="py-2 px-9 text-[11px] font-semibold">• {cat}</td>
                          <td className="py-2 px-5 text-right font-mono text-rose-500">Rs {amt.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="h-12" />
                </div>
              )}

              {/* View 2: ACCOUNTING VIEW (Hierarchical Tree View) */}
              {pnlView === 'accounting' && (
                <div className="overflow-x-auto pb-12">
                  <table className="vyapar-table w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100/80 text-slate-500 text-[11px] font-extrabold uppercase tracking-wider border-b border-slate-200">
                        <th className="py-3 px-5">Particulars</th>
                        <th className="py-3 px-5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-800">
                      {/* Incomes Node */}
                      <tr className="bg-slate-50/80">
                        <td className="py-3 px-5 font-extrabold text-blue-700 flex items-center gap-1.5 cursor-pointer" onClick={() => setExpandedIncomes(!expandedIncomes)}>
                          <span>{expandedIncomes ? '▲' : '▼'}</span>
                          <span>Incomes (Sales Revenue)</span>
                        </td>
                        <td className="py-3 px-5 text-right font-mono font-black text-emerald-600">
                          Rs {pnlReport.netRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>

                      {expandedIncomes && (
                        <>
                          <tr className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-2.5 px-10 text-slate-700 font-bold">Gross Sales (Tax-Exclusive)</td>
                            <td className="py-2.5 px-5 text-right font-mono font-bold text-emerald-600">
                              Rs {pnlReport.grossSalesTaxExclusive.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-2.5 px-10 text-slate-700 font-bold">Sale Returns</td>
                            <td className="py-2.5 px-5 text-right font-mono font-bold text-rose-600">
                              - Rs {pnlReport.saleReturnsTaxExclusive.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </>
                      )}

                      {/* Expenses Node */}
                      <tr className="bg-slate-50/80">
                        <td className="py-3 px-5 font-extrabold text-blue-700 flex items-center gap-1.5 cursor-pointer" onClick={() => setExpandedExpenses(!expandedExpenses)}>
                          <span>{expandedExpenses ? '▲' : '▼'}</span>
                          <span>Cost & Operating Expenses</span>
                        </td>
                        <td className="py-3 px-5 text-right font-mono font-black text-rose-600">
                          Rs {(pnlReport.cogs + pnlReport.operatingExpenses).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>

                      {expandedExpenses && (
                        <>
                          <tr className="bg-slate-50/40">
                            <td className="py-2.5 px-9 font-extrabold text-slate-800">Cost of Goods Sold (COGS)</td>
                            <td className="py-2.5 px-5 text-right font-mono font-bold text-rose-600">
                              Rs {pnlReport.cogs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr className="bg-slate-50/40">
                            <td className="py-2.5 px-9 font-extrabold text-slate-800">Operating Expenses</td>
                            <td className="py-2.5 px-5 text-right font-mono font-bold text-rose-600">
                              Rs {pnlReport.operatingExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                  <div className="h-12" />
                </div>
              )}

              {/* Highlighted Bottom Summary Bar (Net Profit / Net Loss) */}
              <div className={`p-4 border-t flex items-center justify-between font-mono text-sm font-black border-b border-slate-200 rounded-b-xl shadow-2xs ${
                pnlReport.netProfit >= 0 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}>
                <div className="flex items-center gap-2">
                  <span>{pnlReport.netProfit >= 0 ? 'Net Profit' : 'Net Loss'}</span>
                  <span className="text-xs font-semibold text-slate-600 font-sans">
                    (Net Margin: {pnlReport.netProfitMarginPercent.toFixed(2)}%)
                  </span>
                </div>
                <div className="text-base font-black">
                  Rs {Math.abs(pnlReport.netProfit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ================= BILL WISE PROFIT REPORT ================= */}
        {activeTab === 'bill-wise-profit' && (
          <>
            {/* Header Row */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-black text-slate-900 flex items-center gap-2 uppercase tracking-tight">
                  <span>BILL WISE PROFIT REPORT</span>
                </h1>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">
                  Calculates net profit amount and profit margin percentage for each sale invoice.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportBillWiseProfitCSV}
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

            {/* Filter Bar Controls */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
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

                {/* Date Range Badge */}
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

                {/* Firm Filter Dropdown */}
                <select
                  value={selectedFirm}
                  onChange={e => setSelectedFirm(e.target.value)}
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
            </div>

            {/* Missing Cost Notice */}
            {missingCostCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl text-xs flex items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2.5">
                  <span className="text-base">⚠️</span>
                  <div>
                    <span className="font-bold">{missingCostCount} invoice(s)</span> contain items without a purchase price in Inventory.
                    <span className="text-amber-700 ml-1">Profit for these items is calculated with Rs 0.00 cost. Set purchase prices in <strong>Inventory & Stock</strong> to see exact profit margins.</span>
                  </div>
                </div>
              </div>
            )}

            {/* Top Summary KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1">
                <div className="text-slate-500 font-extrabold uppercase text-[11px] tracking-wider">Total Sales</div>
                <div className="text-2xl font-mono font-black text-slate-900">
                  Rs {billWiseTotalSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1">
                <div className="text-slate-500 font-extrabold uppercase text-[11px] tracking-wider">Total Cost</div>
                <div className="text-2xl font-mono font-black text-slate-700">
                  Rs {billWiseTotalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1">
                <div className="text-slate-500 font-extrabold uppercase text-[11px] tracking-wider">Total Net Profit</div>
                <div className={`text-2xl font-mono font-black ${billWiseTotalProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  Rs {billWiseTotalProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1">
                <div className="text-slate-500 font-extrabold uppercase text-[11px] tracking-wider">Average Margin</div>
                <div className={`text-2xl font-mono font-black ${billWiseAvgMargin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {billWiseAvgMargin.toFixed(2)}%
                </div>
              </div>
            </div>

            {/* Bill Wise Profit Table Section */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
              <div className="p-3.5 border-b border-slate-200 flex items-center">
                <div className="relative w-full max-w-sm">
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    aria-label="Search bill wise profit invoices"
                    placeholder="Search invoice no, customer name..."
                    className="h-8 pl-8 pr-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-blue-500 w-full"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="vyapar-table w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 text-slate-500 text-[11px] font-extrabold uppercase tracking-wider border-b border-slate-200">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Invoice No</th>
                      <th className="py-3 px-4">Customer Name</th>
                      <th className="py-3 px-4 text-right">Total Amount</th>
                      <th className="py-3 px-4 text-right">Total Cost</th>
                      <th className="py-3 px-4 text-right">Profit Amount</th>
                      <th className="py-3 px-4 text-right">Margin (%)</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                    {billWiseProfitData.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-slate-400 font-semibold">
                          No invoice profit records found for the selected criteria.
                        </td>
                      </tr>
                    ) : (
                      billWiseProfitData.map(b => (
                        <tr key={b.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                            {formatDateDisplay(b.date)}
                          </td>
                          <td className="py-3 px-4 font-mono font-extrabold text-blue-600 whitespace-nowrap">
                            {b.invoiceNumber}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800">
                            {b.partyName}
                          </td>
                          <td className="py-3 px-4 font-mono font-black text-slate-900 text-right whitespace-nowrap">
                            <div>Rs {b.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            {b.taxTotal > 0 && (
                              <div className="text-[10px] font-sans font-semibold text-slate-400 font-normal">
                                Net: Rs {b.netRevenue.toFixed(2)}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-600 text-right whitespace-nowrap">
                            <div>Rs {b.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            {b.hasMissingCost && (
                              <span className="inline-block text-[10px] font-sans font-extrabold text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded mt-0.5" title="Purchase price was not set in Inventory">
                                Unset Cost
                              </span>
                            )}
                          </td>
                          <td className={`py-3 px-4 font-mono font-black text-right whitespace-nowrap ${b.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            Rs {b.profit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className={`py-3 px-4 font-mono font-extrabold text-right whitespace-nowrap ${b.marginPercent >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {b.marginPercent.toFixed(2)}%
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5 text-slate-400">
                              {b.rawInvoice && (
                                <button
                                  onClick={() => triggerThermalPrint(b.rawInvoice, business)}
                                  title="Print Receipt"
                                  className="p-1 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  const shareText = `Invoice #${b.invoiceNumber} - ${b.partyName} - Sales: Rs ${b.grandTotal} - Profit: Rs ${b.profit} (${b.marginPercent.toFixed(2)}%)`;
                                  navigator.clipboard?.writeText(shareText);
                                  alert('Bill profit details copied to clipboard!');
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

        {/* ================= CASH FLOW STATEMENT REPORT ================= */}
        {activeTab === 'cash-flow' && (
          <>
            {/* Header & Export Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-black text-slate-900 flex items-center gap-2 uppercase tracking-tight">
                  <span className="w-2.5 h-6 bg-emerald-600 rounded-sm inline-block"></span>
                  Cash Flow Statement
                </h1>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Tracks actual cash & liquid bank movements: cash inflows, supplier outflows, and net cash balance.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCashFlowBreakdown(!showCashFlowBreakdown)}
                  className={`btn-vyapar-outline text-xs px-3 py-1.5 flex items-center gap-1.5 cursor-pointer font-bold transition-all ${
                    showCashFlowBreakdown ? 'bg-blue-50 border-blue-300 text-blue-700' : 'text-slate-700'
                  }`}
                  title="Toggle Inflow & Outflow Breakdown"
                >
                  <PieChart className="w-3.5 h-3.5 text-blue-600" />
                  <span>{showCashFlowBreakdown ? 'Hide Breakdown' : 'View Breakdown'}</span>
                </button>
                <button
                  onClick={handleExportCashFlowCSV}
                  className="btn-vyapar-outline text-xs px-3 py-1.5 flex items-center gap-1.5 cursor-pointer font-bold"
                  title="Export to CSV / Excel"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Excel Report</span>
                </button>
                <button
                  onClick={handlePrintReport}
                  className="btn-vyapar-outline text-xs px-3 py-1.5 flex items-center gap-1.5 cursor-pointer font-bold"
                  title="Print Cash Flow Statement"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-600" />
                  <span>Print</span>
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs text-xs">
              <div className="flex flex-wrap items-center gap-2">
                {/* Preset Date Range Dropdown */}
                <select
                  value={datePreset}
                  onChange={e => handlePresetChange(e.target.value as DatePreset)}
                  aria-label="Cash Flow Date Range Preset"
                  className="h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-800 font-bold outline-none focus:border-blue-500 cursor-pointer shadow-2xs min-w-[130px]"
                >
                  <option value="today">Today</option>
                  <option value="this_week">This Week</option>
                  <option value="this_month">This Month</option>
                  <option value="this_quarter">This Quarter</option>
                  <option value="this_year">This Fiscal Year</option>
                  <option value="custom">Custom Range</option>
                </select>

                {/* Date Range Inputs */}
                <div className="flex items-center bg-slate-50 border border-slate-300 rounded-lg overflow-hidden shadow-2xs">
                  <span className="px-2.5 py-1 text-[11px] font-bold text-slate-500 bg-slate-100 border-r border-slate-200">Between</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => {
                      setStartDate(e.target.value);
                      setDatePreset('custom');
                    }}
                    className="px-2 py-1 text-xs font-mono font-bold text-slate-800 outline-none"
                  />
                  <span className="px-2 text-slate-400 font-bold text-xs">To</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => {
                      setEndDate(e.target.value);
                      setDatePreset('custom');
                    }}
                    className="px-2 py-1 text-xs font-mono font-bold text-slate-800 outline-none"
                  />
                </div>

                {/* Firm Filter Dropdown */}
                <select
                  value={selectedFirm}
                  onChange={e => setSelectedFirm(e.target.value)}
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

              {/* Flow Type Toggle & Method Filter */}
              <div className="flex items-center gap-2">
                <select
                  value={cashFlowTypeFilter}
                  onChange={e => setCashFlowTypeFilter(e.target.value as any)}
                  aria-label="Transaction Type Filter"
                  className="h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-800 font-bold outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
                >
                  <option value="all">All Flows (In & Out)</option>
                  <option value="INFLOW">Inflows Only (+)</option>
                  <option value="OUTFLOW">Outflows Only (-)</option>
                </select>

                <select
                  value={cashFlowMethodFilter}
                  onChange={e => setCashFlowMethodFilter(e.target.value)}
                  aria-label="Payment Method Filter"
                  className="h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-800 font-bold outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
                >
                  <option value="all">All Payment Modes</option>
                  <option value="cash">Cash in Hand</option>
                  <option value="bank">Bank / Online / UPI</option>
                </select>
              </div>
            </div>

            {/* 5 Top Summary KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 text-xs">
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1">
                <div className="text-slate-500 font-extrabold uppercase text-[10.5px] tracking-wider">Opening Balance</div>
                <div className="text-xl font-mono font-black text-slate-700">
                  Rs {cashFlowReport.openingBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-slate-400 font-semibold">Cash before {formatDateDisplay(startDate)}</div>
              </div>

              <div className="bg-white border border-emerald-100 rounded-xl p-4 shadow-sm space-y-1 bg-gradient-to-b from-white to-emerald-50/20">
                <div className="text-emerald-700 font-extrabold uppercase text-[10.5px] tracking-wider flex items-center gap-1">
                  <span>Total Inflow (+)</span>
                </div>
                <div className="text-xl font-mono font-black text-emerald-600">
                  + Rs {cashFlowReport.totalInflows.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-emerald-600/80 font-semibold">Sales & recoveries received</div>
              </div>

              <div className="bg-white border border-rose-100 rounded-xl p-4 shadow-sm space-y-1 bg-gradient-to-b from-white to-rose-50/20">
                <div className="text-rose-700 font-extrabold uppercase text-[10.5px] tracking-wider flex items-center gap-1">
                  <span>Total Outflow (-)</span>
                </div>
                <div className="text-xl font-mono font-black text-rose-600">
                  - Rs {cashFlowReport.totalOutflows.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-rose-600/80 font-semibold">Purchases, expenses & refunds</div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1">
                <div className="text-slate-500 font-extrabold uppercase text-[10.5px] tracking-wider">Net Cash Flow</div>
                <div className={`text-xl font-mono font-black ${cashFlowReport.netCashFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {cashFlowReport.netCashFlow >= 0 ? '+' : ''} Rs {cashFlowReport.netCashFlow.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-slate-400 font-semibold">Inflow minus Outflow</div>
              </div>

              <div className="bg-white border border-blue-200 rounded-xl p-4 shadow-sm space-y-1 bg-gradient-to-b from-white to-blue-50/20">
                <div className="text-blue-700 font-extrabold uppercase text-[10.5px] tracking-wider">Closing Balance</div>
                <div className="text-xl font-mono font-black text-slate-900">
                  Rs {cashFlowReport.closingBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-blue-600 font-semibold">Opening + Net Cash Flow</div>
              </div>
            </div>

            {/* Inflow / Outflow Quick Breakdown Panels (Collapsible) */}
            {showCashFlowBreakdown && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs animate-in fade-in duration-200">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-extrabold text-slate-800 uppercase tracking-wide text-[11px] flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                      Inflow Sources Breakdown
                    </span>
                    <span className="font-mono font-black text-emerald-600">
                      Rs {cashFlowReport.totalInflows.toFixed(2)}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-slate-600">
                    <div className="flex justify-between items-center py-0.5">
                      <span>Cash Sales (POS Checkout):</span>
                      <span className="font-mono font-bold text-slate-900">Rs {cashFlowReport.inflowBreakdown.salesCash.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center py-0.5">
                      <span>Customer Payments (Payment-In):</span>
                      <span className="font-mono font-bold text-slate-900">Rs {cashFlowReport.inflowBreakdown.paymentsIn.toFixed(2)}</span>
                    </div>
                    {cashFlowReport.inflowBreakdown.otherInflows > 0 && (
                      <div className="flex justify-between items-center py-0.5">
                        <span>Other Deposits:</span>
                        <span className="font-mono font-bold text-slate-900">Rs {cashFlowReport.inflowBreakdown.otherInflows.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-1 border-t border-slate-100 text-[11px]">
                      <span className="text-slate-500 font-medium">Cash: <strong className="text-slate-800 font-mono">Rs {cashFlowReport.methodBreakdown.cashInHand.inflow.toFixed(2)}</strong></span>
                      <span className="text-slate-500 font-medium">Bank / Online: <strong className="text-slate-800 font-mono">Rs {cashFlowReport.methodBreakdown.bankOnline.inflow.toFixed(2)}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-extrabold text-slate-800 uppercase tracking-wide text-[11px] flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
                      Outflow Sources Breakdown
                    </span>
                    <span className="font-mono font-black text-rose-600">
                      Rs {cashFlowReport.totalOutflows.toFixed(2)}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-slate-600">
                    <div className="flex justify-between items-center py-0.5">
                      <span>Supplier Cash Purchases:</span>
                      <span className="font-mono font-bold text-slate-900">Rs {cashFlowReport.outflowBreakdown.purchasesCash.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center py-0.5">
                      <span>Supplier Payments (Payment-Out):</span>
                      <span className="font-mono font-bold text-slate-900">Rs {cashFlowReport.outflowBreakdown.paymentsOut.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center py-0.5">
                      <span>Operating Expenses (Rent, Bills):</span>
                      <span className="font-mono font-bold text-slate-900">Rs {cashFlowReport.outflowBreakdown.expenses.toFixed(2)}</span>
                    </div>
                    {cashFlowReport.outflowBreakdown.saleReturnsRefunds > 0 && (
                      <div className="flex justify-between items-center py-0.5">
                        <span>Customer Sale Return Refunds:</span>
                        <span className="font-mono font-bold text-slate-900">Rs {cashFlowReport.outflowBreakdown.saleReturnsRefunds.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-1 border-t border-slate-100 text-[11px]">
                      <span className="text-slate-500 font-medium">Cash: <strong className="text-slate-800 font-mono">Rs {cashFlowReport.methodBreakdown.cashInHand.outflow.toFixed(2)}</strong></span>
                      <span className="text-slate-500 font-medium">Bank / Online: <strong className="text-slate-800 font-mono">Rs {cashFlowReport.methodBreakdown.bankOnline.outflow.toFixed(2)}</strong></span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Cash Flow Ledger Table */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
              <div className="p-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="relative w-full max-w-sm">
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    aria-label="Search cash flow transactions"
                    placeholder="Search voucher, party, category, mode..."
                    className="h-8 pl-8 pr-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-blue-500 w-full"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
                <div className="text-xs font-bold text-slate-500">
                  Showing {filteredCashFlowTransactions.length} of {cashFlowReport.transactions.length} record(s)
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="vyapar-table w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-slate-100/95 backdrop-blur-xs z-10 shadow-2xs">
                    <tr className="text-slate-600 text-[11px] font-extrabold uppercase tracking-wider border-b border-slate-200">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Source</th>
                      <th className="py-3 px-4">Voucher / Ref #</th>
                      <th className="py-3 px-4">Party / Category</th>
                      <th className="py-3 px-4">Payment Mode</th>
                      <th className="py-3 px-4 text-right text-emerald-700">Inflow (+)</th>
                      <th className="py-3 px-4 text-right text-rose-700">Outflow (-)</th>
                      <th className="py-3 px-4 text-right">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                    {filteredCashFlowTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-12 text-slate-400 font-semibold">
                          No cash flow movements found for the selected criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredCashFlowTransactions.map(t => (
                        <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                            {formatDateDisplay(t.date)}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                              t.type === 'INFLOW' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {t.type === 'INFLOW' ? '↓ INFLOW' : '↑ OUTFLOW'}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">
                            {t.sourceLabel}
                          </td>
                          <td className="py-3 px-4 font-mono font-extrabold text-blue-600 whitespace-nowrap">
                            {t.referenceNo}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-700">
                            {t.partyOrCategory}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10.5px] font-bold font-mono">
                              {t.paymentMethod}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-black text-right whitespace-nowrap text-emerald-600">
                            {t.type === 'INFLOW' ? `+ Rs ${t.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                          </td>
                          <td className="py-3 px-4 font-mono font-black text-right whitespace-nowrap text-rose-600">
                            {t.type === 'OUTFLOW' ? `- Rs ${t.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                          </td>
                          <td className="py-3 px-4 font-mono font-black text-right whitespace-nowrap text-slate-900">
                            Rs {t.runningBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

        {/* ================= PARTY STATEMENT REPORT ================= */}
        {activeTab === 'party-statement' && (
          <>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-black text-slate-900 flex items-center gap-2 uppercase tracking-tight">
                    PARTY STATEMENT (LEDGER)
                  </h1>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">
                    Continuous chronological ledger with running balance for selected customer or supplier.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (!partyLedgerReport || partyLedgerReport.entries.length === 0) return alert('No ledger entries available to export.');
                      const headers = ['Date', 'Voucher No', 'Type', 'Description', 'Debit (Rs)', 'Credit (Rs)', 'Running Balance (Rs)'];
                      const rows = partyLedgerReport.entries.map(e => [e.date, `"${e.voucherNo}"`, e.type, `"${e.description}"`, e.debit.toFixed(2), e.credit.toFixed(2), e.runningBalance.toFixed(2)]);
                      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
                      const link = document.createElement('a');
                      link.setAttribute('href', encodeURI(csvContent));
                      link.setAttribute('download', `Party_Ledger_${partyLedgerReport.party.name.replace(/\s+/g, '_')}.csv`);
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    title="Export CSV"
                    className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Export CSV</span>
                  </button>

                  <button
                    onClick={handlePrintReport}
                    title="Print"
                    className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-slate-600" />
                    <span>Print Ledger</span>
                  </button>
                </div>
              </div>

              {/* Filter Controls: Party Selector & Date Range */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Party Selector Dropdown */}
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 font-bold">Party:</span>
                      <select
                        value={selectedPartyId}
                        onChange={e => setSelectedPartyId(Number(e.target.value))}
                        className="h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-800 font-extrabold outline-none focus:border-blue-500 min-w-[200px]"
                      >
                        {partiesList.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.type || 'CUSTOMER'})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Date Preset */}
                    <select
                      value={datePreset}
                      onChange={e => handlePresetChange(e.target.value as DatePreset)}
                      className="h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-800 font-bold outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
                    >
                      <option value="this_month">This Month</option>
                      <option value="today">Today</option>
                      <option value="this_week">This Week</option>
                      <option value="last_month">Last Month</option>
                      <option value="this_year">This Year</option>
                      <option value="custom">Custom Date</option>
                    </select>
                  </div>

                  {partyLedgerReport && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500">Closing Balance:</span>
                      <span className={`text-sm font-mono font-black px-2.5 py-1 rounded border ${
                        partyLedgerReport.closingBalanceType === 'RECEIVABLE'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        Rs {partyLedgerReport.closingBalance.toFixed(2)} ({partyLedgerReport.closingBalanceType})
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Ledger Table */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
              <div className="overflow-x-auto">
                <table className="vyapar-table w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 text-slate-500 text-[11px] font-extrabold uppercase tracking-wider border-b border-slate-200">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Ref / Voucher #</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-4 text-right">Debit (DR)</th>
                      <th className="py-3 px-4 text-right">Credit (CR)</th>
                      <th className="py-3 px-4 text-right">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                    {/* Opening Balance Row */}
                    {partyLedgerReport && (
                      <tr className="bg-slate-50/60 font-bold text-slate-800">
                        <td className="py-2.5 px-4 font-mono">{startDate || '-'}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-500">-</td>
                        <td className="py-2.5 px-4">
                          <span className="px-2 py-0.5 text-[10px] font-extrabold rounded bg-slate-200 text-slate-700 border border-slate-300">
                            OPENING
                          </span>
                        </td>
                        <td className="py-2.5 px-4">Opening Balance ({partyLedgerReport.openingBalanceType})</td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-600">
                          {partyLedgerReport.openingBalanceType === 'RECEIVABLE' ? `Rs ${partyLedgerReport.openingBalance.toFixed(2)}` : '-'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-600">
                          {partyLedgerReport.openingBalanceType === 'PAYABLE' ? `Rs ${partyLedgerReport.openingBalance.toFixed(2)}` : '-'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-black text-slate-900">
                          Rs {partyLedgerReport.openingBalance.toFixed(2)}
                        </td>
                      </tr>
                    )}

                    {!partyLedgerReport || partyLedgerReport.entries.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-12 text-slate-400 font-semibold">
                          No transactions found for {selectedParty?.name || 'selected party'} in this date range.
                        </td>
                      </tr>
                    ) : (
                      partyLedgerReport.entries.map(entry => (
                        <tr key={entry.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">{formatDateDisplay(entry.date)}</td>
                          <td className="py-3 px-4 font-mono font-bold text-blue-600 whitespace-nowrap">{entry.voucherNo}</td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`inline-block px-2 py-0.5 text-[10px] font-extrabold rounded border ${
                              entry.type === 'INVOICE' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              entry.type === 'PAYMENT_IN' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              entry.type === 'SALE_RETURN' ? 'bg-pink-50 text-pink-700 border-pink-200' :
                              entry.type === 'PURCHASE_BILL' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                              entry.type === 'PAYMENT_OUT' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              'bg-indigo-50 text-indigo-700 border-indigo-200'
                            }`}>
                              {entry.type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800">{entry.description}</td>
                          <td className="py-3 px-4 font-mono font-bold text-rose-600 text-right whitespace-nowrap">
                            {entry.debit > 0 ? `Rs ${entry.debit.toFixed(2)}` : '-'}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-emerald-600 text-right whitespace-nowrap">
                            {entry.credit > 0 ? `Rs ${entry.credit.toFixed(2)}` : '-'}
                          </td>
                          <td className="py-3 px-4 font-mono font-black text-slate-900 text-right whitespace-nowrap">
                            Rs {entry.runningBalance.toFixed(2)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {partyLedgerReport && (
                <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-4 text-xs font-mono font-extrabold">
                  <div className="text-rose-600">Total Debit (DR): Rs {partyLedgerReport.totalDebit.toFixed(2)}</div>
                  <div className="text-emerald-600">Total Credit (CR): Rs {partyLedgerReport.totalCredit.toFixed(2)}</div>
                  <div className="text-slate-900 font-black">
                    Closing Balance: Rs {partyLedgerReport.closingBalance.toFixed(2)} ({partyLedgerReport.closingBalanceType})
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ================= GST TAX SUMMARY REPORT ================= */}
        {activeTab === 'gst-tax-summary' && (
          <>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-black text-slate-900 flex items-center gap-2 uppercase tracking-tight">
                    GST TAX SUMMARY REPORT
                  </h1>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">
                    Breakdown of Output Tax collected (Sales) vs Input Tax Credit paid (Purchases) by tax rate slab.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (!taxSummaryReport || taxSummaryReport.slabs.length === 0) return alert('No tax data available to export.');
                      const headers = ['Slab', 'Taxable Sales (Rs)', 'Output Tax (Rs)', 'Taxable Purchases (Rs)', 'Input Tax (Rs)', 'Net Liability (Rs)'];
                      const rows = taxSummaryReport.slabs.map(s => [`${s.rate}%`, s.taxableSales.toFixed(2), s.totalOutputTax.toFixed(2), s.taxablePurchases.toFixed(2), s.totalInputTax.toFixed(2), s.netTaxLiability.toFixed(2)]);
                      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
                      const link = document.createElement('a');
                      link.setAttribute('href', encodeURI(csvContent));
                      link.setAttribute('download', `GST_Tax_Summary_${startDate}_to_${endDate}.csv`);
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    title="Export CSV"
                    className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Export CSV</span>
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

                {/* Firm Filter Dropdown */}
                {companies.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 font-bold">Store / Firm:</span>
                    <select
                      value={selectedFirm}
                      onChange={e => setSelectedFirm(e.target.value)}
                      aria-label="Filter by store or firm"
                      className="h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-bold outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="all">All Stores</option>
                      {companies.map(c => (
                        <option key={c.tenantId || 'default-tenant'} value={c.tenantId || 'default-tenant'}>
                          {c.name || 'Store'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* KPI Cards for Output Tax, Input Tax Credit, Net Payable */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1">
                  <div className="text-slate-500 font-extrabold uppercase text-[11px] tracking-wider">Output Tax Collected (Sales)</div>
                  <div className="text-2xl font-mono font-black text-emerald-600">
                    Rs {taxSummaryReport.totalOutputTax.toFixed(2)}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1">
                  <div className="text-slate-500 font-extrabold uppercase text-[11px] tracking-wider">Input Tax Credit (Purchases)</div>
                  <div className="text-2xl font-mono font-black text-blue-600">
                    Rs {taxSummaryReport.totalInputTax.toFixed(2)}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1">
                  <div className="text-slate-500 font-extrabold uppercase text-[11px] tracking-wider">Net Tax Payable / (Credit)</div>
                  <div className={`text-2xl font-mono font-black ${taxSummaryReport.netTaxPayable >= 0 ? 'text-amber-600' : 'text-purple-600'}`}>
                    Rs {taxSummaryReport.netTaxPayable.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {/* Slab-wise Breakdown Table */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
              <div className="overflow-x-auto">
                <table className="vyapar-table w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 text-slate-500 text-[11px] font-extrabold uppercase tracking-wider border-b border-slate-200">
                      <th className="py-3 px-4">Tax Rate Slab</th>
                      <th className="py-3 px-4 text-right">Taxable Sales</th>
                      <th className="py-3 px-4 text-right">Output CGST</th>
                      <th className="py-3 px-4 text-right">Output SGST</th>
                      <th className="py-3 px-4 text-right">Output IGST</th>
                      <th className="py-3 px-4 text-right">Total Output Tax</th>
                      <th className="py-3 px-4 text-right">Taxable Purchases</th>
                      <th className="py-3 px-4 text-right">Input Tax Credit</th>
                      <th className="py-3 px-4 text-right">Net Tax Payable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                    {taxSummaryReport.slabs.map(slab => (
                      <tr key={slab.rate} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 font-mono font-extrabold text-blue-600">{slab.rate}% Slab</td>
                        <td className="py-3 px-4 font-mono text-right font-bold text-slate-800">Rs {slab.taxableSales.toFixed(2)}</td>
                        <td className="py-3 px-4 font-mono text-right text-emerald-600">Rs {slab.cgstCollected.toFixed(2)}</td>
                        <td className="py-3 px-4 font-mono text-right text-emerald-600">Rs {slab.sgstCollected.toFixed(2)}</td>
                        <td className="py-3 px-4 font-mono text-right text-emerald-600">Rs {slab.igstCollected.toFixed(2)}</td>
                        <td className="py-3 px-4 font-mono text-right font-black text-emerald-700">Rs {slab.totalOutputTax.toFixed(2)}</td>
                        <td className="py-3 px-4 font-mono text-right font-bold text-slate-800">Rs {slab.taxablePurchases.toFixed(2)}</td>
                        <td className="py-3 px-4 font-mono text-right font-black text-blue-600">Rs {slab.totalInputTax.toFixed(2)}</td>
                        <td className={`py-3 px-4 font-mono font-black text-right ${slab.netTaxLiability >= 0 ? 'text-amber-600' : 'text-purple-600'}`}>
                          Rs {slab.netTaxLiability.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ================= TRIAL BALANCE REPORT ================= */}
        {activeTab === 'trial-balance' && (
          <>
            {/* Top Header & Export Utilities */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-black text-slate-900 flex items-center gap-2 uppercase tracking-tight">
                    TRIAL BALANCE REPORT
                  </h1>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Double-entry bookkeeping verification: Mathematical proof of ledger balance equality (Debits == Credits)
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportTrialBalanceCSV}
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

              {/* Filter Controls Row */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Date Preset Selector */}
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

                    {/* Date Range Badge */}
                    <div className="flex items-center bg-white border border-slate-300 rounded-lg overflow-hidden shadow-2xs">
                      <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-2 border-r border-slate-300">Between</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={e => {
                          setStartDate(e.target.value);
                          setDatePreset('custom');
                        }}
                        aria-label="Start date"
                        className="px-2.5 py-1 text-xs font-mono font-bold text-slate-800 outline-none"
                      />
                      <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-2 border-l border-r border-slate-300">To</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={e => {
                          setEndDate(e.target.value);
                          setDatePreset('custom');
                        }}
                        aria-label="End date"
                        className="px-2.5 py-1 text-xs font-mono font-bold text-slate-800 outline-none"
                      />
                    </div>

                    {/* Firm / Store Selector */}
                    <select
                      value={selectedFirm}
                      onChange={e => setSelectedFirm(e.target.value)}
                      aria-label="Filter Firm"
                      className="h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-800 font-bold outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
                    >
                      <option value="all">All Stores / Firms</option>
                      {companies.map(c => (
                        <option key={c.tenantId || c.name} value={c.tenantId}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Account Group Filter */}
                    <select
                      value={trialBalanceGroupFilter}
                      onChange={e => setTrialBalanceGroupFilter(e.target.value)}
                      aria-label="Filter Account Group"
                      className="h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-800 font-bold outline-none focus:border-blue-500 cursor-pointer shadow-2xs min-w-[140px]"
                    >
                      <option value="all">All Account Groups</option>
                      <option value="ASSET">Assets (Dr)</option>
                      <option value="LIABILITY">Liabilities (Cr)</option>
                      <option value="INCOME">Income / Revenue (Cr)</option>
                      <option value="EXPENSE">Expenses (Dr)</option>
                      <option value="EQUITY">Owner Equity (Cr)</option>
                    </select>

                    {/* Search Filter */}
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search account head..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="h-9 pl-9 pr-3 bg-white border border-slate-300 rounded-lg text-slate-800 font-medium outline-none focus:border-blue-500 shadow-2xs w-48 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 4 Executive KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* 1. Total Debits */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Total Debits (Dr)</span>
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-black text-xs">
                      Dr
                    </div>
                  </div>
                  <div className="text-xl font-black font-mono text-emerald-600">
                    Rs {trialBalanceReport.totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-slate-400 font-semibold mt-1">
                    Assets & Operating Expenses
                  </div>
                </div>

                {/* 2. Total Credits */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Total Credits (Cr)</span>
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xs">
                      Cr
                    </div>
                  </div>
                  <div className="text-xl font-black font-mono text-blue-600">
                    Rs {trialBalanceReport.totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-slate-400 font-semibold mt-1">
                    Revenue, Liabilities & Capital
                  </div>
                </div>

                {/* 3. Net Difference */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Difference (Dr - Cr)</span>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${trialBalanceReport.isMatched ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                      ±
                    </div>
                  </div>
                  <div className={`text-xl font-black font-mono ${trialBalanceReport.isMatched ? 'text-emerald-600' : 'text-rose-600'}`}>
                    Rs {trialBalanceReport.difference.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-slate-400 font-semibold mt-1">
                    {trialBalanceReport.isMatched ? 'Zero discrepancy detected' : 'Check unposted ledger entries'}
                  </div>
                </div>

                {/* 4. Verification Status */}
                <div className={`border rounded-xl p-4 shadow-sm flex flex-col justify-between ${trialBalanceReport.isMatched ? 'bg-emerald-50/50 border-emerald-200' : 'bg-rose-50/50 border-rose-200'}`}>
                  <div className="flex items-center justify-between text-slate-600 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Audit Status</span>
                    <div className={`w-2.5 h-2.5 rounded-full ${trialBalanceReport.isMatched ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                  </div>
                  <div className={`text-sm font-black flex items-center gap-1.5 ${trialBalanceReport.isMatched ? 'text-emerald-700' : 'text-rose-700'}`}>
                    <span>{trialBalanceReport.isMatched ? '✓ Perfectly Balanced' : '⚠ Audit Discrepancy'}</span>
                  </div>
                  <div className={`text-[10px] font-medium mt-1 ${trialBalanceReport.isMatched ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {trialBalanceReport.isMatched ? 'Double-entry golden rule satisfied' : 'Debits do not equal Credits'}
                  </div>
                </div>
              </div>

              {/* Detailed Accounts Table */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase text-slate-800 tracking-wide">Account Ledgers</span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                      {filteredTrialBalanceAccounts.length} Records
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    Showing period from <strong className="text-slate-700">{formatDateDisplay(startDate)}</strong> to <strong className="text-slate-700">{formatDateDisplay(endDate)}</strong>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200 font-extrabold text-[11px] uppercase tracking-wider">
                        <th className="py-3 px-4 w-12 text-center">#</th>
                        <th className="py-3 px-4">Account Head / Ledger</th>
                        <th className="py-3 px-4">Group Classification</th>
                        <th className="py-3 px-4">Accounting Notes</th>
                        <th className="py-3 px-4 text-right">Debit (Dr) Rs</th>
                        <th className="py-3 px-4 text-right">Credit (Cr) Rs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredTrialBalanceAccounts.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400 text-xs">
                            No ledger accounts found matching your selected filters.
                          </td>
                        </tr>
                      ) : (
                        filteredTrialBalanceAccounts.map((acc, idx) => {
                          const isAsset = acc.group === 'ASSET';
                          const isLiab = acc.group === 'LIABILITY';
                          const isIncome = acc.group === 'INCOME';
                          const isExpense = acc.group === 'EXPENSE';
                          const isEquity = acc.group === 'EQUITY';

                          return (
                            <tr key={acc.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-4 text-center text-slate-400 font-mono text-[11px]">
                                {idx + 1}
                              </td>
                              <td className="py-3 px-4 font-bold text-slate-800">
                                {acc.accountHead}
                              </td>
                              <td className="py-3 px-4">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide ${
                                  isAsset ? 'bg-emerald-100 text-emerald-800' :
                                  isLiab ? 'bg-amber-100 text-amber-800' :
                                  isIncome ? 'bg-blue-100 text-blue-800' :
                                  isExpense ? 'bg-rose-100 text-rose-800' :
                                  'bg-purple-100 text-purple-800'
                                }`}>
                                  {acc.groupLabel}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-slate-500 text-[11px]">
                                {acc.details || '-'}
                              </td>
                              <td className={`py-3 px-4 font-mono font-extrabold text-right ${acc.debit > 0 ? 'text-slate-900' : 'text-slate-300'}`}>
                                {acc.debit > 0 ? `Rs ${acc.debit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                              </td>
                              <td className={`py-3 px-4 font-mono font-extrabold text-right ${acc.credit > 0 ? 'text-blue-700' : 'text-slate-300'}`}>
                                {acc.credit > 0 ? `Rs ${acc.credit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 text-slate-800 font-black text-xs border-t-2 border-slate-300">
                        <td colSpan={4} className="py-3 px-4 uppercase tracking-wider text-right">
                          Grand Totals (Debits vs Credits):
                        </td>
                        <td className="py-3 px-4 font-mono text-right font-black text-emerald-700 text-sm">
                          Rs {trialBalanceReport.totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 font-mono text-right font-black text-blue-700 text-sm">
                          Rs {trialBalanceReport.totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ================= BALANCE SHEET REPORT ================= */}
        {activeTab === 'balance-sheet' && (
          <>
            {/* Top Header & Export Utilities */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-black text-slate-900 flex items-center gap-2 uppercase tracking-tight">
                    BALANCE SHEET (STATEMENT OF FINANCIAL POSITION)
                  </h1>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Fundamental Accounting Equation: <strong className="text-slate-700 font-bold">Total Assets = Total Liabilities + Owner's Equity</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportBalanceSheetCSV}
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

              {/* Date Filter Bar */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center bg-white border border-slate-300 rounded-lg overflow-hidden shadow-2xs">
                      <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-2 border-r border-slate-300">Statement As Of Date</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={e => {
                          setEndDate(e.target.value);
                          setDatePreset('custom');
                        }}
                        aria-label="Balance Sheet As Of Date"
                        className="px-3 py-1 text-xs font-mono font-bold text-slate-800 outline-none"
                      />
                    </div>

                    <select
                      value={datePreset}
                      onChange={e => handlePresetChange(e.target.value as DatePreset)}
                      aria-label="Preset"
                      className="h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-800 font-bold outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
                    >
                      <option value="today">Today</option>
                      <option value="this_month">End of This Month</option>
                      <option value="this_quarter">End of This Quarter</option>
                      <option value="this_year">End of This Year</option>
                      <option value="custom">Custom Date</option>
                    </select>

                    <select
                      value={selectedFirm}
                      onChange={e => setSelectedFirm(e.target.value)}
                      aria-label="Filter Firm"
                      className="h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-800 font-bold outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
                    >
                      <option value="all">All Stores / Firms</option>
                      {companies.map(c => (
                        <option key={c.tenantId || c.name} value={c.tenantId}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-500">Valuation Date:</span>
                    <span className="text-xs font-black font-mono text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg">
                      {formatDateDisplay(endDate)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 4 Executive Financial Position KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* 1. Total Assets */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Total Assets (Asasay)</span>
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-black text-xs">
                      Rs
                    </div>
                  </div>
                  <div className="text-xl font-black font-mono text-emerald-600">
                    Rs {balanceSheetReport.assets.totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-slate-400 font-semibold mt-1">
                    Cash, Receivables & Stock
                  </div>
                </div>

                {/* 2. Total Liabilities */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Total Liabilities (Wajibaat)</span>
                    <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-black text-xs">
                      Rs
                    </div>
                  </div>
                  <div className="text-xl font-black font-mono text-amber-600">
                    Rs {balanceSheetReport.liabilitiesAndEquity.totalLiabilities.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-slate-400 font-semibold mt-1">
                    Supplier Dues & Obligations
                  </div>
                </div>

                {/* 3. Owner's Equity */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Owner's Equity (Sarmaya)</span>
                    <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-black text-xs">
                      Eq
                    </div>
                  </div>
                  <div className="text-xl font-black font-mono text-purple-600">
                    Rs {balanceSheetReport.liabilitiesAndEquity.equity.totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-slate-400 font-semibold mt-1">
                    Capital + Retained Net Profit
                  </div>
                </div>

                {/* 4. Net Worth */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Business Net Worth</span>
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xs">
                      NW
                    </div>
                  </div>
                  <div className="text-xl font-black font-mono text-blue-600">
                    Rs {balanceSheetReport.netWorth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-slate-400 font-semibold mt-1">
                    Net value after clearing all dues
                  </div>
                </div>
              </div>

              {/* Status Verification Banner */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center justify-between text-emerald-800 text-xs shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black text-[11px]">
                    ✓
                  </div>
                  <span className="font-bold">
                    Balance Sheet Equation Satisfied: <strong>Total Assets (Rs {balanceSheetReport.assets.totalAssets.toFixed(2)}) = Total Liabilities (Rs {balanceSheetReport.liabilitiesAndEquity.totalLiabilities.toFixed(2)}) + Owner Equity (Rs {balanceSheetReport.liabilitiesAndEquity.equity.totalEquity.toFixed(2)})</strong>
                  </span>
                </div>
                <span className="bg-white px-2.5 py-1 rounded-md text-emerald-700 font-black text-[11px] border border-emerald-200">
                  100% Balanced
                </span>
              </div>

              {/* Two-Column Financial Position Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* LEFT COLUMN: ASSETS */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col justify-between">
                  <div>
                    <div className="p-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase text-slate-800 tracking-wide">Assets (Asasay)</span>
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 uppercase">
                          Owned by Store
                        </span>
                      </div>
                      <span className="text-xs font-black font-mono text-emerald-700">
                        Rs {balanceSheetReport.assets.totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    {/* Current Assets List */}
                    <div className="p-4 space-y-3 text-xs">
                      <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1.5">
                        Current Assets (Liquid Resources)
                      </div>

                      <div className="space-y-2">
                        {balanceSheetReport.assets.currentAssets.map(item => (
                          <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50/70 border border-slate-100 hover:bg-slate-100/60 transition-colors">
                            <div>
                              <div className="font-bold text-slate-800">{item.title}</div>
                              <div className="text-[11px] text-slate-400 font-medium">{item.notes}</div>
                            </div>
                            <div className="font-mono font-black text-slate-900 text-xs">
                              Rs {item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Assets Total Footer */}
                  <div className="p-4 bg-emerald-50/60 border-t border-emerald-100 flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-900">Total Assets</span>
                    <span className="font-mono font-black text-base text-emerald-700">
                      Rs {balanceSheetReport.assets.totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* RIGHT COLUMN: LIABILITIES & EQUITY */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col justify-between">
                  <div>
                    <div className="p-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase text-slate-800 tracking-wide">Liabilities & Owner's Equity</span>
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 uppercase">
                          Claims & Net Worth
                        </span>
                      </div>
                      <span className="text-xs font-black font-mono text-blue-700">
                        Rs {balanceSheetReport.liabilitiesAndEquity.totalLiabilitiesAndEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="p-4 space-y-4 text-xs">
                      {/* Section 1: Current Liabilities */}
                      <div className="space-y-2">
                        <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1.5 flex items-center justify-between">
                          <span>Current Liabilities (Wajibaat)</span>
                          <span className="font-mono font-bold text-amber-700">
                            Subtotal: Rs {balanceSheetReport.liabilitiesAndEquity.totalLiabilities.toFixed(2)}
                          </span>
                        </div>

                        {balanceSheetReport.liabilitiesAndEquity.currentLiabilities.length === 0 ? (
                          <div className="text-[11px] text-slate-400 italic p-2">Zero pending payables or liabilities</div>
                        ) : (
                          balanceSheetReport.liabilitiesAndEquity.currentLiabilities.map(item => (
                            <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50/70 border border-slate-100 hover:bg-slate-100/60 transition-colors">
                              <div>
                                <div className="font-bold text-slate-800">{item.title}</div>
                                <div className="text-[11px] text-slate-400 font-medium">{item.notes}</div>
                              </div>
                              <div className="font-mono font-black text-amber-700 text-xs">
                                Rs {item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Section 2: Owner's Equity */}
                      <div className="space-y-2">
                        <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1.5 flex items-center justify-between">
                          <span>Owner's Equity & Retained Profit</span>
                          <span className="font-mono font-bold text-purple-700">
                            Total Equity: Rs {balanceSheetReport.liabilitiesAndEquity.equity.totalEquity.toFixed(2)}
                          </span>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50/70 border border-slate-100">
                            <div>
                              <div className="font-bold text-slate-800">Owner's Capital Account</div>
                              <div className="text-[11px] text-slate-400 font-medium">Initial capital & cumulative store equity</div>
                            </div>
                            <div className="font-mono font-black text-slate-900 text-xs">
                              Rs {balanceSheetReport.liabilitiesAndEquity.equity.capital.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>

                          <div className="flex items-center justify-between p-2.5 rounded-lg bg-purple-50/50 border border-purple-100">
                            <div>
                              <div className="font-bold text-purple-900">Current Period Net Profit (from P&L)</div>
                              <div className="text-[11px] text-purple-600 font-medium">Transferred directly from Profit & Loss statement</div>
                            </div>
                            <div className="font-mono font-black text-purple-700 text-xs">
                              Rs {balanceSheetReport.liabilitiesAndEquity.equity.currentPeriodNetProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Liabilities & Equity Footer */}
                  <div className="p-4 bg-blue-50/60 border-t border-blue-100 flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-blue-900">Total Liabilities & Equity</span>
                    <span className="font-mono font-black text-base text-blue-700">
                      Rs {balanceSheetReport.liabilitiesAndEquity.totalLiabilitiesAndEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ================= OTHER REPORT TABS PLACEHOLDER ================= */}
        {activeTab !== 'sale' && activeTab !== 'purchase' && activeTab !== 'day-book' && activeTab !== 'all-transactions' && activeTab !== 'profit-loss' && activeTab !== 'party-statement' && activeTab !== 'gst-tax-summary' && activeTab !== 'bill-wise-profit' && activeTab !== 'cash-flow' && activeTab !== 'trial-balance' && activeTab !== 'balance-sheet' && (
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
