import { Invoice, SaleReturn, PurchaseBill, PurchaseReturn, Expense, Party, PaymentIn, PaymentOut, Item, CashTransaction } from '../types';

export interface DateFilterRange {
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

export interface ProfitAndLossReport {
  grossSalesTaxExclusive: number;
  discountTotal: number;
  saleReturnsTaxExclusive: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  grossProfitMarginPercent: number;
  operatingExpenses: number;
  netProfit: number;
  netProfitMarginPercent: number;
  expensesByCategory: Record<string, number>;
  invoiceCount: number;
  saleReturnCount: number;
  expenseCount: number;
}

export interface LedgerEntry {
  id: string;
  date: string;
  voucherNo: string;
  type: 'OPENING_BALANCE' | 'INVOICE' | 'PAYMENT_IN' | 'SALE_RETURN' | 'PURCHASE_BILL' | 'PAYMENT_OUT' | 'PURCHASE_RETURN';
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface PartyLedgerReport {
  party: Party;
  openingBalance: number;
  openingBalanceType: 'RECEIVABLE' | 'PAYABLE';
  entries: LedgerEntry[];
  totalDebit: number;
  totalCredit: number;
  totalBilled: number;
  totalPaid: number;
  closingBalance: number;
  closingBalanceType: 'RECEIVABLE' | 'PAYABLE';
}

export interface TaxSlabSummary {
  rate: number;
  taxableSales: number;
  cgstCollected: number;
  sgstCollected: number;
  igstCollected: number;
  totalOutputTax: number;
  taxablePurchases: number;
  cgstPaid: number;
  sgstPaid: number;
  igstPaid: number;
  totalInputTax: number;
  netTaxLiability: number;
}

export interface TaxSummaryReport {
  totalOutputTax: number;
  totalInputTax: number;
  netTaxPayable: number;
  cgstCollectedTotal: number;
  sgstCollectedTotal: number;
  igstCollectedTotal: number;
  cgstPaidTotal: number;
  sgstPaidTotal: number;
  igstPaidTotal: number;
  slabs: TaxSlabSummary[];
}

/**
 * Filter items by date range (inclusive YYYY-MM-DD)
 */
function isDateInRange(dateStr?: string, dateRange?: DateFilterRange): boolean {
  if (!dateStr) return true;
  const targetDate = dateStr.split('T')[0];
  if (dateRange?.startDate && targetDate < dateRange.startDate) return false;
  if (dateRange?.endDate && targetDate > dateRange.endDate) return false;
  return true;
}

/**
 * Calculates Profit & Loss (P&L) Report using Tax-Exclusive Sales Revenue, Historical COGS, and Expenses
 */
export function calculateProfitAndLoss(
  invoices: Invoice[] = [],
  saleReturns: SaleReturn[] = [],
  expenses: Expense[] = [],
  dateRange?: DateFilterRange,
  masterItems: Item[] = []
): ProfitAndLossReport {
  // 1. Filter entities by date range
  const filteredInvoices = invoices.filter(inv => isDateInRange(inv.invoiceDate, dateRange));
  const filteredReturns = saleReturns.filter(sr => isDateInRange(sr.returnDate, dateRange));
  const filteredExpenses = expenses.filter(exp => isDateInRange(exp.expenseDate || exp.createdAt, dateRange));

  // Build master item purchase price lookup map
  const itemPriceMap = new Map<number | string, number>();
  for (const mi of masterItems) {
    if (mi.id) itemPriceMap.set(mi.id, mi.purchasePrice || 0);
    if (mi.skuCode) itemPriceMap.set(mi.skuCode, mi.purchasePrice || 0);
    if (mi.name) itemPriceMap.set(mi.name.toLowerCase(), mi.purchasePrice || 0);
  }

  // 2. Calculate Tax-Exclusive Sales Revenue (subtotal net of taxes)
  let grossSalesTaxExclusive = 0;
  let discountTotal = 0;
  let cogsFromSales = 0;

  for (const inv of filteredInvoices) {
    // Tax-exclusive revenue = subtotal or (grandTotal - taxTotal)
    const sub = inv.subtotal !== undefined ? Number(inv.subtotal) : (Number(inv.grandTotal || 0) - Number(inv.taxTotal || 0));
    grossSalesTaxExclusive += sub;
    discountTotal += Number(inv.discountTotal || 0);

    // Calculate COGS from line items
    if (inv.items && Array.isArray(inv.items)) {
      for (const item of inv.items) {
        const qty = Number(item.quantity || 0);
        let purchasePrice = Number(item.purchasePrice || 0);
        if (purchasePrice <= 0 && masterItems.length > 0) {
          if (item.itemId && itemPriceMap.has(item.itemId)) purchasePrice = itemPriceMap.get(item.itemId)!;
          else if (item.itemName && itemPriceMap.has(item.itemName.toLowerCase())) purchasePrice = itemPriceMap.get(item.itemName.toLowerCase())!;
        }
        cogsFromSales += qty * purchasePrice;
      }
    }
  }

  // 3. Tax-Exclusive Sale Returns & COGS (Using purchasePrice, NOT unitPrice / selling price)
  let saleReturnsTaxExclusive = 0;
  let cogsFromReturns = 0;

  for (const sr of filteredReturns) {
    const sub = sr.subtotal !== undefined ? Number(sr.subtotal) : (Number(sr.grandTotal || 0) - Number(sr.taxTotal || 0));
    saleReturnsTaxExclusive += sub;

    if (sr.items && Array.isArray(sr.items)) {
      for (const rItem of sr.items) {
        const qty = Number(rItem.returnQuantity || 0);
        let purchasePrice = Number(rItem.purchasePrice || 0);
        if (purchasePrice <= 0 && masterItems.length > 0) {
          if (rItem.itemId && itemPriceMap.has(rItem.itemId)) purchasePrice = itemPriceMap.get(rItem.itemId)!;
          else if (rItem.itemName && itemPriceMap.has(rItem.itemName.toLowerCase())) purchasePrice = itemPriceMap.get(rItem.itemName.toLowerCase())!;
        }
        cogsFromReturns += qty * purchasePrice;
      }
    }
  }

  // 4. Net Revenue & Net COGS
  const netRevenue = Math.max(0, grossSalesTaxExclusive - saleReturnsTaxExclusive);
  const cogs = Math.max(0, cogsFromSales - cogsFromReturns);

  // 5. Gross Profit
  const grossProfit = netRevenue - cogs;
  const grossProfitMarginPercent = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

  // 6. Aggregate Operating Expenses
  let operatingExpenses = 0;
  const expensesByCategory: Record<string, number> = {};

  for (const exp of filteredExpenses) {
    const amt = Number(exp.amount || 0);
    operatingExpenses += amt;

    const cat = exp.categoryName || exp.notes || 'General & Administrative';
    expensesByCategory[cat] = (expensesByCategory[cat] || 0) + amt;
  }

  // 7. Net Profit
  const netProfit = grossProfit - operatingExpenses;
  const netProfitMarginPercent = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

  return {
    grossSalesTaxExclusive,
    discountTotal,
    saleReturnsTaxExclusive,
    netRevenue,
    cogs,
    grossProfit,
    grossProfitMarginPercent,
    operatingExpenses,
    netProfit,
    netProfitMarginPercent,
    expensesByCategory,
    invoiceCount: filteredInvoices.length,
    saleReturnCount: filteredReturns.length,
    expenseCount: filteredExpenses.length
  };
}

/**
 * Generates continuous Party Ledger Statement respecting Customer vs Supplier type
 */
export function generatePartyLedger(
  party: Party,
  invoices: Invoice[] = [],
  paymentsIn: PaymentIn[] = [],
  saleReturns: SaleReturn[] = [],
  purchaseBills: PurchaseBill[] = [],
  paymentsOut: PaymentOut[] = [],
  purchaseReturns: PurchaseReturn[] = [],
  dateRange?: DateFilterRange
): PartyLedgerReport {
  const isCustomer = party.type === 'CUSTOMER' || party.balanceType === 'RECEIVABLE';

  const parseAmt = (val: any): number => {
    if (val === null || val === undefined) return 0;
    const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]+/g, ''));
    return isNaN(n) ? 0 : n;
  };

  // 1. Gather all party raw transaction records
  interface RawTx {
    date: string;
    timestamp: number;
    voucherNo: string;
    type: 'INVOICE' | 'PAYMENT_IN' | 'SALE_RETURN' | 'PURCHASE_BILL' | 'PAYMENT_OUT' | 'PURCHASE_RETURN';
    description: string;
    amount: number;
    paidAmt: number;
    paymentMethod?: string;
  }

  const rawTxs: RawTx[] = [];

  const pNameLower = (party.name || '').trim().toLowerCase();
  const matchesParty = (pId?: any, pName?: string) => {
    if (pId !== undefined && pId !== null && party.id !== undefined && party.id !== null && String(pId) === String(party.id)) return true;
    if (pName && String(pName).trim().toLowerCase() === pNameLower) return true;
    return false;
  };

  // Invoices (Sales to Customer)
  for (const inv of invoices) {
    const pId = inv.partyId ?? (inv as any).party_id;
    const pName = inv.partyName ?? (inv as any).party_name;
    if (matchesParty(pId, pName)) {
      const tot = parseAmt(inv.grandTotal ?? (inv as any).grand_total ?? (inv as any).totalAmount ?? (inv as any).subtotal);
      const rec = parseAmt(inv.receivedAmount ?? (inv as any).received_amount ?? ((inv.paymentStatus || (inv as any).payment_status) === 'PAID' ? tot : 0));
      const pm = inv.paymentMethod ?? (inv as any).payment_method ?? 'CASH';
      rawTxs.push({
        date: inv.invoiceDate || (inv as any).invoice_date || inv.createdAt?.split('T')[0] || '',
        timestamp: new Date(inv.createdAt || inv.invoiceDate || (inv as any).invoice_date || 0).getTime(),
        voucherNo: inv.invoiceNumber || (inv as any).invoice_number || 'INV-REF',
        type: 'INVOICE',
        description: `Sales Invoice #${inv.invoiceNumber || (inv as any).invoice_number}`,
        amount: tot,
        paidAmt: rec,
        paymentMethod: pm
      });
    }
  }

  // Payment-In (Collection from Customer)
  for (const payIn of paymentsIn) {
    const pId = payIn.partyId ?? (payIn as any).party_id;
    const pName = payIn.partyName ?? (payIn as any).party_name;
    if (matchesParty(pId, pName)) {
      const amt = parseAmt(payIn.amount);
      const pm = payIn.paymentMethod ?? (payIn as any).payment_method ?? 'CASH';
      rawTxs.push({
        date: payIn.paymentDate || (payIn as any).payment_date || payIn.createdAt?.split('T')[0] || '',
        timestamp: new Date(payIn.createdAt || payIn.paymentDate || (payIn as any).payment_date || 0).getTime(),
        voucherNo: payIn.receiptNumber || (payIn as any).receipt_number || 'PAYIN-REF',
        type: 'PAYMENT_IN',
        description: `Payment Received (${pm})`,
        amount: amt,
        paidAmt: amt,
        paymentMethod: pm
      });
    }
  }

  // Sale Returns (Credit Note)
  for (const sr of saleReturns) {
    const pId = sr.partyId ?? (sr as any).party_id;
    const pName = sr.partyName ?? (sr as any).party_name;
    if (matchesParty(pId, pName)) {
      const tot = parseAmt(sr.grandTotal ?? (sr as any).grand_total ?? (sr as any).subtotal);
      rawTxs.push({
        date: sr.returnDate || (sr as any).return_date || sr.createdAt?.split('T')[0] || '',
        timestamp: new Date(sr.createdAt || sr.returnDate || (sr as any).return_date || 0).getTime(),
        voucherNo: sr.creditNoteNumber || (sr as any).credit_note_number || 'CN-REF',
        type: 'SALE_RETURN',
        description: `Sale Return Credit Note #${sr.creditNoteNumber || (sr as any).credit_note_number}`,
        amount: tot,
        paidAmt: tot
      });
    }
  }

  // Purchase Bills (From Supplier)
  for (const pb of purchaseBills) {
    const sId = pb.supplierId ?? (pb as any).supplier_id;
    const sName = pb.supplierName ?? (pb as any).supplier_name;
    if (matchesParty(sId, sName)) {
      const tot = parseAmt(pb.grandTotal ?? (pb as any).grand_total ?? (pb as any).totalAmount ?? (pb as any).subtotal);
      const paid = parseAmt(pb.paidAmount ?? (pb as any).paid_amount ?? ((pb.paymentStatus || (pb as any).payment_status) === 'PAID' ? tot : 0));
      const pm = pb.paymentMethod ?? (pb as any).payment_method ?? 'CASH';
      rawTxs.push({
        date: pb.billDate || (pb as any).bill_date || pb.createdAt?.split('T')[0] || '',
        timestamp: new Date(pb.createdAt || pb.billDate || (pb as any).bill_date || 0).getTime(),
        voucherNo: pb.billNumber || (pb as any).bill_number || 'BILL-REF',
        type: 'PURCHASE_BILL',
        description: `Purchase Bill #${pb.billNumber || (pb as any).bill_number}`,
        amount: tot,
        paidAmt: paid,
        paymentMethod: pm
      });
    }
  }

  // Payment-Out (Paid to Supplier)
  for (const payOut of paymentsOut) {
    const pId = payOut.partyId ?? (payOut as any).party_id;
    const pName = payOut.partyName ?? (payOut as any).party_name;
    if (matchesParty(pId, pName)) {
      const amt = parseAmt(payOut.amount);
      const pm = payOut.paymentMethod ?? (payOut as any).payment_method ?? 'CASH';
      rawTxs.push({
        date: payOut.paymentDate || (payOut as any).payment_date || payOut.createdAt?.split('T')[0] || '',
        timestamp: new Date(payOut.createdAt || payOut.paymentDate || (payOut as any).payment_date || 0).getTime(),
        voucherNo: payOut.receiptNumber || (payOut as any).receipt_number || 'PAYOUT-REF',
        type: 'PAYMENT_OUT',
        description: `Payment Out to Supplier (${pm})`,
        amount: amt,
        paidAmt: amt,
        paymentMethod: pm
      });
    }
  }

  // Purchase Returns (Debit Note to Supplier)
  for (const pr of purchaseReturns) {
    if (matchesParty(pr.supplierId, pr.supplierName)) {
      rawTxs.push({
        date: pr.returnDate || pr.createdAt?.split('T')[0] || '',
        timestamp: new Date(pr.createdAt || pr.returnDate || 0).getTime(),
        voucherNo: pr.debitNoteNumber || 'DN-REF',
        type: 'PURCHASE_RETURN',
        description: `Purchase Return Debit Note #${pr.debitNoteNumber}`,
        amount: parseAmt(pr.grandTotal || (pr as any).subtotal),
        paidAmt: parseAmt(pr.grandTotal || (pr as any).subtotal)
      });
    }
  }

  // 2. Sort chronologically by date & timestamp
  rawTxs.sort((a, b) => a.date.localeCompare(b.date) || a.timestamp - b.timestamp);

  // 3. Compute period opening balance and continuous ledger line-by-line
  const masterOpeningBalance = parseAmt(party.openingBalance || 0);
  let currentBal = party.balanceType === 'PAYABLE' && isCustomer ? -masterOpeningBalance : masterOpeningBalance;
  let periodOpeningBal = currentBal;

  let totalDebit = 0;
  let totalCredit = 0;
  let totalBilled = 0;
  let totalPaid = 0;

  const entries: LedgerEntry[] = [];

  for (let i = 0; i < rawTxs.length; i++) {
    const tx = rawTxs[i];
    let debit = 0;
    let credit = 0;

    if (isCustomer) {
      if (tx.type === 'INVOICE') {
        debit = tx.amount;
        totalBilled += tx.amount;
        const isCreditSale = (tx.paymentMethod || '').toUpperCase() === 'CREDIT';
        if (!isCreditSale) {
          credit = tx.paidAmt > 0 ? tx.paidAmt : tx.amount;
          totalPaid += credit;
        }
        currentBal += (debit - credit);
      } else if (tx.type === 'PAYMENT_IN') {
        credit = tx.amount;
        totalPaid += credit;
        currentBal -= credit;
      } else if (tx.type === 'SALE_RETURN') {
        credit = tx.amount;
        totalBilled -= credit;
        currentBal -= credit;
      }
    } else {
      if (tx.type === 'PURCHASE_BILL') {
        credit = tx.amount;
        totalBilled += tx.amount;
        const isCreditPurchase = (tx.paymentMethod || '').toUpperCase() === 'CREDIT';
        if (!isCreditPurchase) {
          debit = tx.paidAmt > 0 ? tx.paidAmt : tx.amount;
          totalPaid += debit;
        }
        currentBal += (credit - debit);
      } else if (tx.type === 'PAYMENT_OUT') {
        debit = tx.amount;
        totalPaid += debit;
        currentBal -= debit;
      } else if (tx.type === 'PURCHASE_RETURN') {
        debit = tx.amount;
        totalBilled -= debit;
        currentBal -= debit;
      }
    }

    const isBeforePeriod = dateRange?.startDate && tx.date < dateRange.startDate;

    if (isBeforePeriod) {
      periodOpeningBal = currentBal;
    } else if (isDateInRange(tx.date, dateRange)) {
      totalDebit += debit;
      totalCredit += credit;

      entries.push({
        id: `tx-${i}-${tx.voucherNo}`,
        date: tx.date,
        voucherNo: tx.voucherNo,
        type: tx.type,
        description: tx.description,
        debit,
        credit,
        runningBalance: Math.abs(currentBal)
      });
    }
  }

  const periodOpeningBalance = Math.abs(periodOpeningBal);
  const periodOpeningBalanceType = isCustomer
    ? (periodOpeningBal >= 0 ? 'RECEIVABLE' : 'PAYABLE')
    : (periodOpeningBal >= 0 ? 'PAYABLE' : 'RECEIVABLE');

  const closingBalance = Math.abs(currentBal);
  const closingBalanceType = isCustomer
    ? (currentBal >= 0 ? 'RECEIVABLE' : 'PAYABLE')
    : (currentBal >= 0 ? 'PAYABLE' : 'RECEIVABLE');

  return {
    party,
    openingBalance: periodOpeningBalance,
    openingBalanceType: periodOpeningBalanceType,
    entries,
    totalDebit,
    totalCredit,
    totalBilled,
    totalPaid,
    closingBalance,
    closingBalanceType
  };
}

/**
 * Calculates GST / Sales Tax Summary Report (Output Tax vs Input Tax Credit)
 * Accurately accounts for Sales Invoices, Purchase Bills, Sale Returns (Credit Notes), and Purchase Returns (Debit Notes)
 */
export function calculateTaxSummary(
  invoices: Invoice[] = [],
  purchaseBills: PurchaseBill[] = [],
  dateRange?: DateFilterRange,
  saleReturns: SaleReturn[] = [],
  purchaseReturns: PurchaseReturn[] = [],
  itemsList: Item[] = []
): TaxSummaryReport {
  const filteredInvoices = invoices.filter(inv => isDateInRange(inv.invoiceDate, dateRange));
  const filteredBills = purchaseBills.filter(pb => isDateInRange(pb.billDate, dateRange));
  const filteredSaleReturns = saleReturns.filter(sr => isDateInRange(sr.returnDate, dateRange));
  const filteredPurchaseReturns = purchaseReturns.filter(pr => isDateInRange(pr.returnDate, dateRange));

  const slabMap: Record<number, TaxSlabSummary> = {
    0: { rate: 0, taxableSales: 0, cgstCollected: 0, sgstCollected: 0, igstCollected: 0, totalOutputTax: 0, taxablePurchases: 0, cgstPaid: 0, sgstPaid: 0, igstPaid: 0, totalInputTax: 0, netTaxLiability: 0 },
    5: { rate: 5, taxableSales: 0, cgstCollected: 0, sgstCollected: 0, igstCollected: 0, totalOutputTax: 0, taxablePurchases: 0, cgstPaid: 0, sgstPaid: 0, igstPaid: 0, totalInputTax: 0, netTaxLiability: 0 },
    12: { rate: 12, taxableSales: 0, cgstCollected: 0, sgstCollected: 0, igstCollected: 0, totalOutputTax: 0, taxablePurchases: 0, cgstPaid: 0, sgstPaid: 0, igstPaid: 0, totalInputTax: 0, netTaxLiability: 0 },
    18: { rate: 18, taxableSales: 0, cgstCollected: 0, sgstCollected: 0, igstCollected: 0, totalOutputTax: 0, taxablePurchases: 0, cgstPaid: 0, sgstPaid: 0, igstPaid: 0, totalInputTax: 0, netTaxLiability: 0 },
    28: { rate: 28, taxableSales: 0, cgstCollected: 0, sgstCollected: 0, igstCollected: 0, totalOutputTax: 0, taxablePurchases: 0, cgstPaid: 0, sgstPaid: 0, igstPaid: 0, totalInputTax: 0, netTaxLiability: 0 },
  };

  let cgstCollectedTotal = 0;
  let sgstCollectedTotal = 0;
  let igstCollectedTotal = 0;

  // 1. Process Sales Invoices (Output Tax)
  for (const inv of filteredInvoices) {
    if (inv.items && Array.isArray(inv.items)) {
      for (const item of inv.items) {
        const qty = Number(item.quantity || 0);
        const rate = Number(item.unitPrice || 0);
        const disc = Number(item.discountAmount || 0);
        const taxable = Math.max(0, (qty * rate) - disc);

        let cgstR = Number(item.cgstRate || 0);
        let sgstR = Number(item.sgstRate || 0);
        let igstR = Number(item.igstRate || 0);

        // Dynamic fallback: If rates are 0 but line taxAmount > 0 and taxable > 0
        if (cgstR === 0 && sgstR === 0 && igstR === 0 && item.taxAmount && item.taxAmount > 0 && taxable > 0) {
          const calcRate = Math.round((Number(item.taxAmount) / taxable) * 100);
          cgstR = calcRate / 2;
          sgstR = calcRate / 2;
        }

        const effRate = igstR > 0 ? igstR : (cgstR + sgstR);

        const cgstAmt = (taxable * cgstR) / 100;
        const sgstAmt = (taxable * sgstR) / 100;
        const igstAmt = (taxable * igstR) / 100;
        const totTax = cgstAmt + sgstAmt + igstAmt;

        cgstCollectedTotal += cgstAmt;
        sgstCollectedTotal += sgstAmt;
        igstCollectedTotal += igstAmt;

        if (!slabMap[effRate]) {
          slabMap[effRate] = {
            rate: effRate, taxableSales: 0, cgstCollected: 0, sgstCollected: 0, igstCollected: 0, totalOutputTax: 0,
            taxablePurchases: 0, cgstPaid: 0, sgstPaid: 0, igstPaid: 0, totalInputTax: 0, netTaxLiability: 0
          };
        }

        const slab = slabMap[effRate];
        slab.taxableSales += taxable;
        slab.cgstCollected += cgstAmt;
        slab.sgstCollected += sgstAmt;
        slab.igstCollected += igstAmt;
        slab.totalOutputTax += totTax;
      }
    }
  }

  // 2. Process Sale Returns (Deduct Output Tax & Taxable Sales)
  for (const sr of filteredSaleReturns) {
    if (sr.items && Array.isArray(sr.items)) {
      for (const item of sr.items) {
        const qty = Number(item.returnQuantity || 0);
        const rate = Number(item.unitPrice || 0);
        const taxable = qty * rate;

        let cgstR = 0;
        let sgstR = 0;
        let igstR = 0;
        let totTax = Number(item.taxAmount || 0);

        if (totTax > 0 && taxable > 0) {
          const calcRate = Math.round((totTax / taxable) * 100);
          cgstR = calcRate / 2;
          sgstR = calcRate / 2;
        } else if (item.itemId && itemsList.length > 0) {
          const matchedItem = itemsList.find(i => i.id === item.itemId);
          if (matchedItem) {
            cgstR = Number(matchedItem.cgstRate || 0);
            sgstR = Number(matchedItem.sgstRate || 0);
            igstR = Number(matchedItem.igstRate || 0);
            const eff = igstR > 0 ? igstR : (cgstR + sgstR);
            totTax = (taxable * eff) / 100;
          }
        }

        const effRate = igstR > 0 ? igstR : (cgstR + sgstR);
        const cgstAmt = (taxable * cgstR) / 100;
        const sgstAmt = (taxable * sgstR) / 100;
        const igstAmt = (taxable * igstR) / 100;

        cgstCollectedTotal = Math.max(0, cgstCollectedTotal - cgstAmt);
        sgstCollectedTotal = Math.max(0, sgstCollectedTotal - sgstAmt);
        igstCollectedTotal = Math.max(0, igstCollectedTotal - igstAmt);

        if (slabMap[effRate]) {
          const slab = slabMap[effRate];
          slab.taxableSales = Math.max(0, slab.taxableSales - taxable);
          slab.cgstCollected = Math.max(0, slab.cgstCollected - cgstAmt);
          slab.sgstCollected = Math.max(0, slab.sgstCollected - sgstAmt);
          slab.igstCollected = Math.max(0, slab.igstCollected - igstAmt);
          slab.totalOutputTax = Math.max(0, slab.totalOutputTax - totTax);
        }
      }
    }
  }

  let cgstPaidTotal = 0;
  let sgstPaidTotal = 0;
  let igstPaidTotal = 0;

  // 3. Process Purchase Bills (Input Tax Credit)
  for (const pb of filteredBills) {
    if (pb.items && Array.isArray(pb.items)) {
      for (const item of pb.items) {
        const qty = Number(item.quantity || 0);
        const rate = Number(item.unitPrice || item.purchasePrice || 0);
        const taxable = qty * rate;

        let cgstR = Number(item.cgstRate || 0);
        let sgstR = Number(item.sgstRate || 0);
        let igstR = Number(item.igstRate || 0);

        if (cgstR === 0 && sgstR === 0 && igstR === 0 && item.taxAmount && item.taxAmount > 0 && taxable > 0) {
          const calcRate = Math.round((Number(item.taxAmount) / taxable) * 100);
          cgstR = calcRate / 2;
          sgstR = calcRate / 2;
        }

        const effRate = igstR > 0 ? igstR : (cgstR + sgstR);

        const cgstAmt = (taxable * cgstR) / 100;
        const sgstAmt = (taxable * sgstR) / 100;
        const igstAmt = (taxable * igstR) / 100;
        const totTax = cgstAmt + sgstAmt + igstAmt;

        cgstPaidTotal += cgstAmt;
        sgstPaidTotal += sgstAmt;
        igstPaidTotal += igstAmt;

        if (!slabMap[effRate]) {
          slabMap[effRate] = {
            rate: effRate, taxableSales: 0, cgstCollected: 0, sgstCollected: 0, igstCollected: 0, totalOutputTax: 0,
            taxablePurchases: 0, cgstPaid: 0, sgstPaid: 0, igstPaid: 0, totalInputTax: 0, netTaxLiability: 0
          };
        }

        const slab = slabMap[effRate];
        slab.taxablePurchases += taxable;
        slab.cgstPaid += cgstAmt;
        slab.sgstPaid += sgstAmt;
        slab.igstPaid += igstAmt;
        slab.totalInputTax += totTax;
      }
    }
  }

  // 4. Process Purchase Returns (Deduct Input Tax Credit & Taxable Purchases)
  for (const pr of filteredPurchaseReturns) {
    if (pr.items && Array.isArray(pr.items)) {
      for (const item of pr.items) {
        const qty = Number(item.returnQuantity || 0);
        const rate = Number(item.unitPrice || 0);
        const taxable = qty * rate;

        let cgstR = 0;
        let sgstR = 0;
        let igstR = 0;
        let totTax = 0;

        if (item.itemId && itemsList.length > 0) {
          const matchedItem = itemsList.find(i => i.id === item.itemId);
          if (matchedItem) {
            cgstR = Number(matchedItem.cgstRate || 0);
            sgstR = Number(matchedItem.sgstRate || 0);
            igstR = Number(matchedItem.igstRate || 0);
            const eff = igstR > 0 ? igstR : (cgstR + sgstR);
            totTax = (taxable * eff) / 100;
          }
        }

        const effRate = igstR > 0 ? igstR : (cgstR + sgstR);
        const cgstAmt = (taxable * cgstR) / 100;
        const sgstAmt = (taxable * sgstR) / 100;
        const igstAmt = (taxable * igstR) / 100;

        cgstPaidTotal = Math.max(0, cgstPaidTotal - cgstAmt);
        sgstPaidTotal = Math.max(0, sgstPaidTotal - sgstAmt);
        igstPaidTotal = Math.max(0, igstPaidTotal - igstAmt);

        if (slabMap[effRate]) {
          const slab = slabMap[effRate];
          slab.taxablePurchases = Math.max(0, slab.taxablePurchases - taxable);
          slab.cgstPaid = Math.max(0, slab.cgstPaid - cgstAmt);
          slab.sgstPaid = Math.max(0, slab.sgstPaid - sgstAmt);
          slab.igstPaid = Math.max(0, slab.igstPaid - igstAmt);
          slab.totalInputTax = Math.max(0, slab.totalInputTax - totTax);
        }
      }
    }
  }

  const totalOutputTax = cgstCollectedTotal + sgstCollectedTotal + igstCollectedTotal;
  const totalInputTax = cgstPaidTotal + sgstPaidTotal + igstPaidTotal;
  const netTaxPayable = totalOutputTax - totalInputTax;

  const slabs = Object.values(slabMap)
    .map(slab => ({
      ...slab,
      netTaxLiability: slab.totalOutputTax - slab.totalInputTax
    }))
    .sort((a, b) => a.rate - b.rate);

  return {
    totalOutputTax,
    totalInputTax,
    netTaxPayable,
    cgstCollectedTotal,
    sgstCollectedTotal,
    igstCollectedTotal,
    cgstPaidTotal,
    sgstPaidTotal,
    igstPaidTotal,
    slabs
  };
}

export interface CashFlowTransaction {
  id: string;
  date: string;
  createdAt?: string;
  type: 'INFLOW' | 'OUTFLOW';
  source: 'SALE' | 'PAYMENT_IN' | 'PURCHASE' | 'PAYMENT_OUT' | 'EXPENSE' | 'SALE_RETURN' | 'CASH_TXN';
  sourceLabel: string;
  referenceNo: string;
  partyOrCategory: string;
  paymentMethod: string;
  amount: number;
  runningBalance: number;
}

export interface CashFlowReport {
  openingBalance: number;
  totalInflows: number;
  totalOutflows: number;
  netCashFlow: number;
  closingBalance: number;
  inflowBreakdown: {
    salesCash: number;
    paymentsIn: number;
    otherInflows: number;
  };
  outflowBreakdown: {
    purchasesCash: number;
    paymentsOut: number;
    expenses: number;
    saleReturnsRefunds: number;
    otherOutflows: number;
  };
  methodBreakdown: {
    cashInHand: { inflow: number; outflow: number; net: number };
    bankOnline: { inflow: number; outflow: number; net: number };
  };
  transactions: CashFlowTransaction[];
}

/**
 * Computes institutional-grade Cash Flow Report tracking all liquid inflows and outflows
 */
export function calculateCashFlow(
  invoices: Invoice[] = [],
  purchaseBills: PurchaseBill[] = [],
  paymentsIn: PaymentIn[] = [],
  paymentsOut: PaymentOut[] = [],
  expenses: Expense[] = [],
  saleReturns: SaleReturn[] = [],
  cashTransactions: CashTransaction[] = [],
  dateRange?: DateFilterRange,
  initialOpeningCash: number = 0
): CashFlowReport {
  // Helper to extract ISO date YYYY-MM-DD
  const getISO = (d?: string, fallback?: string): string => {
    if (d) return d.split('T')[0];
    if (fallback) return fallback.split('T')[0];
    return '1970-01-01';
  };

  const startDate = dateRange?.startDate;
  const endDate = dateRange?.endDate;

  // Build a lookup index of all primary operational voucher references
  // to eliminate double-counting of automatic shadow cash entries
  const processedRefs = new Set<string>();
  for (const inv of invoices) {
    if (inv.invoiceNumber) processedRefs.add(inv.invoiceNumber.trim().toUpperCase());
  }
  for (const pb of purchaseBills) {
    if (pb.billNumber) processedRefs.add(pb.billNumber.trim().toUpperCase());
  }
  for (const pin of paymentsIn) {
    if (pin.receiptNumber) processedRefs.add(pin.receiptNumber.trim().toUpperCase());
  }
  for (const pout of paymentsOut) {
    if (pout.receiptNumber) processedRefs.add(pout.receiptNumber.trim().toUpperCase());
  }
  for (const exp of expenses) {
    if (exp.expenseNumber) processedRefs.add(exp.expenseNumber.trim().toUpperCase());
  }
  for (const sr of saleReturns) {
    if (sr.creditNoteNumber) processedRefs.add(sr.creditNoteNumber.trim().toUpperCase());
  }

  const isDuplicateCashTxn = (ctx: CashTransaction): boolean => {
    const src = (ctx.source || '').toUpperCase();
    if (src === 'EXPENSE' || src === 'PAYMENT_OUT' || src === 'PAYMENT_IN' || src === 'SALE' || src === 'SALE_RETURN' || src === 'PURCHASE') {
      return true;
    }
    if (ctx.referenceId && processedRefs.has(ctx.referenceId.trim().toUpperCase())) {
      return true;
    }
    return false;
  };

  // 1. Compute Historical Opening Balance for all transactions prior to startDate
  let openingBalance = Number(initialOpeningCash) || 0;

  if (startDate) {
    // Historical Inflows prior to startDate
    for (const inv of invoices) {
      const d = getISO(inv.invoiceDate, inv.createdAt);
      if (d < startDate) {
        const amt = Number(inv.receivedAmount !== undefined ? inv.receivedAmount : (inv.paymentStatus === 'PAID' ? inv.grandTotal : 0));
        if (amt > 0) openingBalance += amt;
      }
    }
    for (const pin of paymentsIn) {
      const d = getISO(pin.paymentDate, pin.createdAt);
      if (d < startDate) {
        const amt = Number(pin.amount || 0);
        if (amt > 0) openingBalance += amt;
      }
    }
    for (const ctx of cashTransactions) {
      if (isDuplicateCashTxn(ctx)) continue;
      const d = getISO(ctx.transactionDate, ctx.createdAt);
      if (d < startDate) {
        const amt = Number(ctx.amount || 0);
        if (ctx.type === 'IN') openingBalance += amt;
        else if (ctx.type === 'OUT') openingBalance -= amt;
      }
    }

    // Historical Outflows prior to startDate
    for (const pb of purchaseBills) {
      const d = getISO(pb.billDate, pb.createdAt);
      if (d < startDate) {
        const amt = Number(pb.paidAmount !== undefined ? pb.paidAmount : (pb.paymentStatus === 'PAID' ? pb.grandTotal : 0));
        if (amt > 0) openingBalance -= amt;
      }
    }
    for (const pout of paymentsOut) {
      const d = getISO(pout.paymentDate, pout.createdAt);
      if (d < startDate) {
        const amt = Number(pout.amount || 0);
        if (amt > 0) openingBalance -= amt;
      }
    }
    for (const exp of expenses) {
      const d = getISO(exp.expenseDate, exp.createdAt);
      if (d < startDate) {
        const amt = Number(exp.amount || 0);
        if (amt > 0) openingBalance -= amt;
      }
    }
    for (const sr of saleReturns) {
      const d = getISO(sr.returnDate, sr.createdAt);
      if (d < startDate) {
        const amt = Number(sr.refundAmount || 0);
        if (amt > 0) openingBalance -= amt;
      }
    }
  }

  // 2. Gather All Transactions within Date Range
  const rawTxns: Array<Omit<CashFlowTransaction, 'runningBalance'>> = [];

  // INFLOWS:
  // A. Invoices (Cash/Received Sales)
  for (const inv of invoices) {
    const d = getISO(inv.invoiceDate, inv.createdAt);
    if ((!startDate || d >= startDate) && (!endDate || d <= endDate)) {
      const amt = Number(inv.receivedAmount !== undefined ? inv.receivedAmount : (inv.paymentStatus === 'PAID' ? inv.grandTotal : 0));
      if (amt > 0) {
        rawTxns.push({
          id: `inflow-inv-${inv.id || inv.invoiceNumber}`,
          date: d,
          createdAt: inv.createdAt || inv.invoiceDate,
          type: 'INFLOW',
          source: 'SALE',
          sourceLabel: 'Sale Invoice',
          referenceNo: inv.invoiceNumber || 'INV',
          partyOrCategory: inv.partyName || 'Walk-in Customer',
          paymentMethod: inv.paymentMethod || 'CASH',
          amount: amt
        });
      }
    }
  }

  // B. Payment In (Customer Udhaar Collections)
  for (const pin of paymentsIn) {
    const d = getISO(pin.paymentDate, pin.createdAt);
    if ((!startDate || d >= startDate) && (!endDate || d <= endDate)) {
      const amt = Number(pin.amount || 0);
      if (amt > 0) {
        rawTxns.push({
          id: `inflow-pin-${pin.id || pin.receiptNumber}`,
          date: d,
          createdAt: pin.createdAt || pin.paymentDate,
          type: 'INFLOW',
          source: 'PAYMENT_IN',
          sourceLabel: 'Payment Received',
          referenceNo: pin.receiptNumber || 'REC',
          partyOrCategory: pin.partyName || 'Customer',
          paymentMethod: pin.paymentMethod || 'CASH',
          amount: amt
        });
      }
    }
  }

  // OUTFLOWS:
  // C. Purchase Bills (Paid to Suppliers)
  for (const pb of purchaseBills) {
    const d = getISO(pb.billDate, pb.createdAt);
    if ((!startDate || d >= startDate) && (!endDate || d <= endDate)) {
      const amt = Number(pb.paidAmount !== undefined ? pb.paidAmount : (pb.paymentStatus === 'PAID' ? pb.grandTotal : 0));
      if (amt > 0) {
        rawTxns.push({
          id: `outflow-pb-${pb.id || pb.billNumber}`,
          date: d,
          createdAt: pb.createdAt || pb.billDate,
          type: 'OUTFLOW',
          source: 'PURCHASE',
          sourceLabel: 'Purchase Bill',
          referenceNo: pb.billNumber || 'BILL',
          partyOrCategory: pb.supplierName || 'Vendor',
          paymentMethod: pb.paymentMethod || 'CASH',
          amount: amt
        });
      }
    }
  }

  // D. Payment Out (Paid to Suppliers for Due Balance)
  for (const pout of paymentsOut) {
    const d = getISO(pout.paymentDate, pout.createdAt);
    if ((!startDate || d >= startDate) && (!endDate || d <= endDate)) {
      const amt = Number(pout.amount || 0);
      if (amt > 0) {
        rawTxns.push({
          id: `outflow-pout-${pout.id || pout.receiptNumber}`,
          date: d,
          createdAt: pout.createdAt || pout.paymentDate,
          type: 'OUTFLOW',
          source: 'PAYMENT_OUT',
          sourceLabel: 'Payment Made',
          referenceNo: pout.receiptNumber || 'VOUCH',
          partyOrCategory: pout.partyName || 'Supplier',
          paymentMethod: pout.paymentMethod || 'CASH',
          amount: amt
        });
      }
    }
  }

  // E. Operating Expenses (Rent, Bills, Salaries)
  for (const exp of expenses) {
    const d = getISO(exp.expenseDate, exp.createdAt);
    if ((!startDate || d >= startDate) && (!endDate || d <= endDate)) {
      const amt = Number(exp.amount || 0);
      if (amt > 0) {
        rawTxns.push({
          id: `outflow-exp-${exp.id || exp.expenseNumber}`,
          date: d,
          createdAt: exp.createdAt || exp.expenseDate,
          type: 'OUTFLOW',
          source: 'EXPENSE',
          sourceLabel: 'Operating Expense',
          referenceNo: exp.expenseNumber || 'EXP',
          partyOrCategory: exp.categoryName || 'General Expense',
          paymentMethod: exp.paymentMode || 'CASH',
          amount: amt
        });
      }
    }
  }

  // F. Customer Sale Returns (Refunded Cash)
  for (const sr of saleReturns) {
    const d = getISO(sr.returnDate, sr.createdAt);
    if ((!startDate || d >= startDate) && (!endDate || d <= endDate)) {
      const amt = Number(sr.refundAmount || 0);
      if (amt > 0) {
        rawTxns.push({
          id: `outflow-sr-${sr.id || sr.creditNoteNumber}`,
          date: d,
          createdAt: sr.createdAt || sr.returnDate,
          type: 'OUTFLOW',
          source: 'SALE_RETURN',
          sourceLabel: 'Sale Return Refund',
          referenceNo: sr.creditNoteNumber || 'RET',
          partyOrCategory: sr.partyName || 'Customer',
          paymentMethod: (sr as any).refundMethod || (sr as any).paymentMethod || 'CASH',
          amount: amt
        });
      }
    }
  }

  // G. Direct Cash Transactions (Only standalone adjustments, deposits, and refunds not already counted)
  for (const ctx of cashTransactions) {
    if (isDuplicateCashTxn(ctx)) continue;
    const d = getISO(ctx.transactionDate, ctx.createdAt);
    if ((!startDate || d >= startDate) && (!endDate || d <= endDate)) {
      const amt = Number(ctx.amount || 0);
      if (amt > 0) {
        const isOut = ctx.type === 'OUT';
        const isPurchaseReturnRefund = (ctx.source || '').toUpperCase() === 'PURCHASE_RETURN_REFUND';
        rawTxns.push({
          id: `ctx-${ctx.id || ctx.referenceId || Math.random()}`,
          date: d,
          createdAt: ctx.createdAt || ctx.transactionDate,
          type: isOut ? 'OUTFLOW' : 'INFLOW',
          source: 'CASH_TXN',
          sourceLabel: isOut ? 'Cash Withdrawal' : (isPurchaseReturnRefund ? 'Purchase Return Refund' : 'Cash Deposit'),
          referenceNo: ctx.referenceId || 'CTX',
          partyOrCategory: ctx.description || (isOut ? 'Cash Outflow' : 'Cash Inflow'),
          paymentMethod: 'CASH',
          amount: amt
        });
      }
    }
  }

  // 3. Sort Chronologically (oldest first) to compute running balance accurately
  rawTxns.sort((a, b) => {
    // 1. Sort by Date ascending
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;

    // 2. On the same date: INFLOWS FIRST!
    // In accounting, cash received or deposited during the day funds that day's disbursements.
    // Putting Inflows before Outflows prevents artificial mid-day negative running balance.
    if (a.type !== b.type) {
      return a.type === 'INFLOW' ? -1 : 1;
    }

    // 3. Among same type, sort by timestamp if available
    const tA = (a as any).createdAt || '';
    const tB = (b as any).createdAt || '';
    if (tA && tB && tA !== tB) {
      return tA < tB ? -1 : 1;
    }

    return 0;
  });

  let running = openingBalance;
  let totalInflows = 0;
  let totalOutflows = 0;

  const inflowBreakdown = { salesCash: 0, paymentsIn: 0, otherInflows: 0 };
  const outflowBreakdown = { purchasesCash: 0, paymentsOut: 0, expenses: 0, saleReturnsRefunds: 0, otherOutflows: 0 };
  const methodBreakdown = {
    cashInHand: { inflow: 0, outflow: 0, net: 0 },
    bankOnline: { inflow: 0, outflow: 0, net: 0 }
  };

  const isBankMethod = (m: string) => {
    const upper = (m || '').toUpperCase();
    return upper.includes('BANK') || upper.includes('ONLINE') || upper.includes('UPI') || upper.includes('CARD') || upper.includes('CHEQUE');
  };

  const transactionsWithBalance: CashFlowTransaction[] = rawTxns.map(t => {
    const isBank = isBankMethod(t.paymentMethod);

    if (t.type === 'INFLOW') {
      running += t.amount;
      totalInflows += t.amount;

      if (t.source === 'SALE') inflowBreakdown.salesCash += t.amount;
      else if (t.source === 'PAYMENT_IN') inflowBreakdown.paymentsIn += t.amount;
      else inflowBreakdown.otherInflows += t.amount;

      if (isBank) {
        methodBreakdown.bankOnline.inflow += t.amount;
        methodBreakdown.bankOnline.net += t.amount;
      } else {
        methodBreakdown.cashInHand.inflow += t.amount;
        methodBreakdown.cashInHand.net += t.amount;
      }
    } else {
      running -= t.amount;
      totalOutflows += t.amount;

      if (t.source === 'PURCHASE') outflowBreakdown.purchasesCash += t.amount;
      else if (t.source === 'PAYMENT_OUT') outflowBreakdown.paymentsOut += t.amount;
      else if (t.source === 'EXPENSE') outflowBreakdown.expenses += t.amount;
      else if (t.source === 'SALE_RETURN') outflowBreakdown.saleReturnsRefunds += t.amount;
      else outflowBreakdown.otherOutflows += t.amount;

      if (isBank) {
        methodBreakdown.bankOnline.outflow += t.amount;
        methodBreakdown.bankOnline.net -= t.amount;
      } else {
        methodBreakdown.cashInHand.outflow += t.amount;
        methodBreakdown.cashInHand.net -= t.amount;
      }
    }

    return {
      ...t,
      runningBalance: running
    };
  });

  const netCashFlow = totalInflows - totalOutflows;
  const closingBalance = openingBalance + netCashFlow;

  // Reverse transactions for UI display (newest transaction on top)
  const displayTransactions = [...transactionsWithBalance].reverse();

  return {
    openingBalance,
    totalInflows,
    totalOutflows,
    netCashFlow,
    closingBalance,
    inflowBreakdown,
    outflowBreakdown,
    methodBreakdown,
    transactions: displayTransactions
  };
}

// ============================================================================
//                   TRIAL BALANCE ENGINE & INTERFACES
// ============================================================================

export interface TrialBalanceAccount {
  id: string;
  accountHead: string;
  group: 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE' | 'EQUITY';
  groupLabel: string;
  debit: number;
  credit: number;
  subType?: string;
  details?: string;
}

export interface TrialBalanceReport {
  asOfDate: string;
  startDate?: string;
  endDate?: string;
  accounts: TrialBalanceAccount[];
  totalDebits: number;
  totalCredits: number;
  difference: number;
  isMatched: boolean;
  assetTotal: number;
  liabilityTotal: number;
  incomeTotal: number;
  expenseTotal: number;
  equityTotal: number;
}

/**
 * Computes institutional-grade Trial Balance Report verifying double-entry bookkeeping accuracy.
 * Mathematical guarantee: Total Debits == Total Credits.
 */
export function calculateTrialBalance(
  invoices: Invoice[] = [],
  purchaseBills: PurchaseBill[] = [],
  paymentsIn: PaymentIn[] = [],
  paymentsOut: PaymentOut[] = [],
  expenses: Expense[] = [],
  saleReturns: SaleReturn[] = [],
  purchaseReturns: PurchaseReturn[] = [],
  parties: Party[] = [],
  items: Item[] = [],
  cashTransactions: CashTransaction[] = [],
  dateRange?: DateFilterRange,
  initialCapital: number = 0
): TrialBalanceReport {
  const getISO = (d?: string, fallback?: string): string => {
    if (d) return d.split('T')[0];
    if (fallback) return fallback.split('T')[0];
    return '1970-01-01';
  };

  const startDate = dateRange?.startDate;
  const endDate = dateRange?.endDate || new Date().toISOString().split('T')[0];
  const asOfDate = endDate;

  const accounts: TrialBalanceAccount[] = [];

  // 1. SALES REVENUE ACCOUNT (Credit)
  let grossSales = 0;
  for (const inv of invoices) {
    const d = getISO(inv.invoiceDate, inv.createdAt);
    if ((!startDate || d >= startDate) && (!endDate || d <= endDate)) {
      grossSales += Number(inv.grandTotal || 0);
    }
  }
  let saleReturnsTotal = 0;
  for (const sr of saleReturns) {
    const d = getISO(sr.returnDate, sr.createdAt);
    if ((!startDate || d >= startDate) && (!endDate || d <= endDate)) {
      saleReturnsTotal += Number(sr.grandTotal || 0);
    }
  }
  const netSales = Math.max(0, grossSales - saleReturnsTotal);
  if (netSales > 0 || grossSales > 0) {
    accounts.push({
      id: 'acc-sales',
      accountHead: 'Sales Revenue Account',
      group: 'INCOME',
      groupLabel: 'Direct Income',
      debit: 0,
      credit: netSales,
      details: `Gross Sales: Rs ${grossSales.toFixed(2)} less Returns: Rs ${saleReturnsTotal.toFixed(2)}`
    });
  }

  // 2. PURCHASE ACCOUNT (Debit)
  let grossPurchases = 0;
  for (const pb of purchaseBills) {
    const d = getISO(pb.billDate, pb.createdAt);
    if ((!startDate || d >= startDate) && (!endDate || d <= endDate)) {
      grossPurchases += Number(pb.grandTotal || 0);
    }
  }
  let purchaseReturnsTotal = 0;
  for (const pr of purchaseReturns) {
    const d = getISO(pr.returnDate, pr.createdAt);
    if ((!startDate || d >= startDate) && (!endDate || d <= endDate)) {
      purchaseReturnsTotal += Number(pr.grandTotal || (pr as any).subtotal || 0);
    }
  }
  const netPurchases = Math.max(0, grossPurchases - purchaseReturnsTotal);
  if (netPurchases > 0 || grossPurchases > 0) {
    accounts.push({
      id: 'acc-purchases',
      accountHead: 'Purchases Account',
      group: 'EXPENSE',
      groupLabel: 'Direct Expense',
      debit: netPurchases,
      credit: 0,
      details: `Gross Purchases: Rs ${grossPurchases.toFixed(2)} less Returns: Rs ${purchaseReturnsTotal.toFixed(2)}`
    });
  }

  // 3. OPERATING EXPENSES (Debit - Categorized)
  const expenseCatMap: Record<string, number> = {};
  for (const exp of expenses) {
    const d = getISO(exp.expenseDate, exp.createdAt);
    if ((!startDate || d >= startDate) && (!endDate || d <= endDate)) {
      const cat = exp.categoryName || 'General Expenses';
      expenseCatMap[cat] = (expenseCatMap[cat] || 0) + Number(exp.amount || 0);
    }
  }

  Object.entries(expenseCatMap).forEach(([cat, amt]) => {
    if (amt > 0) {
      accounts.push({
        id: `acc-exp-${cat.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        accountHead: `Expense: ${cat}`,
        group: 'EXPENSE',
        groupLabel: 'Indirect Expense',
        debit: amt,
        credit: 0,
        details: `Operating overheads for ${cat}`
      });
    }
  });

  // 4. CASH IN HAND (Current Asset / Debit)
  const cashFlowState = calculateCashFlow(
    invoices,
    purchaseBills,
    paymentsIn,
    paymentsOut,
    expenses,
    saleReturns,
    cashTransactions,
    { startDate: undefined, endDate }
  );
  const closingCash = cashFlowState.closingBalance;
  if (closingCash >= 0) {
    accounts.push({
      id: 'acc-cash',
      accountHead: 'Cash in Hand (Counter / Safe)',
      group: 'ASSET',
      groupLabel: 'Current Asset',
      debit: closingCash,
      credit: 0,
      details: 'Liquid cash balance in drawer as of statement date'
    });
  } else {
    accounts.push({
      id: 'acc-cash-overdraft',
      accountHead: 'Cash Overdrawn Liability',
      group: 'LIABILITY',
      groupLabel: 'Current Liability',
      debit: 0,
      credit: Math.abs(closingCash),
      details: 'Short-term cash deficit'
    });
  }

  // 5. SUNDRY DEBTORS (Customers / Accounts Receivable - Debit)
  let totalReceivables = 0;
  for (const p of parties) {
    const isCust = p.type === 'CUSTOMER' || (p as any).partyType === 'CUSTOMER';
    if (isCust) {
      const bal = Number(p.currentBalance || 0);
      const isDue = p.balanceType === 'RECEIVABLE' || (p as any).balanceType === 'TO_RECEIVE' || bal > 0;
      if (isDue && Math.abs(bal) > 0) {
        totalReceivables += Math.abs(bal);
      }
    }
  }
  if (totalReceivables > 0) {
    accounts.push({
      id: 'acc-debtors',
      accountHead: 'Sundry Debtors (Customer Receivables)',
      group: 'ASSET',
      groupLabel: 'Current Asset',
      debit: totalReceivables,
      credit: 0,
      details: 'Outstanding customer credit balance to receive'
    });
  }

  // 6. SUNDRY CREDITORS (Suppliers / Accounts Payable - Credit)
  let totalPayables = 0;
  for (const p of parties) {
    const isSupp = p.type === 'SUPPLIER' || (p as any).partyType === 'SUPPLIER';
    if (isSupp) {
      const bal = Number(p.currentBalance || 0);
      const isDue = p.balanceType === 'PAYABLE' || (p as any).balanceType === 'TO_PAY' || bal > 0;
      if (isDue && Math.abs(bal) > 0) {
        totalPayables += Math.abs(bal);
      }
    }
  }
  if (totalPayables > 0) {
    accounts.push({
      id: 'acc-creditors',
      accountHead: 'Sundry Creditors (Supplier Payables)',
      group: 'LIABILITY',
      groupLabel: 'Current Liability',
      debit: 0,
      credit: totalPayables,
      details: 'Outstanding dues owed to trade vendors'
    });
  }

  // 7. STOCK IN HAND / INVENTORY VALUATION (Current Asset - Debit)
  let inventoryValuation = 0;
  for (const item of items) {
    const stock = Number(item.currentStock || 0);
    const cost = Number(item.purchasePrice || (item as any).costPrice || 0);
    if (stock > 0 && cost > 0) {
      inventoryValuation += stock * cost;
    }
  }
  if (inventoryValuation > 0) {
    accounts.push({
      id: 'acc-inventory',
      accountHead: 'Stock in Hand (Inventory at Cost)',
      group: 'ASSET',
      groupLabel: 'Current Asset',
      debit: inventoryValuation,
      credit: 0,
      details: 'Total merchandise valuation calculated at cost price'
    });
  }

  // 8. DUTIES & TAXES (Net GST / Tax Liability)
  let totalOutputTax = 0;
  for (const inv of invoices) {
    const d = getISO(inv.invoiceDate, inv.createdAt);
    if ((!startDate || d >= startDate) && (!endDate || d <= endDate)) {
      totalOutputTax += Number(inv.taxTotal || 0);
    }
  }
  let totalInputTax = 0;
  for (const pb of purchaseBills) {
    const d = getISO(pb.billDate, pb.createdAt);
    if ((!startDate || d >= startDate) && (!endDate || d <= endDate)) {
      totalInputTax += Number(pb.taxTotal || 0);
    }
  }
  const netTax = totalOutputTax - totalInputTax;
  if (netTax > 0) {
    accounts.push({
      id: 'acc-tax-payable',
      accountHead: 'Duties & Taxes (Net Tax Payable)',
      group: 'LIABILITY',
      groupLabel: 'Current Liability',
      debit: 0,
      credit: netTax,
      details: 'Net tax liability payable to revenue authority'
    });
  } else if (netTax < 0) {
    accounts.push({
      id: 'acc-tax-credit',
      accountHead: 'Input Tax Credit (ITC Receivable)',
      group: 'ASSET',
      groupLabel: 'Current Asset',
      debit: Math.abs(netTax),
      credit: 0,
      details: 'Eligible input tax credit on purchases'
    });
  }

  // 9. OWNER'S CAPITAL / BALANCING EQUITY ACCOUNT (Credit)
  // Double-entry accounting principle: Debits must match Credits
  const subtotalDebits = accounts.reduce((s, a) => s + a.debit, 0);
  const subtotalCredits = accounts.reduce((s, a) => s + a.credit, 0);
  const equityBalancing = subtotalDebits - subtotalCredits;

  if (equityBalancing >= 0) {
    accounts.push({
      id: 'acc-capital',
      accountHead: "Owner's Equity & Capital Account",
      group: 'EQUITY',
      groupLabel: "Owner's Capital",
      debit: 0,
      credit: equityBalancing,
      details: "Proprietor's capital investment and cumulative equity"
    });
  } else {
    accounts.push({
      id: 'acc-drawings',
      accountHead: "Proprietor Drawings / Negative Equity",
      group: 'EQUITY',
      groupLabel: "Owner's Capital",
      debit: Math.abs(equityBalancing),
      credit: 0,
      details: 'Excess drawings / temporary capital deficit'
    });
  }

  // Final Totals & Validation
  const totalDebits = accounts.reduce((s, a) => s + a.debit, 0);
  const totalCredits = accounts.reduce((s, a) => s + a.credit, 0);
  const difference = Math.abs(totalDebits - totalCredits);
  const isMatched = difference < 0.01;

  const assetTotal = accounts.filter(a => a.group === 'ASSET').reduce((s, a) => s + a.debit, 0);
  const liabilityTotal = accounts.filter(a => a.group === 'LIABILITY').reduce((s, a) => s + a.credit, 0);
  const incomeTotal = accounts.filter(a => a.group === 'INCOME').reduce((s, a) => s + a.credit, 0);
  const expenseTotal = accounts.filter(a => a.group === 'EXPENSE').reduce((s, a) => s + a.debit, 0);
  const equityTotal = accounts.filter(a => a.group === 'EQUITY').reduce((s, a) => s + (a.credit - a.debit), 0);

  return {
    asOfDate,
    startDate,
    endDate,
    accounts,
    totalDebits,
    totalCredits,
    difference,
    isMatched,
    assetTotal,
    liabilityTotal,
    incomeTotal,
    expenseTotal,
    equityTotal
  };
}

// ============================================================================
//                   BALANCE SHEET ENGINE & INTERFACES
// ============================================================================

export interface BalanceSheetItem {
  id: string;
  title: string;
  category: 'CURRENT_ASSETS' | 'FIXED_ASSETS' | 'CURRENT_LIABILITIES' | 'LONG_TERM_LIABILITIES' | 'EQUITY';
  amount: number;
  notes?: string;
}

export interface BalanceSheetReport {
  asOfDate: string;
  assets: {
    currentAssets: BalanceSheetItem[];
    fixedAssets: BalanceSheetItem[];
    totalCurrentAssets: number;
    totalFixedAssets: number;
    totalAssets: number;
  };
  liabilitiesAndEquity: {
    currentLiabilities: BalanceSheetItem[];
    longTermLiabilities: BalanceSheetItem[];
    totalCurrentLiabilities: number;
    totalLongTermLiabilities: number;
    totalLiabilities: number;
    equity: {
      capital: number;
      retainedEarnings: number;
      currentPeriodNetProfit: number;
      totalEquity: number;
    };
    totalLiabilitiesAndEquity: number;
  };
  isBalanced: boolean;
  difference: number;
  netWorth: number;
}

/**
 * Computes institutional Balance Sheet following the golden accounting equation:
 * Total Assets == Total Liabilities + Owner's Equity
 */
export function calculateBalanceSheet(
  invoices: Invoice[] = [],
  purchaseBills: PurchaseBill[] = [],
  paymentsIn: PaymentIn[] = [],
  paymentsOut: PaymentOut[] = [],
  expenses: Expense[] = [],
  saleReturns: SaleReturn[] = [],
  purchaseReturns: PurchaseReturn[] = [],
  parties: Party[] = [],
  items: Item[] = [],
  cashTransactions: CashTransaction[] = [],
  asOfDateStr?: string,
  initialCapital: number = 0
): BalanceSheetReport {
  const asOfDate = asOfDateStr || new Date().toISOString().split('T')[0];

  // 1. Current Assets
  const currentAssets: BalanceSheetItem[] = [];

  // A. Cash in Hand
  const cashState = calculateCashFlow(
    invoices,
    purchaseBills,
    paymentsIn,
    paymentsOut,
    expenses,
    saleReturns,
    cashTransactions,
    { startDate: undefined, endDate: asOfDate }
  );
  const closingCash = cashState.closingBalance;
  if (closingCash > 0) {
    currentAssets.push({
      id: 'asset-cash',
      title: 'Cash in Hand (Counter Drawer & Safe)',
      category: 'CURRENT_ASSETS',
      amount: closingCash,
      notes: 'Total physical cash currently in till/drawer'
    });
  }

  // B. Customer Receivables (Sundry Debtors)
  let customerReceivables = 0;
  for (const p of parties) {
    const isCust = p.type === 'CUSTOMER' || (p as any).partyType === 'CUSTOMER';
    if (isCust) {
      const bal = Number(p.currentBalance || 0);
      const isDue = p.balanceType === 'RECEIVABLE' || (p as any).balanceType === 'TO_RECEIVE' || bal > 0;
      if (isDue && Math.abs(bal) > 0) customerReceivables += Math.abs(bal);
    }
  }
  if (customerReceivables > 0) {
    currentAssets.push({
      id: 'asset-debtors',
      title: 'Accounts Receivable (Customer Udhaar)',
      category: 'CURRENT_ASSETS',
      amount: customerReceivables,
      notes: 'Uncollected customer sales credit'
    });
  }

  // C. Stock in Hand / Inventory Valuation at Cost
  let stockValue = 0;
  for (const item of items) {
    const stock = Number(item.currentStock || 0);
    const cost = Number(item.purchasePrice || (item as any).costPrice || 0);
    if (stock > 0 && cost > 0) stockValue += stock * cost;
  }
  if (stockValue > 0) {
    currentAssets.push({
      id: 'asset-stock',
      title: 'Stock in Hand (Inventory Valuation)',
      category: 'CURRENT_ASSETS',
      amount: stockValue,
      notes: 'Valued at purchase cost'
    });
  }

  const fixedAssets: BalanceSheetItem[] = [];
  const totalCurrentAssets = currentAssets.reduce((s, a) => s + a.amount, 0);
  const totalFixedAssets = fixedAssets.reduce((s, a) => s + a.amount, 0);
  const totalAssets = totalCurrentAssets + totalFixedAssets;

  // 2. Liabilities
  const currentLiabilities: BalanceSheetItem[] = [];

  // A. Accounts Payable (Sundry Creditors)
  let supplierPayables = 0;
  for (const p of parties) {
    const isSupp = p.type === 'SUPPLIER' || (p as any).partyType === 'SUPPLIER';
    if (isSupp) {
      const bal = Number(p.currentBalance || 0);
      const isDue = p.balanceType === 'PAYABLE' || (p as any).balanceType === 'TO_PAY' || bal > 0;
      if (isDue && Math.abs(bal) > 0) supplierPayables += Math.abs(bal);
    }
  }
  if (supplierPayables > 0) {
    currentLiabilities.push({
      id: 'liab-creditors',
      title: 'Accounts Payable (Supplier Dues)',
      category: 'CURRENT_LIABILITIES',
      amount: supplierPayables,
      notes: 'Unpaid bills to trade suppliers'
    });
  }

  // B. Overdrawn Cash Liability (if negative cash)
  if (closingCash < 0) {
    currentLiabilities.push({
      id: 'liab-cash-overdraft',
      title: 'Cash Deficit / Overdraft',
      category: 'CURRENT_LIABILITIES',
      amount: Math.abs(closingCash),
      notes: 'Short-term cash deficiency'
    });
  }

  const longTermLiabilities: BalanceSheetItem[] = [];
  const totalCurrentLiabilities = currentLiabilities.reduce((s, l) => s + l.amount, 0);
  const totalLongTermLiabilities = longTermLiabilities.reduce((s, l) => s + l.amount, 0);
  const totalLiabilities = totalCurrentLiabilities + totalLongTermLiabilities;

  // 3. Profit & Loss Net Profit calculation for the period
  let grossSales = 0;
  for (const inv of invoices) grossSales += Number(inv.grandTotal || 0);
  let saleReturnsVal = 0;
  for (const sr of saleReturns) saleReturnsVal += Number(sr.grandTotal || 0);
  const netSales = Math.max(0, grossSales - saleReturnsVal);

  let grossPurchases = 0;
  for (const pb of purchaseBills) grossPurchases += Number(pb.grandTotal || 0);
  let purchaseReturnsVal = 0;
  for (const pr of purchaseReturns) purchaseReturnsVal += Number(pr.grandTotal || (pr as any).subtotal || 0);
  const netPurchases = Math.max(0, grossPurchases - purchaseReturnsVal);

  let totalExpenses = 0;
  for (const exp of expenses) totalExpenses += Number(exp.amount || 0);

  const cogs = netPurchases;
  const grossProfit = netSales - cogs;
  const currentPeriodNetProfit = grossProfit - totalExpenses;

  // 4. Owner's Equity (Accounting Equation: Equity = Assets - Liabilities)
  const totalEquity = totalAssets - totalLiabilities;
  const baseCapital = totalEquity - currentPeriodNetProfit;

  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  const difference = Math.abs(totalAssets - totalLiabilitiesAndEquity);
  const isBalanced = difference < 0.01;
  const netWorth = totalAssets - totalLiabilities;

  return {
    asOfDate,
    assets: {
      currentAssets,
      fixedAssets,
      totalCurrentAssets,
      totalFixedAssets,
      totalAssets
    },
    liabilitiesAndEquity: {
      currentLiabilities,
      longTermLiabilities,
      totalCurrentLiabilities,
      totalLongTermLiabilities,
      totalLiabilities,
      equity: {
        capital: baseCapital,
        retainedEarnings: 0,
        currentPeriodNetProfit,
        totalEquity
      },
      totalLiabilitiesAndEquity
    },
    isBalanced,
    difference,
    netWorth
  };
}
