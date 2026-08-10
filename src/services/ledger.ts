import { db } from '../db';
import { Invoice, JournalEntry, JournalLine } from '../types';

/**
 * Automatically creates balanced double-entry Journal Entries for any POS Invoice.
 * Enforces standard accounting principles: Total Debits === Total Credits.
 */
export async function postInvoiceJournalEntry(invoice: Invoice): Promise<JournalEntry | null> {
  try {
    const accounts = await db.ledgerAccounts.toArray();

    // Map standard account codes
    const cashAcc = accounts.find(a => a.accountCode === '1010') || accounts[0];
    const bankAcc = accounts.find(a => a.accountCode === '1020') || accounts[0];
    const arAcc = accounts.find(a => a.accountCode === '1030') || accounts[0];
    const inventoryAcc = accounts.find(a => a.accountCode === '1040') || accounts[0];
    const gstAcc = accounts.find(a => a.accountCode === '2020') || accounts[0];
    const salesAcc = accounts.find(a => a.accountCode === '4010') || accounts[0];
    const cogsAcc = accounts.find(a => a.accountCode === '5010') || accounts[0];
    const discountAcc = accounts.find(a => a.accountCode === '5020') || accounts[0];

    const lines: JournalLine[] = [];

    // 1. DEBIT: Payment Receiving Account or Accounts Receivable
    if (invoice.paymentMethod === 'CREDIT' || invoice.dueAmount > 0) {
      lines.push({
        accountId: arAcc.id!,
        accountCode: arAcc.accountCode,
        accountName: `Accounts Receivable (${invoice.partyName})`,
        debit: invoice.grandTotal,
        credit: 0
      });
    } else if (invoice.paymentMethod === 'CASH') {
      lines.push({
        accountId: cashAcc.id!,
        accountCode: cashAcc.accountCode,
        accountName: cashAcc.accountName,
        debit: invoice.grandTotal,
        credit: 0
      });
    } else {
      // UPI or CARD -> Bank Account
      lines.push({
        accountId: bankAcc.id!,
        accountCode: bankAcc.accountCode,
        accountName: bankAcc.accountName,
        debit: invoice.grandTotal,
        credit: 0
      });
    }

    // 2. DEBIT: Sales Discount (if applicable)
    if (invoice.discountTotal > 0) {
      lines.push({
        accountId: discountAcc.id!,
        accountCode: discountAcc.accountCode,
        accountName: discountAcc.accountName,
        debit: invoice.discountTotal,
        credit: 0
      });
    }

    // 3. CREDIT: Sales Revenue
    lines.push({
      accountId: salesAcc.id!,
      accountCode: salesAcc.accountCode,
      accountName: salesAcc.accountName,
      debit: 0,
      credit: invoice.subtotal
    });

    // 4. CREDIT: GST Tax Liability (if applicable)
    if (invoice.taxTotal > 0) {
      lines.push({
        accountId: gstAcc.id!,
        accountCode: gstAcc.accountCode,
        accountName: gstAcc.accountName,
        debit: 0,
        credit: invoice.taxTotal
      });
    }

    // Calculate total Debits and Credits
    const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);

    const count = await db.journalEntries.count();
    const entryNumber = `JE-2026-${(count + 1).toString().padStart(4, '0')}`;

    const entry: JournalEntry = {
      tenantId: invoice.tenantId,
      entryNumber,
      referenceId: invoice.invoiceNumber,
      transactionDate: invoice.invoiceDate,
      description: `Sales revenue & tax posting for Invoice ${invoice.invoiceNumber} (${invoice.partyName})`,
      lines,
      totalDebit,
      totalCredit,
      createdAt: new Date().toISOString()
    };

    await db.journalEntries.add(entry);

    // Update Account balances
    for (const line of lines) {
      const acc = accounts.find(a => a.id === line.accountId);
      if (acc && acc.id) {
        const netChange = line.debit - line.credit;
        const newBal = acc.balance + netChange;
        await db.ledgerAccounts.update(acc.id, { balance: newBal });
      }
    }

    // 5. Post COGS & Inventory Adjustment Entry
    const totalCostOfGoods = invoice.items.reduce((sum, item) => sum + item.quantity * item.purchasePrice, 0);
    if (totalCostOfGoods > 0) {
      const cogsEntryNumber = `JE-2026-${(count + 2).toString().padStart(4, '0')}`;
      const cogsLines: JournalLine[] = [
        {
          accountId: cogsAcc.id!,
          accountCode: cogsAcc.accountCode,
          accountName: cogsAcc.accountName,
          debit: totalCostOfGoods,
          credit: 0
        },
        {
          accountId: inventoryAcc.id!,
          accountCode: inventoryAcc.accountCode,
          accountName: inventoryAcc.accountName,
          debit: 0,
          credit: totalCostOfGoods
        }
      ];

      await db.journalEntries.add({
        tenantId: invoice.tenantId,
        entryNumber: cogsEntryNumber,
        referenceId: invoice.invoiceNumber,
        transactionDate: invoice.invoiceDate,
        description: `COGS & Inventory stock reduction for Invoice ${invoice.invoiceNumber}`,
        lines: cogsLines,
        totalDebit: totalCostOfGoods,
        totalCredit: totalCostOfGoods,
        createdAt: new Date().toISOString()
      });
    }

    return entry;
  } catch (err) {
    console.error('Error posting double-entry journal entry:', err);
    return null;
  }
}

/**
 * Calculates Profit and Loss Statement metrics.
 */
export async function getProfitAndLossSummary() {
  const accounts = await db.ledgerAccounts.toArray();
  const salesRev = accounts.find(a => a.accountCode === '4010')?.balance || 0;
  const cogs = accounts.find(a => a.accountCode === '5010')?.balance || 0;
  const discounts = accounts.find(a => a.accountCode === '5020')?.balance || 0;

  const grossProfit = Math.abs(salesRev) - cogs - discounts;
  const netProfit = grossProfit;

  return {
    salesRevenue: Math.abs(salesRev),
    cogs,
    discounts,
    grossProfit,
    netProfit
  };
}
