import React, { useState } from 'react';
import { FileText, Printer, Search, Trash2 } from 'lucide-react';
import { Invoice, BusinessDetails } from '../../types';
import { triggerThermalPrint } from '../../services/printer';
import { db } from '../../db';
import { syncManager } from '../../services/sync';
import { useToast } from '../Common/ToastContext';
import { InvoicePrintModal, InvoiceFormat } from '../Invoice/InvoicePrintModal';

interface InvoicesScreenProps {
  invoices: Invoice[];
  business: BusinessDetails;
}

export const InvoicesScreen: React.FC<InvoicesScreenProps> = ({ invoices = [], business }) => {
  const [search, setSearch] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [defaultModalFormat, setDefaultModalFormat] = useState<InvoiceFormat>('a4');

  const safeInvoices = Array.isArray(invoices) ? invoices : [];

  const filteredInvoices = safeInvoices.filter(inv => {
    if (!inv) return false;
    const invNum = inv?.invoiceNumber || '';
    const partyName = inv?.partyName || '';
    return (
      invNum.toLowerCase().includes(search.toLowerCase()) ||
      partyName.toLowerCase().includes(search.toLowerCase())
    );
  });

  const { showToast, showConfirm } = useToast();

  const handleDeleteInvoice = (inv: Invoice) => {
    showConfirm({
      title: 'Delete & Reverse Invoice Stock',
      message: `Are you sure you want to delete Invoice #${inv.invoiceNumber}? Item stock levels will be restored and customer ledger will be updated.`,
      type: 'danger',
      confirmText: 'Delete & Restore Stock',
      onConfirm: async () => {
        try {
          await db.transaction('rw', [db.invoices, db.items, db.parties, db.syncJournal], async () => {
            // 1. Delete invoice from Dexie
            if (inv.id) {
              await db.invoices.delete(inv.id);
            }

            // 2. Restore item stock levels
            if (inv.items && Array.isArray(inv.items)) {
              for (const item of inv.items) {
                if (item.itemId) {
                  const dbItem = await db.items.get(item.itemId);
                  if (dbItem) {
                    const restoredStock = Number(dbItem.currentStock || 0) + Number(item.quantity || 0);
                    await db.items.update(item.itemId, {
                      currentStock: restoredStock,
                      updatedAt: new Date().toISOString()
                    });

                    // Log item stock restoration to sync journal
                    await db.syncJournal.add({
                      versionId: `client-v-${Date.now()}-item-${item.itemId}`,
                      clientSequence: Date.now(),
                      entityType: 'ITEM',
                      entityId: String(item.itemId),
                      mutationType: 'UPDATE',
                      payload: JSON.stringify({ id: item.itemId, name: dbItem.name, skuCode: dbItem.skuCode, currentStock: restoredStock }),
                      timestamp: new Date().toISOString(),
                      synced: false
                    });
                  }
                }
              }
            }

            // 3. Reverse party ledger balance if dueAmount > 0
            if (inv.partyId && inv.dueAmount && inv.dueAmount > 0) {
              const party = await db.parties.get(inv.partyId);
              if (party) {
                const curBal = Number(party.currentBalance || 0);
                const reversedBal = Math.max(0, curBal - inv.dueAmount);
                await db.parties.update(party.id!, { currentBalance: reversedBal });

                await db.syncJournal.add({
                  versionId: `client-v-${Date.now()}-party-${party.id}`,
                  clientSequence: Date.now(),
                  entityType: 'PARTY',
                  entityId: String(party.id),
                  mutationType: 'UPDATE',
                  payload: JSON.stringify({ id: party.id, currentBalance: reversedBal }),
                  timestamp: new Date().toISOString(),
                  synced: false
                });
              }
            }

            // 4. Log Invoice DELETE mutation to sync journal
            await db.syncJournal.add({
              versionId: `client-v-${Date.now()}-inv-${inv.invoiceId}`,
              clientSequence: Date.now(),
              entityType: 'INVOICE',
              entityId: inv.invoiceId,
              mutationType: 'DELETE',
              payload: JSON.stringify({ id: inv.id, invoiceId: inv.invoiceId, invoiceNumber: inv.invoiceNumber }),
              timestamp: new Date().toISOString(),
              synced: false
            });
          });

          syncManager.triggerSync();
          setSelectedInvoice(null);
          showToast(`Invoice #${inv.invoiceNumber} deleted and stock restored!`, 'success');
        } catch (err: any) {
          showToast(`Failed to delete invoice: ${err.message}`, 'error');
        }
      }
    });
  };

  return (
    <div className="flex-1 flex flex-col p-5 bg-[#f3f4f6] overflow-hidden gap-4 select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <span>Sales History & Invoices</span>
          </h2>
          <p className="text-xs text-slate-500 font-semibold">Total Bills Saved: {safeInvoices.length}</p>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by Invoice Number, Customer Name..."
          className="w-full h-10 pl-10 pr-4 bg-white border border-slate-200 rounded-xl text-slate-800 text-xs font-medium outline-none focus:border-blue-500 shadow-sm"
        />
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
      </div>

      {/* Invoices List Table */}
      <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col shadow-sm">
        <div className="flex-1 overflow-auto">
          <table className="vyapar-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Customer / Party</th>
                <th>Payment Method</th>
                <th>Status</th>
                <th className="text-right">Grand Total (Rs)</th>
                <th className="text-right">Net Due (Rs)</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-slate-400 text-xs">
                    No sales invoices found.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map(inv => {
                  const dueAmt = inv.dueAmount !== undefined ? inv.dueAmount : (inv.paymentStatus === 'PAID' ? 0 : inv.grandTotal);
                  return (
                    <tr key={inv.id || inv.invoiceNumber}>
                      <td className="font-mono font-extrabold text-xs text-blue-600">
                        {inv.invoiceNumber || 'INV-UNKNOWN'}
                      </td>
                      <td className="font-mono text-xs text-slate-500">{inv.invoiceDate || '-'}</td>
                      <td className="font-bold text-slate-800 text-xs">{inv.partyName || 'Walk-in Customer'}</td>
                      <td>
                        <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                          {inv.paymentMethod || 'CASH'}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            inv.paymentStatus === 'PAID'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : inv.paymentStatus === 'PARTIAL'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {inv.paymentStatus || 'UNPAID'}
                        </span>
                      </td>
                      <td className="font-mono font-bold text-xs text-slate-800 text-right">
                        Rs {Number(inv.grandTotal || 0).toFixed(2)}
                      </td>
                      <td className="font-mono font-black text-xs text-right text-rose-600">
                        Rs {Number(dueAmt).toFixed(2)}
                      </td>
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              setDefaultModalFormat('80mm');
                              setSelectedInvoice(inv);
                            }}
                            className="btn-vyapar-outline py-1 px-2.5 text-[11px] font-bold cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5 inline mr-1" />
                            <span>Slip</span>
                          </button>
                          <button
                            onClick={() => {
                              setDefaultModalFormat('a4');
                              setSelectedInvoice(inv);
                            }}
                            className="text-xs text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleDeleteInvoice(inv)}
                            className="text-xs text-red-600 hover:text-red-800 font-bold cursor-pointer p-1 rounded hover:bg-red-50"
                            title="Delete invoice and restore stock"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Print & PDF Export Modal */}
      {selectedInvoice && (
        <InvoicePrintModal
          invoice={selectedInvoice}
          business={business}
          defaultFormat={defaultModalFormat}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </div>
  );
};

