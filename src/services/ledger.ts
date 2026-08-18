import { db, seedDatabaseIfEmpty, seedLedgerAccountsForTenant } from '../db';
import { Invoice, JournalEntry, JournalLine } from '../types';
import { syncManager } from './sync';
import { roundCurrency } from '../utils/edgeCaseHelpers';

/**
 * Automatically creates balanced double-entry Journal Entries for any POS Invoice.
 * Enforces standard accounting principles: Total Debits === Total Credits.
 */
export async function postInvoiceJournalEntry(invoice: Invoice): Promise<JournalEntry | null> {
  try {
    const tenantId = invoice.tenantId || 'default-tenant';
    let accounts = await db.ledgerAccounts.filter(a => (a.tenantId || 'default-tenant') === tenantId).toArray();
    if (accounts.length === 0) {
      await seedLedgerAccountsForTenant(tenantId);
      accounts = await db.ledgerAccounts.filter(a => (a.tenantId || 'default-tenant') === tenantId).toArray();
    }

    // Map standard account codes
    const cashAcc = accounts.find(a => a.accountCode === '1010') || accounts[0];
    const bankAcc = accounts.find(a => a.accountCode === '1020') || accounts[0];
    const arAcc = accounts.find(a => a.accountCode === '1030') || accounts[0];
    const inventoryAcc = accounts.find(a => a.accountCode === '1040') || accounts[0];
    const gstAcc = accounts.find(a => a.accountCode === '2020') || accounts[0];
    const salesAcc = accounts.find(a => a.accountCode === '4010') || accounts[0];
    const cogsAcc = accounts.find(a => a.accountCode === '5010') || accounts[0];
    const discountAcc = accounts.find(a => a.accountCode === '5020') || accounts[0];

    if (!cashAcc || !salesAcc) {
      console.warn('Chart of Accounts not initialized properly.');
      return null;
    }

    const lines: JournalLine[] = [];
    const received = Math.max(0, roundCurrency(invoice.receivedAmount || 0));
    const due = Math.max(0, roundCurrency(invoice.dueAmount || (invoice.grandTotal - received)));
    const paymentAcc = invoice.paymentMethod === 'CASH' ? cashAcc : bankAcc;

    // 1. DEBIT: Split between Payment Receiving Account (Cash/Bank) and Accounts Receivable for Dues
    if (received > 0) {
      lines.push({
        accountId: paymentAcc.id!,
        accountCode: paymentAcc.accountCode,
        accountName: paymentAcc.accountName,
        debit: received,
        credit: 0
      });
    }

    if (due > 0 || received === 0) {
      const arDebit = due > 0 ? due : roundCurrency(invoice.grandTotal);
      lines.push({
        accountId: arAcc.id!,
        accountCode: arAcc.accountCode,
        accountName: `Accounts Receivable (${invoice.partyName || 'Customer'})`,
        debit: arDebit,
        credit: 0
      });
    }

    // 2. DEBIT: Sales Discount (if applicable)
    const discountAmt = roundCurrency(invoice.discountTotal || 0);
    if (discountAmt > 0) {
      lines.push({
        accountId: discountAcc.id!,
        accountCode: discountAcc.accountCode,
        accountName: discountAcc.accountName,
        debit: discountAmt,
        credit: 0
      });
    }

    // 3. CREDIT: Sales Revenue
    const subtotalAmt = roundCurrency(invoice.subtotal || (invoice.grandTotal - (invoice.taxTotal || 0)));
    lines.push({
      accountId: salesAcc.id!,
      accountCode: salesAcc.accountCode,
      accountName: salesAcc.accountName,
      debit: 0,
      credit: subtotalAmt
    });

    // 4. CREDIT: GST Tax Liability (if applicable)
    const taxAmt = roundCurrency(invoice.taxTotal || 0);
    if (taxAmt > 0) {
      lines.push({
        accountId: gstAcc.id!,
        accountCode: gstAcc.accountCode,
        accountName: gstAcc.accountName,
        debit: 0,
        credit: taxAmt
      });
    }

    // Calculate total Debits and Credits with rounding safety
    const totalDebit = roundCurrency(lines.reduce((sum, l) => sum + l.debit, 0));
    const totalCredit = roundCurrency(lines.reduce((sum, l) => sum + l.credit, 0));

    // Double-entry validation safety
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      console.warn(`Double-entry unbalance detected (${totalDebit} vs ${totalCredit}). Adjusting sales credit line.`);
      const lastLine = lines[lines.length - 1];
      if (lastLine) {
        lastLine.credit = roundCurrency(lastLine.credit + (totalDebit - totalCredit));
      }
    }

    const count = await db.journalEntries.count();
    const entryNumber = `JE-2026-${(count + 1).toString().padStart(4, '0')}`;

    const entry: JournalEntry = {
      tenantId,
      entryNumber,
      referenceId: invoice.invoiceNumber,
      transactionDate: invoice.invoiceDate || new Date().toISOString().split('T')[0],
      description: `Sales revenue & tax posting for Invoice ${invoice.invoiceNumber} (${invoice.partyName})`,
      lines,
      totalDebit,
      totalCredit,
      createdAt: new Date().toISOString()
    };

    const savedId = await db.journalEntries.add(entry);
    entry.id = savedId;

    // Log Journal Entry mutation for cloud sync
    await syncManager.logMutation('JOURNAL', entry.entryNumber, 'INSERT', entry);

    // Update Account balances based on standard accounting rules
    for (const line of lines) {
      const acc = accounts.find(a => a.id === line.accountId);
      if (acc && acc.id) {
        const isCreditNormal = acc.accountType === 'LIABILITY' || acc.accountType === 'EQUITY' || acc.accountType === 'REVENUE';
        const netChange = isCreditNormal ? (line.credit - line.debit) : (line.debit - line.credit);
        const newBal = (acc.balance || 0) + netChange;
        await db.ledgerAccounts.update(acc.id, { balance: newBal });
      }
    }

    // 5. Post COGS & Inventory Adjustment Entry
    const totalCostOfGoods = invoice.items ? invoice.items.reduce((sum, item) => sum + (item.quantity * (item.purchasePrice || 0)), 0) : 0;
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

      const cogsEntry: JournalEntry = {
        tenantId,
        entryNumber: cogsEntryNumber,
        referenceId: invoice.invoiceNumber,
        transactionDate: invoice.invoiceDate || new Date().toISOString().split('T')[0],
        description: `COGS & Inventory stock reduction for Invoice ${invoice.invoiceNumber}`,
        lines: cogsLines,
        totalDebit: totalCostOfGoods,
        totalCredit: totalCostOfGoods,
        createdAt: new Date().toISOString()
      };

      const cogsSavedId = await db.journalEntries.add(cogsEntry);
      cogsEntry.id = cogsSavedId;

      await syncManager.logMutation('JOURNAL', cogsEntryNumber, 'INSERT', cogsEntry);
    }

    return entry;
  } catch (err) {
    console.error('Error posting double-entry journal entry:', err);
    return null;
  }
}

/**
 * Automatically creates double-entry Journal Entry and updates Ledger Accounts for Party Payments.
 */
export async function postPaymentJournalEntry(
  partyName: string,
  partyType: 'CUSTOMER' | 'SUPPLIER' | string,
  paymentAmount: number,
  paymentRemarks: string = '',
  tenantId: string = 'default-tenant'
): Promise<JournalEntry | null> {
  try {
    let accounts = await db.ledgerAccounts.filter(a => (a.tenantId || 'default-tenant') === tenantId).toArray();
    if (accounts.length === 0) {
      await seedLedgerAccountsForTenant(tenantId);
      accounts = await db.ledgerAccounts.filter(a => (a.tenantId || 'default-tenant') === tenantId).toArray();
    }

    const cashAcc = accounts.find(a => a.accountCode === '1010') || accounts[0];
    const arAcc = accounts.find(a => a.accountCode === '1030') || accounts[0];
    const apAcc = accounts.find(a => a.accountCode === '2010') || accounts[0];

    const isCustomer = partyType === 'CUSTOMER' || partyType === 'BOTH';

    const lines: JournalLine[] = [
      {
        accountId: cashAcc ? cashAcc.id! : 1,
        accountCode: cashAcc ? cashAcc.accountCode : '1010',
        accountName: cashAcc ? cashAcc.accountName : 'Cash in Hand',
        debit: isCustomer ? paymentAmount : 0,
        credit: isCustomer ? 0 : paymentAmount
      },
      {
        accountId: isCustomer ? (arAcc ? arAcc.id! : 3) : (apAcc ? apAcc.id! : 5),
        accountCode: isCustomer ? (arAcc ? arAcc.accountCode : '1030') : (apAcc ? apAcc.accountCode : '2010'),
        accountName: isCustomer ? `Accounts Receivable (${partyName})` : `Accounts Payable (${partyName})`,
        debit: isCustomer ? 0 : paymentAmount,
        credit: isCustomer ? paymentAmount : 0
      }
    ];

    const count = await db.journalEntries.count();
    const entryNumber = `JE-PAY-${Date.now().toString().slice(-4)}`;

    const journalEntry: JournalEntry = {
      tenantId,
      entryNumber,
      referenceId: `PAY-${partyName}`,
      transactionDate: new Date().toISOString().split('T')[0],
      description: `Payment ${isCustomer ? 'Received from' : 'Made to'} ${partyName}: ${paymentRemarks}`,
      lines,
      totalDebit: paymentAmount,
      totalCredit: paymentAmount,
      createdAt: new Date().toISOString()
    };

    const savedId = await db.journalEntries.add(journalEntry);
    journalEntry.id = savedId;

    await syncManager.logMutation('JOURNAL', entryNumber, 'INSERT', journalEntry);

    // Update Ledger Account Balances in Dexie
    if (cashAcc && cashAcc.id) {
      const newCashBal = (cashAcc.balance || 0) + (isCustomer ? paymentAmount : -paymentAmount);
      await db.ledgerAccounts.update(cashAcc.id, { balance: newCashBal });
    }

    if (isCustomer && arAcc && arAcc.id) {
      const newArBal = (arAcc.balance || 0) - paymentAmount;
      await db.ledgerAccounts.update(arAcc.id, { balance: newArBal });
    } else if (!isCustomer && apAcc && apAcc.id) {
      const newApBal = (apAcc.balance || 0) - paymentAmount;
      await db.ledgerAccounts.update(apAcc.id, { balance: newApBal });
    }

    return journalEntry;
  } catch (err) {
    console.error('Error posting payment journal entry:', err);
    return null;
  }
}

/**
 * Synchronizes Accounts Receivable (1030) and Accounts Payable (2010) balances
 * with actual party credit receivables and payables in Dexie IndexedDB for a store tenant.
 */
export async function syncLedgerAccountBalances(tenantId: string = 'default-tenant') {
  try {
    await seedLedgerAccountsForTenant(tenantId);

    const accounts = await db.ledgerAccounts.filter(a => (a.tenantId || 'default-tenant') === tenantId).toArray();
    const parties = await db.parties.filter(p => (p.tenantId || 'default-tenant') === tenantId).toArray();

    const totalReceivables = parties
      .filter(p => p.type === 'CUSTOMER' || p.type === 'BOTH')
      .reduce((sum, p) => sum + Math.max(0, p.currentBalance || 0), 0);

    const totalPayables = parties
      .filter(p => p.type === 'SUPPLIER' || p.type === 'BOTH')
      .reduce((sum, p) => sum + Math.max(0, p.currentBalance || 0), 0);

    const arAcc = accounts.find(a => a.accountCode === '1030');
    if (arAcc && arAcc.id) {
      await db.ledgerAccounts.update(arAcc.id, { balance: totalReceivables });
    }

    const apAcc = accounts.find(a => a.accountCode === '2010');
    if (apAcc && apAcc.id) {
      await db.ledgerAccounts.update(apAcc.id, { balance: totalPayables });
    }
  } catch (err) {
    console.error('Error syncing ledger account balances:', err);
  }
}

/**
 * Calculates Profit and Loss Statement metrics for a specific store tenant.
 */
export async function getProfitAndLossSummary(tenantId: string = 'default-tenant') {
  const accounts = await db.ledgerAccounts.filter(a => (a.tenantId || 'default-tenant') === tenantId).toArray();
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
