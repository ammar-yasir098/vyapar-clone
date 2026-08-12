import React, { useState, useEffect } from 'react';
import { BookOpen, Scale, ArrowUpRight, ArrowDownLeft, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { LedgerAccount, JournalEntry } from '../../types';
import { getProfitAndLossSummary, syncLedgerAccountBalances } from '../../services/ledger';

interface LedgerScreenProps {
  accounts: LedgerAccount[];
  journalEntries: JournalEntry[];
}

export const LedgerScreen: React.FC<LedgerScreenProps> = ({ accounts, journalEntries }) => {
  const [activeTab, setActiveTab] = useState<'accounts' | 'journals' | 'pnl'>('accounts');
  const [pnlData, setPnlData] = useState({
    salesRevenue: 0,
    cogs: 0,
    discounts: 0,
    grossProfit: 0,
    netProfit: 0
  });

  useEffect(() => {
    async function loadPnl() {
      await syncLedgerAccountBalances();
      const summary = await getProfitAndLossSummary();
      setPnlData(summary);
    }
    loadPnl();
  }, [journalEntries]);

  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const safeJournals = Array.isArray(journalEntries) ? journalEntries : [];

  // Deduplicate accounts by accountCode for clean chart display
  const uniqueAccounts = safeAccounts.reduce((accList: LedgerAccount[], current) => {
    const existingIndex = accList.findIndex(a => a.accountCode === current.accountCode);
    if (existingIndex === -1) {
      accList.push({ ...current });
    } else {
      accList[existingIndex].balance += current.balance;
    }
    return accList;
  }, []);

  const totalAssets = uniqueAccounts
    .filter(a => a.accountType === 'ASSET')
    .reduce((sum, a) => sum + Math.max(0, a.balance), 0);

  const totalLiabilities = Math.abs(
    uniqueAccounts
      .filter(a => a.accountType === 'LIABILITY')
      .reduce((sum, a) => sum + a.balance, 0)
  );

  return (
    <div className="flex-1 flex flex-col p-5 bg-[#f3f4f6] overflow-hidden gap-4 select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            <span>Cash & Bank / General Ledger</span>
          </h2>
          <p className="text-xs text-slate-500 font-semibold">
            Double-entry balanced debits and credits with trial balance & P&L statements
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-white border border-slate-200 p-1 rounded-xl shadow-sm">
          <button
            onClick={() => setActiveTab('accounts')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'accounts' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Chart of Accounts ({uniqueAccounts.length})
          </button>
          <button
            onClick={() => setActiveTab('journals')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'journals' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Journal Audit Log ({safeJournals.length})
          </button>
          <button
            onClick={() => setActiveTab('pnl')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'pnl' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Profit & Loss (P&L)
          </button>
        </div>
      </div>

      {/* Accounting Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs text-slate-500 font-semibold">Total Assets (Cash, Bank, Inventory)</div>
            <div className="text-xl font-mono font-black text-emerald-600">
              Rs {totalAssets.toFixed(2)}
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
            <ArrowDownLeft className="w-5 h-5 stroke-[2.5]" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs text-slate-500 font-semibold">Total Liabilities & Tax Payable</div>
            <div className="text-xl font-mono font-black text-rose-600">
              Rs {totalLiabilities.toFixed(2)}
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
            <ArrowUpRight className="w-5 h-5 stroke-[2.5]" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs text-slate-500 font-semibold">Net Operating Profit</div>
            <div className="text-xl font-mono font-black text-blue-600">
              Rs {pnlData.netProfit.toFixed(2)}
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 stroke-[2.5]" />
          </div>
        </div>
      </div>

      {/* TAB 1: Chart of Accounts Table */}
      {activeTab === 'accounts' && (
        <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col shadow-sm">
          <div className="flex-1 overflow-auto">
            <table className="vyapar-table">
              <thead>
                <tr>
                  <th>Account Code</th>
                  <th>Account Name</th>
                  <th>Account Type</th>
                  <th>Description</th>
                  <th className="text-right">Balance (Rs)</th>
                </tr>
              </thead>
              <tbody>
                {uniqueAccounts.map(acc => (
                  <tr key={acc.id}>
                    <td className="font-mono font-bold text-xs text-blue-600">{acc.accountCode}</td>
                    <td className="font-bold text-slate-800 text-xs">{acc.accountName}</td>
                    <td>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          acc.accountType === 'ASSET'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : acc.accountType === 'LIABILITY'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : acc.accountType === 'REVENUE'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-purple-50 text-purple-700 border-purple-200'
                        }`}
                      >
                        {acc.accountType}
                      </span>
                    </td>
                    <td className="text-xs text-slate-500">{acc.description || '-'}</td>
                    <td className="text-right font-mono font-black text-xs text-slate-800">
                      Rs {Math.abs(acc.balance).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Double-Entry Journal Audit Log */}
      {activeTab === 'journals' && (
        <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col p-4 space-y-3 shadow-sm">
          <div className="flex-1 overflow-auto space-y-3">
            {journalEntries.map(entry => (
              <div key={entry.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-extrabold text-blue-600">{entry.entryNumber}</span>
                    <span className="text-slate-500 font-semibold">• Ref: {entry.referenceId}</span>
                    <span className="text-slate-400 font-mono">({entry.transactionDate})</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Balanced (Debit = Credit Rs {entry.totalDebit.toFixed(2)})</span>
                  </div>
                </div>

                <div className="text-xs text-slate-700 font-bold mb-1">{entry.description}</div>

                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-slate-500 text-[10px] uppercase border-b border-slate-200">
                      <th className="text-left py-1">Account</th>
                      <th className="text-right py-1">Debit (Rs)</th>
                      <th className="text-right py-1">Credit (Rs)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.lines.map((line, idx) => (
                      <tr key={idx} className="border-b border-slate-200/60 text-slate-800">
                        <td className="py-1">
                          {line.accountCode} - {line.accountName}
                        </td>
                        <td className="text-right py-1 text-emerald-600 font-bold">
                          {line.debit > 0 ? `Rs ${line.debit.toFixed(2)}` : '-'}
                        </td>
                        <td className="text-right py-1 text-blue-600 font-bold">
                          {line.credit > 0 ? `Rs ${line.credit.toFixed(2)}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: Profit & Loss Statement */}
      {activeTab === 'pnl' && (
        <div className="flex-1 bg-white border border-slate-200 rounded-xl p-6 space-y-4 max-w-xl shadow-sm">
          <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-2">
            Statement of Profit & Loss
          </h3>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between py-1.5 border-b border-slate-200">
              <span className="text-slate-600 font-semibold">Gross Sales Revenue:</span>
              <span className="font-bold text-emerald-600">Rs {pnlData.salesRevenue.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-200">
              <span className="text-slate-600 font-semibold">Less: Sales Discounts Granted:</span>
              <span className="text-rose-600">-Rs {pnlData.discounts.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-200">
              <span className="text-slate-600 font-semibold">Less: Cost of Goods Sold (COGS):</span>
              <span className="text-rose-600">-Rs {pnlData.cogs.toFixed(2)}</span>
            </div>

            <div className="flex justify-between py-3 text-sm font-black border-t-2 border-b-2 border-slate-300 text-blue-600">
              <span>NET OPERATING PROFIT:</span>
              <span>Rs {pnlData.netProfit.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
