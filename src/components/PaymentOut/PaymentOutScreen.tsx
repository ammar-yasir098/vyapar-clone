import React, { useState, useEffect } from 'react';
import { 
  ArrowUpRight, 
  Plus, 
  Search, 
  Printer, 
  Trash2, 
  Users, 
  CheckCircle2, 
  X, 
  Wallet,
  Receipt,
  Phone,
  CreditCard,
  Building2
} from 'lucide-react';
import { PaymentOut, Party, PurchaseBill, BusinessDetails } from '../../types';
import { db } from '../../db';
import { createServerPaymentOut, deleteServerPaymentOut } from '../../services/api';
import { syncManager } from '../../services/sync';
import { recordCashEntry } from '../../services/cash';
import { useToast } from '../Common/ToastContext';

interface PaymentOutScreenProps {
  payments: PaymentOut[];
  parties: Party[];
  purchaseBills: PurchaseBill[];
  business: BusinessDetails;
  onPaymentRecorded: () => void;
  selectedPartyFromParties?: Party | null;
  onClearSelectedParty?: () => void;
}

export const PaymentOutScreen: React.FC<PaymentOutScreenProps> = ({
  payments,
  parties,
  purchaseBills,
  business,
  onPaymentRecorded,
  selectedPartyFromParties,
  onClearSelectedParty
}) => {
  const activeTenantId = business.tenantId || 'default-tenant';
  const { showToast, showConfirm } = useToast();

  const [activeSubTab, setActiveSubTab] = useState<'pending' | 'history'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [selectedPaymentForReceipt, setSelectedPaymentForReceipt] = useState<PaymentOut | null>(null);

  // Form State for Recording Payment-Out
  const [selectedParty, setSelectedParty] = useState<Party | null>(
    parties.find(p => p.type === 'SUPPLIER' || p.type === 'BOTH') || parties[0] || null
  );
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'DIGITAL / APP' | 'CARD' | 'CHEQUE'>('CASH');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Auto-open modal if triggered from Parties screen
  useEffect(() => {
    if (selectedPartyFromParties) {
      setSelectedParty(selectedPartyFromParties);
      const bal = Number(selectedPartyFromParties.currentBalance !== undefined ? selectedPartyFromParties.currentBalance : selectedPartyFromParties.openingBalance) || 0;
      setAmount(bal > 0 ? bal : 0);
      setIsRecordModalOpen(true);
      if (onClearSelectedParty) onClearSelectedParty();
    }
  }, [selectedPartyFromParties]);

  // Safe Number helper
  const getPartyDueBalance = (party: Party): number => {
    return Number(party.currentBalance !== undefined ? party.currentBalance : party.openingBalance) || 0;
  };

  // Suppliers list with dues
  const suppliersList = parties.filter(p => p.type === 'SUPPLIER' || p.type === 'BOTH');
  const suppliersWithDues = suppliersList.filter(p => getPartyDueBalance(p) > 0);

  // Filtered lists based on search term
  const filteredSuppliersWithDues = suppliersWithDues.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.phone?.includes(searchTerm)
  );

  const filteredHistoryPayments = payments.filter(p =>
    p.partyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.receiptNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalOutstandingPayable = suppliersWithDues.reduce((sum, p) => sum + getPartyDueBalance(p), 0);
  const totalPaidOutHistory = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  // Handle Save Payment-Out
  const handleSavePaymentOut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParty) {
      alert('Please select a supplier!');
      return;
    }
    if (!amount || amount <= 0) {
      alert('Please enter a valid payment amount!');
      return;
    }

    setIsSaving(true);
    try {
      const receiptNumber = `PAYOUT-${Date.now().toString().slice(-6)}`;

      const newPayment: PaymentOut = {
        receiptNumber,
        tenantId: activeTenantId,
        partyId: selectedParty.id,
        partyName: selectedParty.name,
        partyPhone: selectedParty.phone || '',
        paymentDate,
        paymentMethod,
        amount,
        notes,
        createdAt: new Date().toISOString()
      };

      // 1. Add to local Dexie IndexedDB
      const payId = await db.paymentOut.add(newPayment);

      // Record Cash Outflow if paymentMethod is CASH
      if (paymentMethod === 'CASH' && amount > 0) {
        await recordCashEntry({
          tenantId: activeTenantId,
          type: 'OUT',
          amount,
          source: 'PAYMENT_OUT',
          referenceId: receiptNumber,
          description: `Payment-Out paid to ${selectedParty.name}: ${notes || 'Cash Voucher'}`,
          transactionDate: paymentDate
        });
      }

      // 2. Reduce Supplier Payable Balance in parties table (supplier.currentBalance -= amount)
      const currentBal = getPartyDueBalance(selectedParty);
      const newBal = Math.max(0, currentBal - amount);

      if (selectedParty.id) {
        await db.parties.update(selectedParty.id, { currentBalance: newBal });
        await syncManager.logMutation('PARTY', String(selectedParty.id), 'UPDATE', { id: selectedParty.id, currentBalance: newBal });
      }

      // 3. Update Ledger Accounts (Accounts Payable credit balance reduced, Cash/Bank reduced)
      const accounts = await db.ledgerAccounts.filter(a => (a.tenantId || 'default-tenant') === activeTenantId).toArray();
      const apAccount = accounts.find(a => a.accountCode === '2010') || accounts[0];
      const cashAccount = accounts.find(a => a.accountCode === (paymentMethod === 'CASH' ? '1010' : '1020')) || accounts[0];

      if (apAccount && apAccount.id) {
        const newApBal = Math.max(0, (apAccount.balance || 0) - amount);
        await db.ledgerAccounts.update(apAccount.id, { balance: newApBal });
      }

      if (cashAccount && cashAccount.id) {
        const newCashBal = (cashAccount.balance || 0) - amount;
        await db.ledgerAccounts.update(cashAccount.id, { balance: newCashBal });
      }

      // 4. Post Journal Entry
      const entryNumber = `JE-PAYOUT-${Date.now().toString().slice(-4)}`;
      const journalEntry = {
        tenantId: activeTenantId,
        entryNumber,
        referenceId: receiptNumber,
        transactionDate: paymentDate,
        description: `Payment-Out voucher ${receiptNumber} paid to ${selectedParty.name} via ${paymentMethod}`,
        lines: [
          { accountId: apAccount?.id || 1, accountCode: apAccount?.accountCode || '2010', accountName: `Accounts Payable (${selectedParty.name})`, debit: amount, credit: 0 },
          { accountId: cashAccount?.id || 2, accountCode: cashAccount?.accountCode || '1010', accountName: cashAccount?.accountName || 'Cash in Hand', debit: 0, credit: amount }
        ],
        totalDebit: amount,
        totalCredit: amount,
        createdAt: new Date().toISOString()
      };

      const jeId = await db.journalEntries.add(journalEntry);
      await syncManager.logMutation('JOURNAL', entryNumber, 'INSERT', { ...journalEntry, id: jeId });

      // 5. Send to Cloud PostgreSQL server API
      try {
        await createServerPaymentOut(newPayment);
      } catch (err) {
        console.warn('Failed to sync Payment-Out to cloud server:', err);
      }

      showToast(`Payment-Out of Rs ${amount.toLocaleString()} paid to ${selectedParty.name}! Supplier payable reduced.`, 'success');
      setIsRecordModalOpen(false);
      setAmount(0);
      setNotes('');
      onPaymentRecorded();
    } catch (err: any) {
      console.error('Error saving Payment-Out:', err);
      alert(`Error saving Payment-Out: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Payment Voucher
  const handleDeletePayment = async (payment: PaymentOut) => {
    if (!payment.id) return;
    showConfirm({
      title: 'Delete Payment Voucher',
      message: `Are you sure you want to delete Payment-Out voucher ${payment.receiptNumber}?`,
      type: 'danger',
      confirmText: 'Yes, Delete',
      onConfirm: async () => {
        await db.paymentOut.delete(payment.id!);
        try {
          if (payment.id) await deleteServerPaymentOut(payment.id);
        } catch {}
        showToast('Payment voucher deleted', 'info');
        onPaymentRecorded();
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
              <div className="p-2 bg-rose-100 rounded-xl text-rose-700">
                <ArrowUpRight className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Payment-Out (Supplier Payments)</h1>
                <p className="text-xs text-slate-500 font-medium">Record outgoing payments to suppliers to clear payables or give advances</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (suppliersList.length > 0) {
                  setSelectedParty(suppliersList[0]);
                  setAmount(getPartyDueBalance(suppliersList[0]));
                }
                setIsRecordModalOpen(true);
              }}
              className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-md transition cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Record Payment-Out</span>
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Outstanding Payables</div>
              <div className="text-2xl font-black text-rose-600 mt-1">
                Rs. {totalOutstandingPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              Rs
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Suppliers With Dues</div>
              <div className="text-2xl font-black text-amber-600 mt-1">{suppliersWithDues.length}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Paid Out History</div>
              <div className="text-2xl font-black text-slate-800 mt-1">
                Rs. {totalPaidOutHistory.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Sub Navigation & Search Bar */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
            <button
              onClick={() => setActiveSubTab('pending')}
              className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeSubTab === 'pending'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pending Payables ({suppliersWithDues.length})
            </button>
            <button
              onClick={() => setActiveSubTab('history')}
              className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeSubTab === 'history'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Payment-Out History ({payments.length})
            </button>
          </div>

          <div className="relative flex-1 w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder={activeSubTab === 'pending' ? 'Search supplier name or phone...' : 'Search voucher # or supplier...'}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
        </div>

        {/* SUB TAB 1: PENDING PAYABLES TABLE */}
        {activeSubTab === 'pending' && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {filteredSuppliersWithDues.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
                <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 mb-1">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div className="text-sm font-bold text-slate-700">No Pending Supplier Dues!</div>
                <p className="text-xs text-slate-400 max-w-sm">
                  All supplier accounts are clear and settled.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Supplier Name</th>
                      <th className="py-3 px-4">Phone Number</th>
                      <th className="py-3 px-4 text-right">Outstanding Payable</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                    {filteredSuppliersWithDues.map(supplier => {
                      const due = getPartyDueBalance(supplier);
                      return (
                        <tr key={supplier.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3.5 px-4 font-bold text-slate-900">
                            {supplier.name}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 font-mono">
                            {supplier.phone || '-'}
                          </td>
                          <td className="py-3.5 px-4 text-right font-black text-rose-600 text-sm">
                            Rs. {due.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-rose-100 text-rose-800">
                              TO PAY
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => {
                                setSelectedParty(supplier);
                                setAmount(due);
                                setIsRecordModalOpen(true);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                            >
                              Record Payment-Out
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SUB TAB 2: PAYMENT-OUT HISTORY TABLE */}
        {activeSubTab === 'history' && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {filteredHistoryPayments.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-1">
                  <Receipt className="w-8 h-8" />
                </div>
                <div className="text-sm font-bold text-slate-700">No Payment-Out History Found</div>
                <p className="text-xs text-slate-400 max-w-sm">
                  Recorded payments to suppliers will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Voucher #</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Supplier</th>
                      <th className="py-3 px-4">Payment Method</th>
                      <th className="py-3 px-4 text-right">Amount Paid</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                    {filteredHistoryPayments.map(p => (
                      <tr key={p.id || p.receiptNumber} className="hover:bg-slate-50/80 transition">
                        <td className="py-3.5 px-4 font-bold text-slate-900 font-mono">
                          {p.receiptNumber}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 font-mono">
                          {p.paymentDate}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-800">
                          {p.partyName}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 text-slate-800 border border-slate-200">
                            {p.paymentMethod}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-black text-slate-900">
                          Rs. {(p.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedPaymentForReceipt(p)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                              title="Print Payment Voucher"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeletePayment(p)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                              title="Delete Payment Voucher"
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
        )}
      </div>

      {/* RECORD PAYMENT-OUT MODAL */}
      {isRecordModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-rose-400" />
                <span className="font-bold text-sm">Record Payment-Out to Supplier</span>
              </div>
              <button
                onClick={() => setIsRecordModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePaymentOut} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Select Supplier *</label>
                <select
                  value={selectedParty?.id || ''}
                  onChange={e => {
                    const found = suppliersList.find(p => p.id === Number(e.target.value));
                    if (found) {
                      setSelectedParty(found);
                      setAmount(getPartyDueBalance(found));
                    }
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  {suppliersList.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Due: Rs. {getPartyDueBalance(s).toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              {selectedParty && (
                <div className="bg-rose-50 border border-rose-200 p-3 rounded-2xl flex items-center justify-between text-xs font-mono">
                  <span className="text-rose-800 font-bold">Current Total Payable:</span>
                  <span className="text-rose-700 font-black text-sm">
                    Rs. {getPartyDueBalance(selectedParty).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Payment Amount (Rs) *</label>
                <input
                  type="number"
                  step="any"
                  min="1"
                  required
                  value={amount || ''}
                  onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="CASH">Cash in Hand</option>
                    <option value="DIGITAL / APP">Digital / Bank / UPI</option>
                    <option value="CARD">Debit / Credit Card</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Payment Date</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Payment Notes / Remarks</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add transaction reference or settlement details..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
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
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? 'Recording...' : 'CONFIRM PAYMENT-OUT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINT PAYMENT VOUCHER RECEIPT MODAL */}
      {selectedPaymentForReceipt && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white px-6 py-3.5 flex items-center justify-between">
              <span className="font-bold text-sm flex items-center gap-2">
                <Printer className="w-4 h-4 text-rose-400" />
                <span>Print Payment-Out Voucher</span>
              </span>
              <button onClick={() => setSelectedPaymentForReceipt(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[80vh]">
              <div id="payment-out-print-area" className="bg-white p-8 font-sans text-slate-900 border border-slate-300 rounded-xl shadow-xs space-y-6">
                <div className="flex justify-between items-start border-b border-slate-300 pb-6">
                  <div className="space-y-1">
                    <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{business.name || 'Company Name'}</h1>
                    <p className="text-xs text-slate-600 font-medium">{business.address || 'Store Address'}</p>
                    <p className="text-xs text-slate-600">Phone: {business.phone || '+92 300 0000000'}</p>
                  </div>

                  <div className="flex flex-col items-end space-y-2">
                    <h2 className="text-2xl font-black text-rose-700 uppercase tracking-wider">PAYMENT VOUCHER</h2>
                    <div className="text-xs font-mono font-bold text-slate-700">Voucher #: {selectedPaymentForReceipt.receiptNumber}</div>
                    <div className="text-xs font-mono text-slate-500">Date: {selectedPaymentForReceipt.paymentDate}</div>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">Paid To (Supplier):</span>
                    <span className="font-bold text-slate-900">{selectedPaymentForReceipt.partyName}</span>
                  </div>
                  {selectedPaymentForReceipt.partyPhone && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-bold">Contact Phone:</span>
                      <span className="font-mono text-slate-800">{selectedPaymentForReceipt.partyPhone}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">Payment Method:</span>
                    <span className="font-bold text-slate-900">{selectedPaymentForReceipt.paymentMethod}</span>
                  </div>
                </div>

                <div className="bg-rose-50 border border-rose-300 p-4 rounded-xl flex justify-between items-center text-sm font-mono">
                  <span className="font-black text-rose-900 uppercase">AMOUNT PAID:</span>
                  <span className="font-black text-rose-700 text-lg">Rs. {(selectedPaymentForReceipt.amount || 0).toFixed(2)}</span>
                </div>

                {selectedPaymentForReceipt.notes && (
                  <div className="text-xs text-slate-600 italic">
                    <span className="font-bold not-italic">Notes: </span>{selectedPaymentForReceipt.notes}
                  </div>
                )}

                <div className="border-t border-slate-300 pt-6 flex justify-between items-center text-xs text-slate-500">
                  <div>Authorised Signatory</div>
                  <div>Supplier Signature</div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setSelectedPaymentForReceipt(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-1.5 cursor-pointer"
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
