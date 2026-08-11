import React, { useState } from 'react';
import { FileText, Printer, Search } from 'lucide-react';
import { Invoice, BusinessDetails } from '../../types';
import { triggerThermalPrint } from '../../services/printer';

interface InvoicesScreenProps {
  invoices: Invoice[];
  business: BusinessDetails;
}

export const InvoicesScreen: React.FC<InvoicesScreenProps> = ({ invoices = [], business }) => {
  const [search, setSearch] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

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
                <th className="text-right">Grand Total (₹)</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-slate-400 text-xs">
                    No sales invoices found.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map(inv => (
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
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {inv.paymentStatus || 'UNPAID'}
                      </span>
                    </td>
                    <td className="font-mono font-black text-xs text-emerald-600 text-right">
                      ₹{Number(inv.grandTotal || 0).toFixed(2)}
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => triggerThermalPrint(inv, business, '80mm')}
                          className="btn-vyapar-outline py-1 px-2.5 text-[11px] font-bold cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5 inline mr-1" />
                          <span>Thermal Slip</span>
                        </button>
                        <button
                          onClick={() => setSelectedInvoice(inv)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
                        >
                          View Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>Invoice Details: {selectedInvoice.invoiceNumber || ''}</span>
              </h3>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="text-xs text-slate-400 hover:text-slate-600 font-bold"
              >
                Close
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 text-slate-600">
                <div>Customer: <strong className="text-slate-900">{selectedInvoice.partyName || 'Walk-in'}</strong></div>
                <div>Date: <strong className="text-slate-900">{selectedInvoice.invoiceDate || '-'}</strong></div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 max-h-48 overflow-y-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-slate-500 text-[10px] uppercase border-b border-slate-200 font-bold">
                      <th className="py-1">Item</th>
                      <th className="py-1 text-right">Qty</th>
                      <th className="py-1 text-right">Rate</th>
                      <th className="py-1 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedInvoice.items || []).map((item, i) => (
                      <tr key={i} className="border-b border-slate-200/60 text-slate-800">
                        <td className="py-1 font-bold">{item.itemName || 'Item'}</td>
                        <td className="py-1 text-right font-mono">{Number(item.quantity || 0)}</td>
                        <td className="py-1 text-right font-mono">₹{Number(item.unitPrice || 0).toFixed(2)}</td>
                        <td className="py-1 text-right font-mono font-black text-emerald-600">
                          ₹{Number(item.totalAmount || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-slate-100 p-3 rounded-xl space-y-1 font-mono text-xs text-right text-slate-700">
                <div>Subtotal: ₹{Number(selectedInvoice.subtotal || 0).toFixed(2)}</div>
                <div>Tax Total: ₹{Number(selectedInvoice.taxTotal || 0).toFixed(2)}</div>
                <div className="text-sm font-black text-emerald-600 pt-1 border-t border-slate-200">
                  Grand Total: ₹{Number(selectedInvoice.grandTotal || 0).toFixed(2)}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => triggerThermalPrint(selectedInvoice, business, '80mm')}
                className="btn-vyapar-blue text-xs font-bold"
              >
                <Printer className="w-4 h-4 inline mr-1" />
                <span>Print Thermal Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

