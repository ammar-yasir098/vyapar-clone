import React, { useState } from 'react';
import { 
  Wallet, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Plus, 
  Minus, 
  Search, 
  Filter, 
  Calendar, 
  Download, 
  RefreshCw, 
  Banknote, 
  Receipt, 
  TrendingUp,
  CreditCard,
  ArrowRightLeft
} from 'lucide-react';
import { BusinessDetails } from '../../types';

interface CashInHandScreenProps {
  business?: BusinessDetails;
}

export const CashInHandScreen: React.FC<CashInHandScreenProps> = ({ business }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [dateFilter, setDateFilter] = useState('month');

  // Placeholder sample structure for Cash In Hand transactions (ready for user functionality)
  const [transactions, setTransactions] = useState<any[]>([]);

  const totalCashBalance = 0;
  const todayCashIn = 0;
  const todayCashOut = 0;

  return (
    <div className="flex-1 flex flex-col p-6 bg-[#f3f4f6] overflow-y-auto gap-6 select-none">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              <Wallet className="w-6 h-6 stroke-[2.5]" />
            </div>
            <span>Cash In Hand</span>
          </h2>
          <p className="text-xs text-slate-500 font-semibold mt-1">
            Track daily physical cash balances, counter drawer cash-in/out, and petty cash entries
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button 
            type="button"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Add Cash In</span>
          </button>
          <button 
            type="button"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
          >
            <Minus className="w-4 h-4 stroke-[3]" />
            <span>Add Cash Out</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Cash Balance */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between hover:border-emerald-500 transition">
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Cash In Hand Balance</div>
            <div className="text-2xl font-black text-slate-900 font-mono">
              Rs {totalCashBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-emerald-600 font-bold mt-1 flex items-center gap-1">
              <Banknote className="w-3 h-3" />
              <span>Current Physical Cash</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
            <Wallet className="w-6 h-6 stroke-[2.5]" />
          </div>
        </div>

        {/* Cash Received (Cash In) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between hover:border-blue-500 transition">
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Total Cash In</div>
            <div className="text-2xl font-black text-emerald-600 font-mono">
              Rs {todayCashIn.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-400 font-semibold mt-1">Receipts & Counter Collections</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
            <ArrowDownLeft className="w-6 h-6 stroke-[2.5]" />
          </div>
        </div>

        {/* Cash Paid (Cash Out) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between hover:border-rose-500 transition">
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Total Cash Out</div>
            <div className="text-2xl font-black text-rose-600 font-mono">
              Rs {todayCashOut.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-400 font-semibold mt-1">Payments & Expenses Paid in Cash</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
            <ArrowUpRight className="w-6 h-6 stroke-[2.5]" />
          </div>
        </div>

        {/* Net Cash Movement */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between hover:border-sky-500 transition">
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Net Cash Movement</div>
            <div className="text-2xl font-black text-slate-900 font-mono">
              Rs {(todayCashIn - todayCashOut).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-400 font-semibold mt-1">Net Period Change</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 shrink-0">
            <TrendingUp className="w-6 h-6 stroke-[2.5]" />
          </div>
        </div>
      </div>

      {/* Main Content Area: Search, Filters & Transactions Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col overflow-hidden flex-1">
        {/* Table Header & Controls */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search cash entries, remarks..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
            />
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <div className="flex bg-slate-200/70 p-1 rounded-xl text-xs font-bold">
              <button
                onClick={() => setFilterType('ALL')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  filterType === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterType('IN')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  filterType === 'IN' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cash In
              </button>
              <button
                onClick={() => setFilterType('OUT')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  filterType === 'OUT' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cash Out
              </button>
            </div>
          </div>
        </div>

        {/* Transactions Table / Empty State */}
        <div className="flex-1 overflow-y-auto">
          {transactions.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center p-6">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-3">
                <Banknote className="w-8 h-8 stroke-[1.75]" />
              </div>
              <h3 className="text-base font-extrabold text-slate-800">No Cash In Hand Transactions Recorded</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Cash transactions entered here or collected at counter will appear in this ledger.
              </p>
              <div className="flex items-center gap-3 mt-5">
                <button
                  type="button"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  + Add Cash In Entry
                </button>
                <button
                  type="button"
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  + Add Cash Out Entry
                </button>
              </div>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                  <th className="p-3 pl-4">Date & Time</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Reference / Category</th>
                  <th className="p-3">Remarks</th>
                  <th className="p-3 text-right">Amount (Rs)</th>
                  <th className="p-3 text-right pr-4">Cash Balance (Rs)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((txn, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition">
                    <td className="p-3 pl-4 font-mono text-slate-600">{txn.date}</td>
                    <td className="p-3 font-semibold">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        txn.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {txn.type === 'IN' ? 'CASH IN' : 'CASH OUT'}
                      </span>
                    </td>
                    <td className="p-3 text-slate-800 font-medium">{txn.reference}</td>
                    <td className="p-3 text-slate-500">{txn.remarks || '-'}</td>
                    <td className={`p-3 text-right font-mono font-bold ${
                      txn.type === 'IN' ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {txn.type === 'IN' ? '+' : '-'}Rs {Number(txn.amount || 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-right pr-4 font-mono font-bold text-slate-800">
                      Rs {Number(txn.runningBalance || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
