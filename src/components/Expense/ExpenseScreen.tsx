import React, { useState } from 'react';
import { 
  Receipt, 
  Plus, 
  Search, 
  Printer, 
  Trash2, 
  DollarSign, 
  X, 
  Wallet,
  Tag,
  TrendingDown,
  Calendar
} from 'lucide-react';
import { Expense, BusinessDetails } from '../../types';
import { db } from '../../db';
import { createServerExpense, deleteServerExpense } from '../../services/api';
import { syncManager } from '../../services/sync';
import { recordCashEntry } from '../../services/cash';
import { useToast } from '../Common/ToastContext';

interface ExpenseScreenProps {
  expenses: Expense[];
  business: BusinessDetails;
  onExpenseRecorded: () => void;
}

const DEFAULT_CATEGORIES = [
  'Rent',
  'Electricity & Utilities',
  'Tea & Refreshment',
  'Delivery & Logistics',
  'Salaries & Wages',
  'Marketing & Ads',
  'Repair & Maintenance',
  'Miscellaneous'
];

export const ExpenseScreen: React.FC<ExpenseScreenProps> = ({
  expenses,
  business,
  onExpenseRecorded
}) => {
  const activeTenantId = business?.tenantId || localStorage.getItem('vyapar_current_tenant') || 'default-tenant';
  const { showToast, showConfirm } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [selectedExpenseForPrint, setSelectedExpenseForPrint] = useState<Expense | null>(null);

  // Form State for Recording Expense
  const [categoryName, setCategoryName] = useState<string>('Rent');
  const [customCategory, setCustomCategory] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'DIGITAL / APP' | 'CARD' | 'CHEQUE'>('CASH');
  const [expenseDate, setExpenseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Search Filter
  const filteredExpenses = expenses.filter(e =>
    e.categoryName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.expenseNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (e.notes || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalExpenseAmount = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  // Find top category
  const categoryTotals: Record<string, number> = {};
  expenses.forEach(e => {
    categoryTotals[e.categoryName] = (categoryTotals[e.categoryName] || 0) + e.amount;
  });
  let topCategory = 'None';
  let topCategoryAmount = 0;
  Object.entries(categoryTotals).forEach(([cat, val]) => {
    if (val > topCategoryAmount) {
      topCategoryAmount = val;
      topCategory = cat;
    }
  });

  // Handle Save Expense
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalCategory = categoryName === 'CUSTOM' ? customCategory.trim() : categoryName;

    if (!finalCategory) {
      alert('Please enter or select an expense category!');
      return;
    }
    if (!amount || amount <= 0) {
      alert('Please enter a valid expense amount!');
      return;
    }

    setIsSaving(true);
    try {
      const expenseNumber = `EXP-${Date.now().toString().slice(-6)}`;

      const newExpense: Expense = {
        expenseNumber,
        tenantId: activeTenantId,
        categoryName: finalCategory,
        expenseDate,
        paymentMode,
        amount,
        notes,
        createdAt: new Date().toISOString()
      };

      // 1. Add to local Dexie IndexedDB v11
      const expId = await db.expenses.add(newExpense);

      // Record Cash Outflow if paymentMode is CASH
      if (paymentMode === 'CASH' && amount > 0) {
        await recordCashEntry({
          tenantId: activeTenantId,
          type: 'OUT',
          amount,
          source: 'EXPENSE',
          referenceId: expenseNumber,
          description: `Counter Expense (${finalCategory}): ${notes || expenseNumber}`,
          transactionDate: expenseDate
        });
      }

      // 2. Send to Cloud PostgreSQL server API
      try {
        await createServerExpense(newExpense);
      } catch (err) {
        console.warn('Failed to sync Expense to cloud server:', err);
      }

      showToast(`Expense of Rs ${amount.toLocaleString()} for ${finalCategory} recorded successfully!`, 'success');
      setIsRecordModalOpen(false);
      setAmount(0);
      setNotes('');
      setCustomCategory('');
      onExpenseRecorded();
    } catch (err: any) {
      console.error('Error saving expense:', err);
      alert(`Error saving expense: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Expense Record
  const handleDeleteExpense = async (exp: Expense) => {
    if (!exp.id) return;
    showConfirm({
      title: 'Delete Expense Record',
      message: `Are you sure you want to delete Expense voucher ${exp.expenseNumber}? This will remove associated cash outflow records and journal entries.`,
      type: 'danger',
      confirmText: 'Yes, Delete',
      onConfirm: async () => {
        const { voidExpense } = await import('../../services/reversal');
        const res = await voidExpense(exp.id!);
        try {
          if (exp.id) await deleteServerExpense(exp.id);
        } catch {}
        if (res.success) {
          showToast(res.message || 'Expense voucher deleted', 'info');
        } else {
          showToast(res.error || 'Failed to void expense voucher', 'error');
        }
        onExpenseRecorded();
      }
    });
  };

  return (
    <div className="flex-1 bg-[#f0f4f8] p-6 overflow-y-auto flex flex-col justify-between select-none">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-amber-100 rounded-xl text-amber-700">
                <Receipt className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Operational Expenses</h1>
                <p className="text-xs text-slate-500 font-medium">Track shop rent, electricity, tea/refreshment, delivery charges & operational costs</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setCategoryName('Rent');
                setAmount(0);
                setIsRecordModalOpen(true);
              }}
              className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-md transition cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Record Expense</span>
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Expenses</div>
              <div className="text-2xl font-black text-amber-600 mt-1">
                Rs. {totalExpenseAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              Rs
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Expense Vouchers</div>
              <div className="text-2xl font-black text-slate-800 mt-1">{expenses.length}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Receipt className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Top Expense Category</div>
              <div className="text-lg font-black text-slate-800 mt-1 truncate max-w-[180px]">{topCategory}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Tag className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by category, voucher # or notes..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div className="text-xs font-semibold text-slate-500 shrink-0">
            Showing <span className="text-slate-900 font-bold">{filteredExpenses.length}</span> voucher(s)
          </div>
        </div>

        {/* Expenses Table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {filteredExpenses.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 mb-1">
                <Receipt className="w-8 h-8" />
              </div>
              <div className="text-sm font-bold text-slate-700">No Expenses Recorded Yet</div>
              <p className="text-xs text-slate-400 max-w-sm">
                Track operational kharche such as shop rent, electricity, tea/refreshments, and delivery charges.
              </p>
              <button
                onClick={() => setIsRecordModalOpen(true)}
                className="mt-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm cursor-pointer"
              >
                Record Expense
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Voucher #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Payment Mode</th>
                    <th className="py-3 px-4">Notes / Remarks</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredExpenses.map(exp => (
                    <tr key={exp.id || exp.expenseNumber} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4 font-bold text-slate-900 font-mono">
                        {exp.expenseNumber}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-mono">
                        {exp.expenseDate}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                          {exp.categoryName}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-700">
                        {exp.paymentMode}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 max-w-xs truncate">
                        {exp.notes || '-'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-rose-600">
                        Rs. {(exp.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedExpenseForPrint(exp)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition cursor-pointer"
                            title="Print Expense Voucher"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteExpense(exp)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                            title="Delete Expense Record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* RECORD EXPENSE MODAL */}
      {isRecordModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-amber-400" />
                <span className="font-bold text-sm">Record Operational Expense</span>
              </div>
              <button
                onClick={() => setIsRecordModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Expense Category *</label>
                <select
                  value={categoryName}
                  onChange={e => setCategoryName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {DEFAULT_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value="CUSTOM">+ Add Custom Category...</option>
                </select>
              </div>

              {categoryName === 'CUSTOM' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Enter Custom Category Name *</label>
                  <input
                    type="text"
                    required
                    value={customCategory}
                    onChange={e => setCustomCategory(e.target.value)}
                    placeholder="e.g. Generator Fuel, Stationary, Cleaning"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Expense Amount (Rs) *</label>
                <input
                  type="number"
                  step="any"
                  min="1"
                  required
                  value={amount || ''}
                  onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Payment Mode</label>
                  <select
                    value={paymentMode}
                    onChange={e => setPaymentMode(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="CASH">Cash in Hand</option>
                    <option value="DIGITAL / APP">Digital / Bank / UPI</option>
                    <option value="CARD">Debit / Credit Card</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Expense Date</label>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={e => setExpenseDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Description / Remarks</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add details (e.g. Monthly shop rent for August)..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRecordModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !amount || amount <= 0}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? 'Saving...' : 'RECORD EXPENSE'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINT EXPENSE VOUCHER RECEIPT MODAL */}
      {selectedExpenseForPrint && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white px-6 py-3.5 flex items-center justify-between">
              <span className="font-bold text-sm flex items-center gap-2">
                <Printer className="w-4 h-4 text-amber-400" />
                <span>Print Expense Voucher</span>
              </span>
              <button onClick={() => setSelectedExpenseForPrint(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[80vh]">
              <div id="expense-print-area" className="bg-white p-8 font-sans text-slate-900 border border-slate-300 rounded-xl shadow-xs space-y-6">
                <div className="flex justify-between items-start border-b border-slate-300 pb-6">
                  <div className="space-y-1">
                    <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{business.name || 'Company Name'}</h1>
                    <p className="text-xs text-slate-600 font-medium">{business.address || 'Store Address'}</p>
                    <p className="text-xs text-slate-600">Phone: {business.phone || '+92 300 0000000'}</p>
                  </div>

                  <div className="flex flex-col items-end space-y-2">
                    <h2 className="text-2xl font-black text-amber-700 uppercase tracking-wider">EXPENSE VOUCHER</h2>
                    <div className="text-xs font-mono font-bold text-slate-700">Voucher #: {selectedExpenseForPrint.expenseNumber}</div>
                    <div className="text-xs font-mono text-slate-500">Date: {selectedExpenseForPrint.expenseDate}</div>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">Expense Category:</span>
                    <span className="font-bold text-slate-900">{selectedExpenseForPrint.categoryName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">Payment Mode:</span>
                    <span className="font-bold text-slate-900">{selectedExpenseForPrint.paymentMode}</span>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-300 p-4 rounded-xl flex justify-between items-center text-sm font-mono">
                  <span className="font-black text-amber-900 uppercase">EXPENSE AMOUNT:</span>
                  <span className="font-black text-rose-700 text-lg">Rs. {(selectedExpenseForPrint.amount || 0).toFixed(2)}</span>
                </div>

                {selectedExpenseForPrint.notes && (
                  <div className="text-xs text-slate-600 italic">
                    <span className="font-bold not-italic">Notes / Description: </span>{selectedExpenseForPrint.notes}
                  </div>
                )}

                <div className="border-t border-slate-300 pt-6 flex justify-between items-center text-xs text-slate-500">
                  <div>Prepared By</div>
                  <div>Approved By</div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setSelectedExpenseForPrint(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Voucher</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
