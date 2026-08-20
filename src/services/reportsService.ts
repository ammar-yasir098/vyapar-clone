import { Invoice, SaleReturn, PurchaseBill, PurchaseReturn, Expense, Party, PaymentIn, PaymentOut, Item } from '../types';

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
 */
export function calculateTaxSummary(
  invoices: Invoice[] = [],
  purchaseBills: PurchaseBill[] = [],
  dateRange?: DateFilterRange
): TaxSummaryReport {
  const filteredInvoices = invoices.filter(inv => isDateInRange(inv.invoiceDate, dateRange));
  const filteredBills = purchaseBills.filter(pb => isDateInRange(pb.billDate, dateRange));

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

  // Process Sales Invoices (Output Tax)
  for (const inv of filteredInvoices) {
    if (inv.items && Array.isArray(inv.items)) {
      for (const item of inv.items) {
        const qty = Number(item.quantity || 0);
        const rate = Number(item.unitPrice || 0);
        const taxable = qty * rate;
        const cgstR = Number(item.cgstRate || 0);
        const sgstR = Number(item.sgstRate || 0);
        const igstR = Number(item.igstRate || 0);
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

  let cgstPaidTotal = 0;
  let sgstPaidTotal = 0;
  let igstPaidTotal = 0;

  // Process Purchase Bills (Input Tax Credit)
  for (const pb of filteredBills) {
    if (pb.items && Array.isArray(pb.items)) {
      for (const item of pb.items) {
        const qty = Number(item.quantity || 0);
        const rate = Number(item.unitPrice || item.purchasePrice || 0);
        const taxable = qty * rate;
        const cgstR = Number(item.cgstRate || 0);
        const sgstR = Number(item.sgstRate || 0);
        const igstR = Number(item.igstRate || 0);
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
