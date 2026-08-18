import React, { useState, useEffect } from 'react';
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
  ArrowRightLeft,
  X,
  CheckCircle2,
  AlertTriangle,
  FileText,
  DollarSign
} from 'lucide-react';
import { BusinessDetails, CashTransaction, CashTransactionSource } from '../../types';
import { fetchCashBalance, fetchCashTransactions, recordCashEntry, transferToBank, transferFromBank, adjustCashBalance } from '../../services/cash';
import { useToast } from '../Common/ToastContext';

interface CashInHandScreenProps {
  business?: BusinessDetails;
}

export const CashInHandScreen: React.FC<CashInHandScreenProps> = ({ business }) => {
  const { showToast } = useToast();
  const tenantId = business?.tenantId || 'default-tenant';

  // Data States
  const [balanceInfo, setBalanceInfo] = useState({
    accountId: 1,
    name: 'Main Cash Drawer',
    openingBalance: 0,
    totalIn: 0,
    totalOut: 0,
    currentBalance: 0
  });

  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [filterSource, setFilterSource] = useState<string>('ALL');

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);

  // Form States - Add Entry
  const [entryType, setEntryType] = useState<'IN' | 'OUT'>('IN');
  const [entryAmount, setEntryAmount] = useState('');
  const [entrySource, setEntrySource] = useState<CashTransactionSource>('MANUAL_ADJUSTMENT');
  const [entryDesc, setEntryDesc] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);

  // Form States - Bank Transfer
  const [transferMode, setTransferMode] = useState<'TO_BANK' | 'FROM_BANK'>('TO_BANK');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDesc, setTransferDesc] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);

  // Form States - Reconciliation Adjustment
  const [physicalCount, setPhysicalCount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustDate, setAdjustDate] = useState(new Date().toISOString().split('T')[0]);

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const bal = await fetchCashBalance(tenantId);
      setBalanceInfo(bal);

      const txRes = await fetchCashTransactions(tenantId, {
        type: filterType !== 'ALL' ? filterType : '',
        source: filterSource !== 'ALL' ? filterSource : '',
        search: searchTerm
      });
      setTransactions(txRes.transactions || []);
    } catch (err) {
      console.error('Error loading Cash In Hand data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [tenantId, filterType, filterSource, searchTerm]);

  // Handle Add Cash Entry
  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(entryAmount);
    if (!amt || amt <= 0) {
      showToast('Please enter a valid amount greater than 0', 'error');
      return;
    }

    const res = await recordCashEntry({
      tenantId,
      cashAccountId: balanceInfo.accountId,
      type: entryType,
      amount: amt,
      source: entrySource,
      description: entryDesc || `Manual Cash ${entryType === 'IN' ? 'Inflow' : 'Outflow'}`,
      transactionDate: entryDate
    });

    if (res.success !== false) {
      showToast(`Cash ${entryType === 'IN' ? 'Inflow' : 'Outflow'} of Rs ${amt.toFixed(2)} recorded successfully`, 'success');
      setIsAddModalOpen(false);
      setEntryAmount('');
      setEntryDesc('');
      loadData();
    } else {
      showToast(res.error || 'Failed to record cash entry', 'error');
    }
  };

  // Handle Bank Transfer
  const handleSaveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(transferAmount);
    if (!amt || amt <= 0) {
      showToast('Please enter a valid transfer amount', 'error');
      return;
    }

    let res;
    if (transferMode === 'TO_BANK') {
      res = await transferToBank({ tenantId, cashAccountId: balanceInfo.accountId, amount: amt, description: transferDesc, date: transferDate });
    } else {
      res = await transferFromBank({ tenantId, cashAccountId: balanceInfo.accountId, amount: amt, description: transferDesc, date: transferDate });
    }

    if (res.success !== false) {
      showToast(
        transferMode === 'TO_BANK'
          ? `Deposited Rs ${amt.toFixed(2)} cash into bank account`
          : `Withdrew Rs ${amt.toFixed(2)} cash from bank into drawer`,
        'success'
      );
      setIsTransferModalOpen(false);
      setTransferAmount('');
      setTransferDesc('');
      loadData();
    } else {
      showToast(res.error || 'Transfer failed', 'error');
    }
  };

  // Handle Physical Cash Adjustment
  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    const phys = parseFloat(physicalCount);
    if (isNaN(phys) || phys < 0) {
      showToast('Please enter a valid physical count', 'error');
      return;
    }

    const res = await adjustCashBalance({
      tenantId,
      cashAccountId: balanceInfo.accountId,
      physicalCount: phys,
      reason: adjustReason,
      date: adjustDate
    });

    if (res.success !== false) {
      showToast(res.message || 'Physical cash count reconciled', 'success');
      setIsAdjustModalOpen(false);
      setPhysicalCount('');
      setAdjustReason('');
      loadData();
    } else {
      showToast(res.error || 'Adjustment failed', 'error');
    }
  };

  // Source Badge Color Map
  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'POS_SALE':
      case 'SALE_INVOICE':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-100 text-emerald-800">POS SALE</span>;
      case 'PAYMENT_IN':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-blue-100 text-blue-800">PAYMENT IN</span>;
      case 'PURCHASE_BILL':
      case 'PAYMENT_OUT':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-purple-100 text-purple-800">PURCHASE / PAYOUT</span>;
      case 'EXPENSE':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-100 text-amber-800">EXPENSE</span>;
      case 'BANK_DEPOSIT':
      case 'BANK_WITHDRAWAL':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-sky-100 text-sky-800">BANK TRANSFER</span>;
      case 'MANUAL_ADJUSTMENT':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 text-slate-700">ADJUSTMENT</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 text-slate-700">{source}</span>;
    }
  };

  const netMovement = balanceInfo.totalIn - balanceInfo.totalOut;

  return (
    <div className="flex-1 flex flex-col p-6 bg-[#f3f4f6] overflow-y-auto gap-6 select-none">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              <Wallet className="w-6 h-6 stroke-[2.5]" />
            </div>
            <span>Cash In Hand</span>
          </h2>
          <p className="text-xs text-slate-500 font-semibold mt-1">
            Immutably tracked physical cash register ledger with double-entry balance validation
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button 
            type="button"
            onClick={() => { setEntryType('IN'); setIsAddModalOpen(true); }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Add Cash In</span>
          </button>

          <button 
            type="button"
            onClick={() => { setEntryType('OUT'); setIsAddModalOpen(true); }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
          >
            <Minus className="w-4 h-4 stroke-[3]" />
            <span>Add Cash Out</span>
          </button>

          <button 
            type="button"
            onClick={() => setIsTransferModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>Bank Transfer</span>
          </button>

          <button 
            type="button"
            onClick={() => { setPhysicalCount(balanceInfo.currentBalance.toString()); setIsAdjustModalOpen(true); }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reconcile Count</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Cash Balance */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between hover:border-emerald-500 transition">
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Cash In Hand Balance</div>
            <div className="text-2xl font-black text-slate-900 font-mono">
              Rs {balanceInfo.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-emerald-600 font-bold mt-1 flex items-center gap-1">
              <Banknote className="w-3.5 h-3.5" />
              <span>Opening: Rs {balanceInfo.openingBalance.toFixed(2)}</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
            <Wallet className="w-6 h-6 stroke-[2.5]" />
          </div>
        </div>

        {/* Total Cash In */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between hover:border-emerald-500 transition">
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Total Cash In</div>
            <div className="text-2xl font-black text-emerald-600 font-mono">
              Rs {balanceInfo.totalIn.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-400 font-semibold mt-1">Sales & Cash Inflow Receipts</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
            <ArrowDownLeft className="w-6 h-6 stroke-[2.5]" />
          </div>
        </div>

        {/* Total Cash Out */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between hover:border-rose-500 transition">
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Total Cash Out</div>
            <div className="text-2xl font-black text-rose-600 font-mono">
              Rs {balanceInfo.totalOut.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-400 font-semibold mt-1">Expenses & Vendor Payments</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
            <ArrowUpRight className="w-6 h-6 stroke-[2.5]" />
          </div>
        </div>

        {/* Net Movement */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between hover:border-sky-500 transition">
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Net Cash Movement</div>
            <div className={`text-2xl font-black font-mono ${netMovement >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
              Rs {netMovement.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-400 font-semibold mt-1">Net Liquidity Inflow/Outflow</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 shrink-0">
            <TrendingUp className="w-6 h-6 stroke-[2.5]" />
          </div>
        </div>
      </div>

      {/* Main Content Area: Search, Filters & Transactions Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col overflow-hidden flex-1">
        {/* Filter Controls */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search reference, description, source..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
            <select
              value={filterSource}
              onChange={e => setFilterSource(e.target.value)}
              className="bg-white border border-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl outline-none cursor-pointer hover:border-slate-300 transition"
            >
              <option value="ALL">All Source Types</option>
              <option value="POS_SALE">POS Sale</option>
              <option value="PAYMENT_IN">Payment In</option>
              <option value="PURCHASE_BILL">Purchase Bill</option>
              <option value="EXPENSE">Expense</option>
              <option value="BANK_DEPOSIT">Bank Deposit</option>
              <option value="BANK_WITHDRAWAL">Bank Withdrawal</option>
              <option value="MANUAL_ADJUSTMENT">Manual Adjustment</option>
            </select>

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
          {loading ? (
            <div className="py-20 text-center text-xs font-bold text-slate-400">Loading Cash In Hand transactions...</div>
          ) : transactions.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center p-6">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-3">
                <Banknote className="w-8 h-8 stroke-[1.75]" />
              </div>
              <h3 className="text-base font-extrabold text-slate-800">No Cash In Hand Transactions Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Record manual cash entries or make cash POS sales to automatically update your register ledger.
              </p>
              <div className="flex items-center gap-3 mt-5">
                <button
                  type="button"
                  onClick={() => { setEntryType('IN'); setIsAddModalOpen(true); }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  + Add Cash In
                </button>
                <button
                  type="button"
                  onClick={() => { setEntryType('OUT'); setIsAddModalOpen(true); }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  + Add Cash Out
                </button>
              </div>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                  <th className="p-3 pl-4">Date & Time</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Source Category</th>
                  <th className="p-3">Reference ID</th>
                  <th className="p-3">Description</th>
                  <th className="p-3 text-right">Amount (Rs)</th>
                  <th className="p-3 text-right pr-4">Running Cash Balance (Rs)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((txn, idx) => {
                  const dateStr = txn.transactionDate ? new Date(txn.transactionDate).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
                  return (
                    <tr key={txn.id || idx} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 pl-4 font-mono text-slate-600 whitespace-nowrap">{dateStr}</td>
                      <td className="p-3 font-semibold whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                          txn.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {txn.type === 'IN' ? '▲ CASH IN' : '▼ CASH OUT'}
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap">{getSourceBadge(txn.source)}</td>
                      <td className="p-3 font-mono font-bold text-slate-700 whitespace-nowrap">{txn.referenceId || '-'}</td>
                      <td className="p-3 text-slate-700 max-w-xs truncate">{txn.description || '-'}</td>
                      <td className={`p-3 text-right font-mono font-bold whitespace-nowrap ${
                        txn.type === 'IN' ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {txn.type === 'IN' ? '+' : '-'}Rs {Number(txn.amount || 0).toFixed(2)}
                      </td>
                      <td className="p-3 text-right pr-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                        Rs {Number(txn.runningBalance || 0).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* MODAL 1: ADD CASH IN / OUT ENTRY */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-emerald-600" />
                <span>Record Manual Cash Entry</span>
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEntry} className="p-5 space-y-4 text-xs">
              {/* Type Switcher */}
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setEntryType('IN')}
                  className={`py-2 rounded-lg font-extrabold text-xs transition ${
                    entryType === 'IN' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  + Cash In (+ Inflow)
                </button>
                <button
                  type="button"
                  onClick={() => setEntryType('OUT')}
                  className={`py-2 rounded-lg font-extrabold text-xs transition ${
                    entryType === 'OUT' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  - Cash Out (- Outflow)
                </button>
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Amount (Rs) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={entryAmount}
                  onChange={e => setEntryAmount(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Category / Source</label>
                <select
                  value={entrySource}
                  onChange={e => setEntrySource(e.target.value as any)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition"
                >
                  <option value="MANUAL_ADJUSTMENT">Manual Cash Adjustment</option>
                  <option value="POS_SALE">POS / Counter Direct Sale</option>
                  <option value="PAYMENT_IN">Payment Received from Customer</option>
                  <option value="PURCHASE_BILL">Purchase Bill Payment</option>
                  <option value="EXPENSE">Counter Overhead Expense</option>
                  <option value="PAYMENT_OUT">Payment Out to Vendor</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Date</label>
                <input
                  type="date"
                  value={entryDate}
                  onChange={e => setEntryDate(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Description / Note</label>
                <textarea
                  rows={2}
                  placeholder="Reason or reference details..."
                  value={entryDesc}
                  onChange={e => setEntryDesc(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 rounded-xl text-white font-bold transition ${
                    entryType === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  Save Cash Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: BANK TRANSFER */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-sky-600" />
                <span>Bank & Cash Transfer</span>
              </h3>
              <button onClick={() => setIsTransferModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTransfer} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setTransferMode('TO_BANK')}
                  className={`py-2 rounded-lg font-extrabold text-xs transition ${
                    transferMode === 'TO_BANK' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cash Deposit (To Bank)
                </button>
                <button
                  type="button"
                  onClick={() => setTransferMode('FROM_BANK')}
                  className={`py-2 rounded-lg font-extrabold text-xs transition ${
                    transferMode === 'FROM_BANK' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cash Withdrawal (From Bank)
                </button>
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Transfer Amount (Rs) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={transferAmount}
                  onChange={e => setTransferAmount(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold text-slate-800 outline-none focus:border-sky-500 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Date</label>
                <input
                  type="date"
                  value={transferDate}
                  onChange={e => setTransferDate(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 outline-none focus:border-sky-500 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Transfer Description / Bank Reference</label>
                <textarea
                  rows={2}
                  placeholder="Bank deposit receipt # or check details..."
                  value={transferDesc}
                  onChange={e => setTransferDesc(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 outline-none focus:border-sky-500 focus:bg-white transition"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold transition"
                >
                  Confirm Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: PHYSICAL CASH RECONCILIATION */}
      {isAdjustModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-slate-700" />
                <span>Physical Cash Reconciliation</span>
              </h3>
              <button onClick={() => setIsAdjustModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment} className="p-5 space-y-4 text-xs">
              <div className="bg-slate-100 p-3 rounded-xl flex items-center justify-between">
                <span className="text-slate-600 font-bold">System Calculated Balance:</span>
                <span className="font-mono font-black text-slate-900 text-sm">
                  Rs {balanceInfo.currentBalance.toFixed(2)}
                </span>
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Physical Cash Count in Register (Rs) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={physicalCount}
                  onChange={e => setPhysicalCount(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold text-slate-800 outline-none focus:border-slate-800 focus:bg-white transition"
                />
              </div>

              {/* Calculated Discrepancy Display */}
              {physicalCount && !isNaN(parseFloat(physicalCount)) && (
                <div className={`p-3 rounded-xl font-bold flex items-center justify-between ${
                  parseFloat(physicalCount) - balanceInfo.currentBalance >= 0
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                  <span>Calculated Discrepancy:</span>
                  <span className="font-mono font-black text-sm">
                    {parseFloat(physicalCount) - balanceInfo.currentBalance >= 0 ? '+' : ''}
                    Rs {(parseFloat(physicalCount) - balanceInfo.currentBalance).toFixed(2)}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-slate-600 font-bold mb-1">Reconciliation Reason / Note</label>
                <textarea
                  rows={2}
                  placeholder="Reason for discrepancy or physical count note..."
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 outline-none focus:border-slate-800 focus:bg-white transition"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white font-bold transition"
                >
                  Save Reconciliation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
