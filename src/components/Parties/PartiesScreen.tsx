import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Users,
  Plus,
  Search,
  Phone,
  ArrowDownLeft,
  ArrowUpRight,
  DollarSign,
  Trash2,
  FileText,
  Printer,
  MapPin,
  Pencil
} from 'lucide-react';
import { Party, PartyType, BalanceType, Invoice, BusinessDetails } from '../../types';
import { db } from '../../db';
import { createServerParty, recordServerPartyPayment, updateServerParty, deleteServerParty } from '../../services/api';
import { syncManager } from '../../services/sync';

import { useToast } from '../Common/ToastContext';
import { generatePartyLedger } from '../../services/reportsService';

interface PartiesScreenProps {
  parties: Party[];
  invoices?: Invoice[];
  business?: BusinessDetails;
  onPartyUpdated: () => void;
  onNavigateToPaymentIn?: (party: Party) => void;
  onNavigateToPaymentOut?: (party: Party) => void;
}

export const PartiesScreen: React.FC<PartiesScreenProps> = ({ parties, invoices = [], business, onPartyUpdated, onNavigateToPaymentIn, onNavigateToPaymentOut }) => {
  const { showToast, showConfirm } = useToast();
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'CUSTOMER' | 'SUPPLIER'>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [selectedPartyForPayment, setSelectedPartyForPayment] = useState<Party | null>(null);
  const [selectedPartyForStatement, setSelectedPartyForStatement] = useState<Party | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentRemarks, setPaymentRemarks] = useState('');


  const allInvoices = useLiveQuery(() => db.invoices.toArray(), []) || [];
  const allPurchaseBills = useLiveQuery(() => db.purchaseBills.toArray(), []) || [];
  const allPaymentsIn = useLiveQuery(() => db.paymentIn.toArray(), []) || [];
  const allPaymentsOut = useLiveQuery(() => db.paymentOut.toArray(), []) || [];
  const allSaleReturns = useLiveQuery(() => db.saleReturns.toArray(), []) || [];
  const allPurchaseReturns = useLiveQuery(() => db.purchaseReturns.toArray(), []) || [];

  const partyLedgerReport = useMemo(() => {
    if (!selectedPartyForStatement) return null;
    return generatePartyLedger(
      selectedPartyForStatement,
      allInvoices,
      allPaymentsIn,
      allSaleReturns,
      allPurchaseBills,
      allPaymentsOut,
      allPurchaseReturns
    );
  }, [selectedPartyForStatement, allInvoices, allPaymentsIn, allSaleReturns, allPurchaseBills, allPaymentsOut, allPurchaseReturns]);

  const safeNum = (val: any): number => {
    if (val === null || val === undefined) return 0;
    const n = Number(val);
    return isNaN(n) || !isFinite(n) ? 0 : n;
  };

  // Helper to compute dynamic party ledger balance considering payments & sales dues safely
  const getPartyEffectiveBalance = (party: Party): number => {
    return safeNum(party.currentBalance !== undefined ? party.currentBalance : party.openingBalance);
  };

  const [newParty, setNewParty] = useState<Partial<Party>>({
    name: '',
    phone: '',
    type: 'CUSTOMER',
    openingBalance: 0,
    balanceType: 'RECEIVABLE',
    gstin: '',
    address: ''
  });

  const uniqueParties = parties.filter((p, index, self) =>
    index === self.findIndex(t => (t.name || '').trim().toLowerCase() === (p.name || '').trim().toLowerCase())
  );

  const filteredParties = uniqueParties.filter(p => {
    const matchesTab =
      filterTab === 'ALL' ||
      p.type === filterTab ||
      p.type === 'BOTH';
    const matchesSearch =
      (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.phone || '').includes(search) ||
      (p.gstin && p.gstin.toLowerCase().includes(search.toLowerCase()));
    return matchesTab && matchesSearch;
  });

  const displayParties = filteredParties;

  const handleCreateParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newParty.name || !newParty.phone) return;

    const partyPayload = {
      tenantId: business?.tenantId || 'default-tenant',
      name: newParty.name,
      phone: newParty.phone,
      type: (newParty.type as PartyType) || 'CUSTOMER',
      openingBalance: Number(newParty.openingBalance) || 0,
      balanceType: (newParty.balanceType as BalanceType) || 'RECEIVABLE',
      currentBalance: Number(newParty.openingBalance) || 0,
      gstin: newParty.gstin || '',
      address: newParty.address || '',
      createdAt: new Date().toISOString()
    };

    const savedId = await db.parties.add(partyPayload);
    const fullParty = { ...partyPayload, id: savedId };

    await createServerParty(fullParty);
    await syncManager.logMutation('PARTY', String(savedId), 'INSERT', fullParty);

    setShowAddModal(false);
    onPartyUpdated();
    setNewParty({
      name: '',
      phone: '',
      type: 'CUSTOMER',
      openingBalance: 0,
      balanceType: 'RECEIVABLE',
      gstin: '',
      address: ''
    });
  };

  const handleUpdateParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingParty || !editingParty.id || !editingParty.name || !editingParty.phone) return;

    const partyId = Number(editingParty.id);
    const partyPayload = {
      tenantId: editingParty.tenantId || business?.tenantId || 'default-tenant',
      name: editingParty.name.trim(),
      phone: editingParty.phone.trim(),
      type: editingParty.type || 'CUSTOMER',
      openingBalance: Number(editingParty.openingBalance) || 0,
      balanceType: editingParty.balanceType || 'RECEIVABLE',
      currentBalance: Number(editingParty.currentBalance) !== undefined ? Number(editingParty.currentBalance) : Number(editingParty.openingBalance) || 0,
      gstin: (editingParty.gstin || '').trim(),
      address: (editingParty.address || '').trim()
    };

    try {
      await db.parties.update(partyId, partyPayload);
      await syncManager.logMutation('PARTY', String(partyId), 'UPDATE', partyPayload);
      await updateServerParty(partyId, partyPayload);

      // Cascading update for existing invoices of this party in Dexie so partyPhone remains in sync
      try {
        const existingInvoices = await db.invoices.toArray();
        const partyInvoices = existingInvoices.filter(inv => {
          const invPid = inv.partyId !== undefined && inv.partyId !== null ? Number(inv.partyId) : NaN;
          const matchesId = !isNaN(invPid) && invPid === partyId;
          const matchesName = inv.partyName && inv.partyName.trim().toLowerCase() === partyPayload.name.toLowerCase();
          return matchesId || matchesName;
        });

        for (const inv of partyInvoices) {
          if (inv.id) {
            await db.invoices.update(inv.id, {
              partyName: partyPayload.name,
              partyPhone: partyPayload.phone
            });
          }
        }
      } catch (cascadeErr) {
        console.warn('Cascading invoice phone update warning:', cascadeErr);
      }


      showToast(`Party '${editingParty.name}' updated successfully!`, 'success');
      setEditingParty(null);
      onPartyUpdated();
    } catch (err: any) {
      console.error('Error updating party:', err);
      showToast(`Error updating party: ${err?.message || err}`, 'error');
    }
  };



  const handleRecordPayment = async () => {
    if (!selectedPartyForPayment || paymentAmount <= 0) return;

    try {
      const party = selectedPartyForPayment;
      const curBal = getPartyEffectiveBalance(party);
      const newBal = Math.max(0, curBal - paymentAmount);

      // 1. Update Party Current Balance in Dexie & log sync mutation
      if (party.id) {
        await db.parties.update(party.id, { currentBalance: newBal });
        await syncManager.logMutation('PARTY', String(party.id), 'UPDATE', { id: party.id, currentBalance: newBal });
        await recordServerPartyPayment(party.id, paymentAmount, paymentRemarks, party.type, party.name);
      }

      // 2. Automatically apply payment towards unpaid/partial invoices for this party (oldest first)
      const allInvoices = await db.invoices.toArray();
      const partyInvoices = allInvoices.filter(inv =>
        (party.id !== undefined && inv.partyId === party.id) ||
        (inv.partyName && inv.partyName.trim().toLowerCase() === party.name.trim().toLowerCase())
      );

      const unpaidInvoices = partyInvoices
        .filter(inv => inv.paymentStatus !== 'PAID' || (inv.dueAmount !== undefined && inv.dueAmount > 0))
        .sort((a, b) => new Date(a.invoiceDate || 0).getTime() - new Date(b.invoiceDate || 0).getTime());

      let remainingPay = paymentAmount;

      for (const inv of unpaidInvoices) {
        if (remainingPay <= 0) break;

        const currentDue = inv.dueAmount !== undefined && inv.dueAmount > 0
          ? inv.dueAmount
          : Math.max(0, (inv.grandTotal || 0) - (inv.receivedAmount || 0));

        if (remainingPay >= currentDue) {
          // Fully pays off this invoice
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
          // Partially pays off this invoice
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

      showToast(`Payment of Rs ${paymentAmount} recorded successfully for ${party.name}!`, 'success');
      setSelectedPartyForPayment(null);
      setPaymentAmount(0);
      setPaymentRemarks('');
      onPartyUpdated();
    } catch (err: any) {
      console.error('Error recording payment:', err);
      showToast(`Error saving payment: ${err?.message || err}`, 'error');
    }
  };

  const handleDeleteParty = async (id?: number) => {
    if (!id) return;
    showConfirm({
      title: 'Delete Party Account',
      message: 'Are you sure you want to delete this party account from PostgreSQL database?',
      type: 'danger',
      confirmText: 'Yes, Delete',
      onConfirm: async () => {
        await db.parties.delete(id);
        await deleteServerParty(id);
        showToast('Party account deleted successfully', 'info');
        onPartyUpdated();
      }
    });
  };

  const totalReceivable = parties
    .filter(p => p.type === 'CUSTOMER' || p.type === 'BOTH')
    .reduce((sum, p) => {
      const bal = getPartyEffectiveBalance(p);
      return sum + (bal > 0 ? bal : 0);
    }, 0);

  const totalPayable = parties
    .filter(p => p.type === 'SUPPLIER' || p.type === 'BOTH')
    .reduce((sum, p) => {
      const bal = getPartyEffectiveBalance(p);
      return sum + (bal > 0 ? bal : 0);
    }, 0);

  return (
    <div className="flex-1 flex flex-col p-6 bg-[#f3f4f6] overflow-hidden gap-4 select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <span>Customers & Suppliers Ledger</span>
          </h2>
          <p className="text-xs text-slate-500 font-semibold">Manage party accounts, record payments, and track credit receivables</p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="btn-vyapar-blue text-xs font-extrabold cursor-pointer"
        >
          <Plus className="w-4 h-4 inline mr-1" />
          <span>Add New Party</span>
        </button>
      </div>

      {/* Ledger Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <ArrowDownLeft className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="text-xs text-slate-500 font-bold">TOTAL RECEIVABLE (FROM CUSTOMERS)</div>
              <div className="text-xl font-mono font-black text-emerald-600">
                Rs {totalReceivable.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="text-xs text-slate-500 font-bold">TOTAL PAYABLE (TO SUPPLIERS)</div>
              <div className="text-xl font-mono font-black text-rose-600">
                Rs {totalPayable.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-xs">
          <button
            onClick={() => setFilterTab('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition ${filterTab === 'ALL' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
              }`}
          >
            All Parties ({uniqueParties.length})
          </button>
          <button
            onClick={() => setFilterTab('CUSTOMER')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition ${filterTab === 'CUSTOMER' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
              }`}
          >
            Customers ({uniqueParties.filter(p => p.type === 'CUSTOMER' || p.type === 'BOTH').length})
          </button>
          <button
            onClick={() => setFilterTab('SUPPLIER')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition ${filterTab === 'SUPPLIER' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
              }`}
          >
            Suppliers ({uniqueParties.filter(p => p.type === 'SUPPLIER' || p.type === 'BOTH').length})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search party by Name, Phone, NTN..."
            className="w-full h-9 pl-9 pr-4 bg-white border border-slate-200 rounded-xl text-slate-800 text-xs font-medium outline-none focus:border-blue-500 shadow-xs"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
        </div>
      </div>

      {/* Parties Table */}
      <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col shadow-xs">
        <div className="flex-1 overflow-auto">
          <table className="vyapar-table">
            <thead>
              <tr>
                <th>Party Name</th>
                <th>Phone</th>
                <th>Type</th>
                <th>NTN / CNIC</th>
                <th>Address</th>
                <th className="text-right">Ledger Balance (Rs)</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayParties.map(party => {
                const bal = getPartyEffectiveBalance(party);
                const isCustomer = party.type === 'CUSTOMER';
                return (
                  <tr key={party.id}>
                    <td>
                      <div className="font-bold text-slate-900 text-xs">{party.name}</div>
                    </td>
                    <td className="font-mono text-xs text-slate-600">
                      <div className="flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{party.phone}</span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${party.type === 'CUSTOMER'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-purple-50 text-purple-700 border-purple-200'
                          }`}
                      >
                        {party.type}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-slate-500">{party.gstin || '-'}</td>
                    <td className="text-xs text-slate-500">{party.address || '-'}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span
                          className={`font-mono font-black text-xs ${bal > 0
                              ? isCustomer
                                ? 'text-emerald-600'
                                : 'text-rose-600'
                              : 'text-slate-500'
                            }`}
                        >
                          Rs {Math.abs(bal).toFixed(2)}
                        </span>
                        {isCustomer ? (
                          bal > 0 ? (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                              To Receive
                            </span>
                          ) : bal === 0 ? (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              Settled
                            </span>
                          ) : (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                              Advance (To Pay)
                            </span>
                          )
                        ) : (
                          bal > 0 ? (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                              To Pay
                            </span>
                          ) : bal === 0 ? (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              Settled
                            </span>
                          ) : (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                              Advance (To Receive)
                            </span>
                          )
                        )}
                      </div>
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setEditingParty(party)}
                          className="p-1 rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition cursor-pointer"
                          title="Edit Party Info"
                        >
                          <Pencil className="w-4 h-4 text-slate-600 hover:text-blue-600" />
                        </button>

                        <button
                          onClick={() => setSelectedPartyForStatement(party)}
                          className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition cursor-pointer"
                          title="View Party Statement"
                        >
                          <FileText className="w-4 h-4 text-blue-600" />
                        </button>

                        <button
                          onClick={() => handleDeleteParty(party.id)}
                          className="p-1 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition cursor-pointer"
                          title="Delete Party Account"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>

                  </tr>
                );
              })}

              {filteredParties.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400 text-xs font-semibold">
                    No party accounts found matching your search. Click "+ Add New Party" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Payment Dialog */}
      {selectedPartyForPayment && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white p-5 rounded-2xl w-full max-w-md space-y-4 shadow-2xl border border-slate-200">
            <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span>Record Payment: {selectedPartyForPayment.name}</span>
            </h3>

            <div className="space-y-3">
              <div className="bg-slate-50 p-3 rounded-xl text-xs font-mono">
                <div className="flex justify-between text-slate-600">
                  <span>Current Dues:</span>
                  <span className="font-bold text-emerald-600">Rs {safeNum(getPartyEffectiveBalance(selectedPartyForPayment)).toFixed(2)}</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Payment Amount (Rs) *</label>
                <input
                  type="number"
                  value={paymentAmount || ''}
                  onChange={e => setPaymentAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="input-field text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Remarks / Note</label>
                <input
                  type="text"
                  value={paymentRemarks}
                  onChange={e => setPaymentRemarks(e.target.value)}
                  placeholder="Cash received via JazzCash / Direct Cash"
                  className="input-field text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setSelectedPartyForPayment(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                className="btn-vyapar-blue text-xs font-bold"
              >
                Save Payment Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Party Ledger Statement Modal */}
      {selectedPartyForStatement && (() => {
        const party = selectedPartyForStatement;
        const isCustomer = party.type === 'CUSTOMER';
        const stmtBal = partyLedgerReport ? partyLedgerReport.closingBalance : Math.abs(getPartyEffectiveBalance(party));
        const isSettled = stmtBal === 0;

        const totalBilled = partyLedgerReport?.totalBilled || 0;
        const totalPaid = partyLedgerReport?.totalPaid || 0;

        const renderTransactionBadge = (type: string) => {
          switch (type) {
            case 'PURCHASE_BILL':
              return (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-purple-50 text-purple-700 border border-purple-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                  Purchase Bill
                </span>
              );
            case 'PAYMENT_OUT':
              return (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  Payment-Out
                </span>
              );
            case 'INVOICE':
              return (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  Sale Invoice
                </span>
              );
            case 'PAYMENT_IN':
              return (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Payment-In
                </span>
              );
            case 'PURCHASE_RETURN':
              return (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                  Debit Note
                </span>
              );
            case 'SALE_RETURN':
              return (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                  Credit Note
                </span>
              );
            default:
              return (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                  {type}
                </span>
              );
          }
        };

        return (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 p-6">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-4 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white flex items-center justify-center shadow-md">
                    <FileText className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-lg text-slate-900 tracking-tight">
                        {party.name}
                      </h3>
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${
                        party.type === 'CUSTOMER' 
                          ? 'bg-blue-50 text-blue-700 border-blue-200' 
                          : party.type === 'SUPPLIER' 
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {party.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 font-medium mt-0.5">
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-slate-400" /> {party.phone || 'No Phone'}</span>
                      <span>•</span>
                      <span>NTN: {party.gstin || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="btn-vyapar-outline text-xs font-bold flex items-center gap-1.5 cursor-pointer px-3 py-2 rounded-xl"
                  >
                    <Printer className="w-4 h-4 text-slate-600" />
                    <span>Print Statement</span>
                  </button>
                  <button
                    onClick={() => setSelectedPartyForStatement(null)}
                    className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition flex items-center justify-center cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Account Dues Banner */}
              <div className="shrink-0">
                {isCustomer ? (
                  !isSettled ? (
                    <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 p-3.5 rounded-2xl flex items-center justify-between text-xs text-emerald-950 font-extrabold shadow-2xs">
                      <span className="flex items-center gap-2">
                        <ArrowDownLeft className="w-5 h-5 text-emerald-600 shrink-0" />
                        <span>STATUS: You have to RECEIVE money from this Customer</span>
                      </span>
                      <span className="text-sm font-mono font-black text-emerald-700 bg-emerald-100/90 px-3 py-1 rounded-xl shadow-2xs">
                        Rs {stmtBal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ) : (
                    <div className="bg-slate-100/80 border border-slate-200 p-3.5 rounded-2xl flex items-center justify-between text-xs text-slate-700 font-extrabold shadow-2xs">
                      <span>STATUS: Account Fully Settled (No pending dues)</span>
                      <span className="text-sm font-mono font-black text-slate-800 bg-slate-200 px-3 py-1 rounded-xl">Rs 0.00</span>
                    </div>
                  )
                ) : (
                  !isSettled ? (
                    <div className="bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-transparent border border-rose-500/20 p-3.5 rounded-2xl flex items-center justify-between text-xs text-rose-950 font-extrabold shadow-2xs">
                      <span className="flex items-center gap-2">
                        <ArrowUpRight className="w-5 h-5 text-rose-600 shrink-0" />
                        <span>STATUS: You have to PAY money to this Supplier / Seller</span>
                      </span>
                      <span className="text-sm font-mono font-black text-rose-700 bg-rose-100/90 px-3 py-1 rounded-xl shadow-2xs">
                        Rs {stmtBal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ) : (
                    <div className="bg-slate-100/80 border border-slate-200 p-3.5 rounded-2xl flex items-center justify-between text-xs text-slate-700 font-extrabold shadow-2xs">
                      <span>STATUS: Account Fully Settled (No pending dues)</span>
                      <span className="text-sm font-mono font-black text-slate-800 bg-slate-200 px-3 py-1 rounded-xl">Rs 0.00</span>
                    </div>
                  )
                )}
              </div>

              {/* Account Metrics Grid */}
              <div className="grid grid-cols-4 gap-3 shrink-0">
                <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-2xl">
                  <div className="text-[10px] font-extrabold text-slate-400 tracking-wider uppercase">OPENING BALANCE</div>
                  <div className="text-xs font-mono font-bold text-slate-700 mt-1">Rs {Number(party.openingBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-2xl">
                  <div className="text-[10px] font-extrabold text-slate-400 tracking-wider uppercase">{isCustomer ? 'TOTAL SALES' : 'TOTAL PURCHASES'}</div>
                  <div className="text-xs font-mono font-bold text-slate-900 mt-1">Rs {totalBilled.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-2xl">
                  <div className="text-[10px] font-extrabold text-slate-400 tracking-wider uppercase">{isCustomer ? 'TOTAL RECEIVED' : 'TOTAL PAID'}</div>
                  <div className="text-xs font-mono font-bold text-emerald-600 mt-1">Rs {totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-2xl">
                  <div className="text-[10px] font-extrabold text-slate-400 tracking-wider uppercase">NET OUTSTANDING</div>
                  <div className={`text-sm font-mono font-black mt-0.5 ${!isSettled ? (isCustomer ? 'text-emerald-600' : 'text-rose-600') : 'text-slate-700'}`}>
                    Rs {stmtBal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="text-xs text-slate-500 flex items-center gap-1.5 shrink-0 px-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{party.address || 'No billing address provided.'}</span>
              </div>

              {/* Ledger Statement Table */}
              <div className="flex-1 min-h-[220px] overflow-y-auto border border-slate-200/90 rounded-2xl bg-white shadow-2xs">
                <table className="vyapar-table text-xs w-full">
                  <thead className="bg-slate-50/90 sticky top-0 backdrop-blur-xs z-10 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Voucher / Ref #</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3 text-right">Debit (Rs)</th>
                      <th className="py-2.5 px-3 text-right">Credit (Rs)</th>
                      <th className="py-2.5 px-3 text-right">Running Balance (Rs)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(!partyLedgerReport || partyLedgerReport.entries.length === 0) ? (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-slate-400 text-xs">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <FileText className="w-8 h-8 text-slate-300 stroke-[1.5]" />
                            <span className="font-semibold">No ledger transactions found for this party account.</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      partyLedgerReport.entries.map((entry, idx) => (
                        <tr key={entry.id || idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="font-mono text-slate-600 py-2.5 px-3">{entry.date || '-'}</td>
                          <td className="font-mono font-bold text-blue-600 py-2.5 px-3">{entry.voucherNo || '-'}</td>
                          <td className="py-2.5 px-3">{renderTransactionBadge(entry.type)}</td>
                          <td className="font-mono text-slate-900 font-medium text-right py-2.5 px-3">
                            {entry.debit > 0 ? `Rs ${entry.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                          </td>
                          <td className="font-mono text-emerald-600 font-semibold text-right py-2.5 px-3">
                            {entry.credit > 0 ? `Rs ${entry.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                          </td>
                          <td className="font-mono font-bold text-right py-2.5 px-3">
                            <span className={entry.runningBalance > 0 ? (isCustomer ? 'text-emerald-600' : 'text-rose-600') : 'text-slate-500'}>
                              Rs {entry.runningBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end pt-3 border-t border-slate-200 shrink-0">
                <button
                  onClick={() => setSelectedPartyForStatement(null)}
                  className="px-6 py-2.5 rounded-2xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 shadow-md transition cursor-pointer"
                >
                  Close Statement
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Party Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <span>Add New Customer / Supplier</span>
            </h3>

            <form onSubmit={handleCreateParty} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Party Name *</label>
                <input
                  type="text"
                  required
                  value={newParty.name}
                  onChange={e => setNewParty({ ...newParty, name: e.target.value })}
                  placeholder="e.g. Al-Fatah Wholesale"
                  className="input-field text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={newParty.phone}
                    onChange={e => setNewParty({ ...newParty, phone: e.target.value })}
                    placeholder="03001234567"
                    className="input-field text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Party Type</label>
                  <select
                    value={newParty.type}
                    onChange={e => setNewParty({ ...newParty, type: e.target.value as PartyType })}
                    className="input-field text-xs"
                  >
                    <option value="CUSTOMER">CUSTOMER</option>
                    <option value="SUPPLIER">SUPPLIER</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Opening Balance (Rs)</label>
                  <input
                    type="number"
                    value={newParty.openingBalance || ''}
                    onChange={e => setNewParty({ ...newParty, openingBalance: parseFloat(e.target.value) })}
                    placeholder="0.00"
                    className="input-field text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">NTN / CNIC (Optional)</label>
                  <input
                    type="text"
                    value={newParty.gstin}
                    onChange={e => setNewParty({ ...newParty, gstin: e.target.value })}
                    placeholder="35202-1234567-1"
                    className="input-field text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Billing Address</label>
                <input
                  type="text"
                  value={newParty.address}
                  onChange={e => setNewParty({ ...newParty, address: e.target.value })}
                  placeholder="Street, Commercial Area, City"
                  className="input-field text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-vyapar-blue text-xs font-bold cursor-pointer">
                  Save Party Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Party Modal */}
      {editingParty && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
              <Pencil className="w-4 h-4 text-blue-600" />
              <span>Edit Party Account: {editingParty.name}</span>
            </h3>

            <form onSubmit={handleUpdateParty} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Party Name *</label>
                <input
                  type="text"
                  required
                  value={editingParty.name}
                  onChange={e => setEditingParty({ ...editingParty, name: e.target.value })}
                  placeholder="e.g. Al-Fatah Wholesale"
                  className="input-field text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={editingParty.phone}
                    onChange={e => setEditingParty({ ...editingParty, phone: e.target.value })}
                    placeholder="03001234567"
                    className="input-field text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Party Type</label>
                  <select
                    value={editingParty.type}
                    onChange={e => setEditingParty({ ...editingParty, type: e.target.value as PartyType })}
                    className="input-field text-xs font-semibold"
                  >
                    <option value="CUSTOMER">CUSTOMER</option>
                    <option value="SUPPLIER">SUPPLIER</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Opening Balance (Rs)</label>
                  <input
                    type="number"
                    value={editingParty.openingBalance || ''}
                    onChange={e => setEditingParty({ ...editingParty, openingBalance: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="input-field text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">NTN / CNIC (Optional)</label>
                  <input
                    type="text"
                    value={editingParty.gstin || ''}
                    onChange={e => setEditingParty({ ...editingParty, gstin: e.target.value })}
                    placeholder="35202-1234567-1"
                    className="input-field text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Billing Address</label>
                <input
                  type="text"
                  value={editingParty.address || ''}
                  onChange={e => setEditingParty({ ...editingParty, address: e.target.value })}
                  placeholder="Street, Commercial Area, City"
                  className="input-field text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingParty(null)}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-vyapar-blue text-xs font-bold cursor-pointer">
                  Update Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

