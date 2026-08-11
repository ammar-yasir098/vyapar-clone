import React, { useState } from 'react';
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
  MapPin 
} from 'lucide-react';
import { Party, PartyType, BalanceType } from '../../types';
import { db } from '../../db';
import { createServerParty, recordServerPartyPayment, deleteServerParty } from '../../services/api';

interface PartiesScreenProps {
  parties: Party[];
  onPartyUpdated: () => void;
}

export const PartiesScreen: React.FC<PartiesScreenProps> = ({ parties, onPartyUpdated }) => {
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'CUSTOMER' | 'SUPPLIER'>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPartyForPayment, setSelectedPartyForPayment] = useState<Party | null>(null);
  const [selectedPartyForStatement, setSelectedPartyForStatement] = useState<Party | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentRemarks, setPaymentRemarks] = useState('');

  const [newParty, setNewParty] = useState<Partial<Party>>({
    name: '',
    phone: '',
    type: 'CUSTOMER',
    openingBalance: 0,
    balanceType: 'RECEIVABLE',
    gstin: '',
    address: ''
  });

  const filteredParties = parties.filter(p => {
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

  const handleCreateParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newParty.name || !newParty.phone) return;

    const partyPayload = {
      tenantId: 'default-tenant',
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
    await createServerParty({ ...partyPayload, id: savedId });

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

  const handleRecordPayment = async () => {
    if (!selectedPartyForPayment || paymentAmount <= 0) return;

    const party = selectedPartyForPayment;
    const curBal = Number(party.currentBalance || 0);
    const newBal = Math.max(0, curBal - paymentAmount);
    
    // Update Party Current Balance in Dexie
    if (party.id) {
      await db.parties.update(party.id, { currentBalance: newBal });
      await recordServerPartyPayment(party.id, paymentAmount, paymentRemarks, party.type);
    }

    // Post Journal Entry
    const count = await db.journalEntries.count();
    await db.journalEntries.add({
      tenantId: 'default-tenant',
      entryNumber: `JE-PAY-${Date.now().toString().slice(-4)}`,
      referenceId: `PAY-${party.name}`,
      transactionDate: new Date().toISOString().split('T')[0],
      description: `Payment ${party.type === 'CUSTOMER' ? 'Received from' : 'Made to'} ${party.name}: ${paymentRemarks}`,
      lines: [
        { accountId: 1, accountCode: '1010', accountName: 'Cash in Hand', debit: party.type === 'CUSTOMER' ? paymentAmount : 0, credit: party.type === 'CUSTOMER' ? 0 : paymentAmount },
        { accountId: 3, accountCode: party.type === 'CUSTOMER' ? '1030' : '2010', accountName: party.type === 'CUSTOMER' ? 'Accounts Receivable' : 'Accounts Payable', debit: party.type === 'CUSTOMER' ? 0 : paymentAmount, credit: party.type === 'CUSTOMER' ? paymentAmount : 0 }
      ],
      totalDebit: paymentAmount,
      totalCredit: paymentAmount,
      createdAt: new Date().toISOString()
    });

    alert(`Payment of Rs ${paymentAmount} recorded successfully for ${party.name}! Balance updated.`);
    setSelectedPartyForPayment(null);
    setPaymentAmount(0);
    setPaymentRemarks('');
    onPartyUpdated();
  };

  const handleDeleteParty = async (id?: number) => {
    if (!id) return;
    if (confirm('Are you sure you want to delete this party account from PostgreSQL database?')) {
      await db.parties.delete(id);
      await deleteServerParty(id);
      onPartyUpdated();
    }
  };

  const totalReceivable = parties
    .filter(p => Number(p.currentBalance || 0) > 0 && p.type === 'CUSTOMER')
    .reduce((sum, p) => sum + Number(p.currentBalance || 0), 0);

  const totalPayable = parties
    .filter(p => Number(p.currentBalance || 0) > 0 && p.type === 'SUPPLIER')
    .reduce((sum, p) => sum + Number(p.currentBalance || 0), 0);

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
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition ${
              filterTab === 'ALL' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            All Parties ({parties.length})
          </button>
          <button
            onClick={() => setFilterTab('CUSTOMER')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition ${
              filterTab === 'CUSTOMER' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Customers ({parties.filter(p => p.type === 'CUSTOMER').length})
          </button>
          <button
            onClick={() => setFilterTab('SUPPLIER')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition ${
              filterTab === 'SUPPLIER' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Suppliers ({parties.filter(p => p.type === 'SUPPLIER').length})
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
              {filteredParties.map(party => {
                const bal = Number(party.currentBalance || 0);
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
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          party.type === 'CUSTOMER'
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
                      <span
                        className={`font-mono font-black text-xs ${
                          bal > 0
                            ? party.type === 'CUSTOMER'
                              ? 'text-emerald-600'
                              : 'text-rose-600'
                            : 'text-slate-500'
                        }`}
                      >
                        Rs {bal.toFixed(2)}
                      </span>
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setSelectedPartyForPayment(party)}
                          className="btn-vyapar-outline text-[11px] font-bold py-1 px-2 cursor-pointer"
                          title="Record Payment"
                        >
                          {party.type === 'CUSTOMER' ? 'Receive Cash' : 'Pay Cash'}
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
                  <span className="font-bold text-emerald-600">Rs {Number(selectedPartyForPayment.currentBalance || 0).toFixed(2)}</span>
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
      {selectedPartyForStatement && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  Party Statement: {selectedPartyForStatement.name}
                </h3>
                <p className="text-xs text-slate-500">Phone: {selectedPartyForStatement.phone} | NTN: {selectedPartyForStatement.gstin || 'N/A'}</p>
              </div>
              <button
                onClick={() => window.print()}
                className="btn-vyapar-outline text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Statement</span>
              </button>
            </div>

            {/* Account Overview Box */}
            <div className="grid grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <div className="text-[10px] font-bold text-slate-500">PARTY TYPE</div>
                <div className="text-xs font-extrabold text-slate-800">{selectedPartyForStatement.type}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-500">OPENING BALANCE</div>
                <div className="text-xs font-mono font-bold text-slate-700">Rs {Number(selectedPartyForStatement.openingBalance || 0).toFixed(2)}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-500">NET OUTSTANDING DUES</div>
                <div className="text-sm font-mono font-black text-emerald-600">Rs {Number(selectedPartyForStatement.currentBalance || 0).toFixed(2)}</div>
              </div>
            </div>

            {/* Address */}
            <div className="text-xs text-slate-600 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
              <span>{selectedPartyForStatement.address || 'No billing address provided.'}</span>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-200">
              <button
                onClick={() => setSelectedPartyForStatement(null)}
                className="px-5 py-2 rounded-full bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition cursor-pointer"
              >
                Close Statement
              </button>
            </div>
          </div>
        </div>
      )}

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
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-vyapar-blue text-xs font-bold">
                  Save Party Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
