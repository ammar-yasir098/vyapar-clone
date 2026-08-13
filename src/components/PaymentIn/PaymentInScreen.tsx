import React, { useState } from 'react';
import { 
  ArrowDownLeft, 
  Plus, 
  Search, 
  Printer, 
  Trash2, 
  Eye, 
  Calendar, 
  User, 
  CheckCircle2, 
  Clock, 
  X, 
  CreditCard,
  Building2,
  DollarSign,
  Wallet,
  FileText
} from 'lucide-react';
import { PaymentIn, Party, Invoice, BusinessDetails } from '../../types';
import { db } from '../../db';
import { createServerPaymentIn, recordServerPartyPayment } from '../../services/api';
import { syncManager } from '../../services/sync';
import { postPaymentJournalEntry, syncLedgerAccountBalances } from '../../services/ledger';

interface PaymentInScreenProps {
  payments: PaymentIn[];
  parties: Party[];
  invoices: Invoice[];
  business: BusinessDetails;
  onPaymentRecorded: () => void;
}

export const PaymentInScreen: React.FC<PaymentInScreenProps> = ({
  payments,
  parties,
  invoices,
  business,
  onPaymentRecorded
}) => {
  const activeTenantId = business.tenantId || 'default-tenant';

  const [searchTerm, setSearchTerm] = useState('');
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [selectedPaymentForReceipt, setSelectedPaymentForReceipt] = useState<PaymentIn | null>(null);

  // Form State for Recording Payment-In
  const [selectedParty, setSelectedParty] = useState<Party | null>(
    parties.find(p => p.type === 'CUSTOMER') || parties[0] || null
  );
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'DIGITAL / APP' | 'CARD' | 'CHEQUE'>('CASH');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Filtered Payments List
  const filteredPayments = payments.filter(p =>
    p.receiptNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.partyName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const customersList = parties.filter(p => p.type === 'CUSTOMER');

  // Submit Handler for Recording Payment-In
  const handleSavePaymentIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParty || amount <= 0) {
      alert('Please select a customer and enter a valid payment amount');
      return;
    }

    setIsSaving(true);

    try {
      const party = selectedParty;
      const curBal = Number(party.currentBalance !== undefined ? party.currentBalance : party.openingBalance) || 0;
      const newBal = Math.max(0, curBal - amount);

      const receiptNum = `PAYIN-${Date.now().toString().slice(-6)}`;

      const newPayment: PaymentIn = {
        receiptNumber: receiptNum,
        tenantId: activeTenantId,
        partyId: party.id,
        partyName: party.name,
        partyPhone: party.phone || '',
        paymentDate,
        paymentMethod,
        amount,
        notes,
        createdAt: new Date().toISOString()
      };

      // 1. Save to local Dexie IndexedDB (paymentIn table)
      const savedId = await db.paymentIn.add(newPayment);

      // 2. Update Customer Balance in Dexie & Server
      if (party.id) {
        await db.parties.update(party.id, { currentBalance: newBal });
        await syncManager.logMutation('PARTY', String(party.id), 'UPDATE', { id: party.id, currentBalance: newBal });
        await recordServerPartyPayment(party.id, amount, notes || 'Payment-In received', party.type, party.name);
      }

      // 3. Automatically apply payment towards unpaid invoices for this party (oldest first)
      const allInvoices = await db.invoices.toArray();
      const partyInvoices = allInvoices.filter(inv =>
        (party.id !== undefined && inv.partyId === party.id) ||
        (inv.partyName && inv.partyName.trim().toLowerCase() === party.name.trim().toLowerCase())
      );

      const unpaidInvoices = partyInvoices
        .filter(inv => inv.paymentStatus !== 'PAID' || (inv.dueAmount !== undefined && inv.dueAmount > 0))
        .sort((a, b) => new Date(a.invoiceDate || 0).getTime() - new Date(b.invoiceDate || 0).getTime());

      let remainingPay = amount;

      for (const inv of unpaidInvoices) {
        if (remainingPay <= 0) break;

        const currentDue = inv.dueAmount !== undefined && inv.dueAmount > 0
          ? inv.dueAmount
          : Math.max(0, (inv.grandTotal || 0) - (inv.receivedAmount || 0));

        if (remainingPay >= currentDue) {
          remainingPay -= currentDue;
          const updatedInv = {
            ...inv,
            receivedAmount: inv.grandTotal,
            dueAmount: 0,
            paymentStatus: 'PAID' as const
          };

          if (inv.id) {
            await db.invoices.update(inv.id, {
              receivedAmount: inv.grandTotal,
              dueAmount: 0,
              paymentStatus: 'PAID'
            });
            await syncManager.logMutation('INVOICE', inv.invoiceId, 'UPDATE', updatedInv);
          }
        } else {
          const newReceived = (inv.receivedAmount || 0) + remainingPay;
          const newDue = Math.max(0, currentDue - remainingPay);
          remainingPay = 0;

          const updatedInv = {
            ...inv,
            receivedAmount: newReceived,
            dueAmount: newDue,
            paymentStatus: newDue === 0 ? ('PAID' as const) : ('PARTIAL' as const)
          };

          if (inv.id) {
            await db.invoices.update(inv.id, {
              receivedAmount: newReceived,
              dueAmount: newDue,
              paymentStatus: newDue === 0 ? 'PAID' : 'PARTIAL'
            });
            await syncManager.logMutation('INVOICE', inv.invoiceId, 'UPDATE', updatedInv);
          }
        }
      }

      // 4. Post Accounting Journal Entry & recalculate General Ledger balances
      await postPaymentJournalEntry(party.name, 'CUSTOMER', amount, notes || `Payment-In via ${paymentMethod}`);
      await syncLedgerAccountBalances(activeTenantId);

      // 5. Send API request to Server
      await createServerPaymentIn(newPayment);

      setIsSaving(false);
      setIsRecordModalOpen(false);
      setAmount(0);
      setNotes('');
      onPaymentRecorded();
    } catch (err: any) {
      console.error('Error saving Payment-In:', err);
      setIsSaving(false);
      alert(`Error saving payment: ${err?.message || err}`);
    }
  };

  const handleDeletePaymentIn = async (id?: number) => {
    if (!id) return;
    if (confirm('Are you sure you want to delete this Payment-In receipt?')) {
      await db.paymentIn.delete(id);
      onPaymentRecorded();
    }
  };

  return (
    <div className="flex-1 bg-[#f0f4f8] p-6 overflow-y-auto flex flex-col justify-between select-none">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-100 rounded-xl text-emerald-700">
                <ArrowDownLeft className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Payment-In (Paisa Aa Gaya)</h1>
                <p className="text-xs text-slate-500 font-medium">Record customer payments received to settle credit balance & invoices</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsRecordModalOpen(true)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-md transition cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>+ Record Payment-In</span>
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Received Amount</div>
              <div className="text-2xl font-black text-emerald-600 mt-1">
                Rs. {payments.reduce((acc, p) => acc + (p.amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Customer Outstanding Dues</div>
              <div className="text-2xl font-black text-amber-600 mt-1">
                Rs. {customersList.reduce((acc, c) => acc + (Number(c.currentBalance) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Wallet className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Payment Transactions</div>
              <div className="text-2xl font-black text-slate-800 mt-1">{payments.length}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by receipt number or customer name..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="text-xs font-semibold text-slate-500 shrink-0">
            Showing <span className="text-slate-900 font-bold">{filteredPayments.length}</span> payment(s)
          </div>
        </div>

        {/* Payment-In Table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {filteredPayments.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 mb-1">
                <ArrowDownLeft className="w-8 h-8" />
              </div>
              <div className="text-sm font-bold text-slate-700">No Payment-In Transactions Found</div>
              <p className="text-xs text-slate-400 max-w-sm">
                Record customer cash or digital payments when they settle their credit balances.
              </p>
              <button
                onClick={() => setIsRecordModalOpen(true)}
                className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm cursor-pointer"
              >
                + Record Payment-In
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Receipt #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Customer Name</th>
                    <th className="py-3 px-4">Payment Method</th>
                    <th className="py-3 px-4 text-right">Received Amount</th>
                    <th className="py-3 px-4">Notes</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredPayments.map(p => (
                    <tr key={p.id || p.receiptNumber} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4 font-bold text-slate-900 font-mono">
                        {p.receiptNumber}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-mono">
                        {p.paymentDate}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{p.partyName}</div>
                        {p.partyPhone && <div className="text-[10px] text-slate-400">{p.partyPhone}</div>}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-emerald-100 text-emerald-800">
                          {p.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-emerald-600 font-mono">
                        + Rs. {(p.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 text-[11px] max-w-xs truncate">
                        {p.notes || '-'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedPaymentForReceipt(p)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition cursor-pointer"
                            title="Print Payment Voucher"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeletePaymentIn(p.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                            title="Delete Payment Record"
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

      {/* RECORD PAYMENT-IN MODAL */}
      {isRecordModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 border border-slate-200">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowDownLeft className="w-5 h-5 text-emerald-400" />
                <span className="font-bold text-sm">Record Customer Payment-In</span>
              </div>
              <button
                onClick={() => setIsRecordModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePaymentIn} className="p-6 space-y-4">
              {/* Customer Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Select Customer / Party
                </label>
                <select
                  value={selectedParty?.id || ''}
                  onChange={e => {
                    const p = parties.find(party => party.id === Number(e.target.value));
                    if (p) setSelectedParty(p);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  required
                >
                  {parties.map(p => {
                    const bal = Number(p.currentBalance !== undefined ? p.currentBalance : p.openingBalance) || 0;
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.type}) — Outstanding Due: Rs. {bal.toFixed(2)}
                      </option>
                    );
                  })}
                </select>
                {selectedParty && (
                  <div className="mt-1.5 flex justify-between items-center bg-slate-100 p-2 rounded-lg text-xs">
                    <span className="text-slate-500 font-medium">Current Credit Balance:</span>
                    <span className="font-black text-amber-700 font-mono">
                      Rs. {(Number(selectedParty.currentBalance !== undefined ? selectedParty.currentBalance : selectedParty.openingBalance) || 0).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              {/* Amount Received Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Amount Received (Rs)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  value={amount || ''}
                  onChange={e => setAmount(Number(e.target.value))}
                  placeholder="Enter amount received..."
                  className="w-full px-3 py-2 bg-slate-50 border border-emerald-300 rounded-xl text-sm font-black text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Payment Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['CASH', 'DIGITAL / APP', 'CARD', 'CHEQUE'] as const).map(method => (
                    <button
                      type="button"
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                        paymentMethod === method
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Payment Date
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={e => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Notes / Reference Remarks
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Bank transfer transaction ID or cheque #"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRecordModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Recording Payment...' : 'Save Payment-In'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINT PAYMENT RECEIPT VOUCHER */}
      {selectedPaymentForReceipt && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between">
              <span className="font-bold text-xs">Payment-In Receipt Voucher</span>
              <button onClick={() => setSelectedPaymentForReceipt(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6">
              <div className="bg-white border border-slate-300 p-4 font-mono text-slate-900 text-xs shadow-xs rounded-xl space-y-3">
                <div className="text-center border-b border-dashed border-slate-300 pb-2">
                  <div className="font-bold text-sm uppercase">{business.name || 'My Business'}</div>
                  <div className="text-[10px] text-slate-600">{business.address}</div>
                  <div className="text-[10px] text-slate-600">Phone: {business.phone}</div>
                  <div className="mt-1 font-bold text-emerald-700 border border-emerald-300 rounded px-2 py-0.5 inline-block text-[10px]">
                    *** PAYMENT RECEIPT VOUCHER ***
                  </div>
                </div>

                <div className="text-[10px] space-y-1 border-b border-dashed border-slate-300 pb-2">
                  <div>Receipt #: <span className="font-bold">{selectedPaymentForReceipt.receiptNumber}</span></div>
                  <div>Date: {selectedPaymentForReceipt.paymentDate}</div>
                  <div>Customer: <span className="font-bold">{selectedPaymentForReceipt.partyName}</span></div>
                  <div>Method: <span className="font-bold">{selectedPaymentForReceipt.paymentMethod}</span></div>
                </div>

                <div className="text-center py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="text-[10px] text-emerald-700 font-bold uppercase">AMOUNT RECEIVED</div>
                  <div className="text-lg font-black text-emerald-700">
                    Rs. {(selectedPaymentForReceipt.amount || 0).toFixed(2)}
                  </div>
                </div>

                {selectedPaymentForReceipt.notes && (
                  <div className="text-[10px] text-slate-600 italic">
                    Notes: {selectedPaymentForReceipt.notes}
                  </div>
                )}

                <div className="text-[9px] text-slate-500 text-center border-t border-dashed border-slate-300 pt-2">
                  Thank you for your payment!
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
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
