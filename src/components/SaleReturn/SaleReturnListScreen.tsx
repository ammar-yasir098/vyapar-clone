import React, { useState } from 'react';
import { 
  RotateCcw, 
  Plus, 
  Search, 
  Printer, 
  Trash2, 
  Eye, 
  X, 
  FileText, 
  PackagePlus,
  Building2
} from 'lucide-react';
import { SaleReturn, BusinessDetails } from '../../types';
import { db } from '../../db';
import { deleteServerSaleReturn } from '../../services/api';
import { useToast } from '../Common/ToastContext';

interface SaleReturnListScreenProps {
  saleReturns: SaleReturn[];
  business: BusinessDetails;
  onCreateReturn: () => void;
  onReturnUpdated: () => void;
}

export const SaleReturnListScreen: React.FC<SaleReturnListScreenProps> = ({
  saleReturns,
  business,
  onCreateReturn,
  onReturnUpdated
}) => {
  const { showToast, showConfirm } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReturn, setSelectedReturn] = useState<SaleReturn | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const filteredReturns = saleReturns.filter(ret => 
    (ret.creditNoteNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (ret.partyName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (ret.invoiceNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalReturnValue = saleReturns.reduce((acc, r) => acc + (r.grandTotal || 0), 0);
  const totalItemsCount = saleReturns.reduce((acc, r) => acc + (r.items?.length || 0), 0);

  const handleDeleteReturn = async (ret: SaleReturn) => {
    if (!ret.id && !ret.returnId) return;
    showConfirm({
      title: 'Delete Credit Note / Sale Return',
      message: `Are you sure you want to delete Credit Note ${ret.creditNoteNumber}?`,
      type: 'danger',
      confirmText: 'Yes, Delete',
      onConfirm: async () => {
        if (ret.id) await db.saleReturns.delete(ret.id);
        try {
          if (ret.id) await deleteServerSaleReturn(ret.id);
        } catch {}
        showToast(`Credit Note ${ret.creditNoteNumber} deleted`, 'info');
        onReturnUpdated();
        if (selectedReturn?.id === ret.id) {
          setIsDetailModalOpen(false);
          setIsPrintModalOpen(false);
        }
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
              <div className="p-2 bg-emerald-100 rounded-xl text-emerald-700">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Sale Return / Credit Note</h1>
                <p className="text-xs text-slate-500 font-medium">Record merchandise returned by customers — Automatically increases stock & reduces customer receivables</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onCreateReturn}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-md transition cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Create Credit Note (Cr. Note)</span>
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Credit Notes</div>
              <div className="text-2xl font-black text-slate-800 mt-1">{saleReturns.length}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Return Value</div>
              <div className="text-2xl font-black text-emerald-600 mt-1">
                Rs. {totalReturnValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              Rs
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Stock Restocked</div>
              <div className="text-2xl font-black text-blue-600 mt-1">
                {totalItemsCount} units
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <PackagePlus className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by credit note #, invoice # or customer name..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="text-xs font-semibold text-slate-500 shrink-0">
            Showing <span className="text-slate-900 font-bold">{filteredReturns.length}</span> credit note(s)
          </div>
        </div>

        {/* Sale Returns Table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {filteredReturns.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 mb-1">
                <RotateCcw className="w-8 h-8" />
              </div>
              <div className="text-sm font-bold text-slate-700">No Sale Returns / Credit Notes Recorded</div>
              <p className="text-xs text-slate-400 max-w-sm">
                Record returned merchandise from customers to restock items and adjust customer receivables.
              </p>
              <button
                onClick={onCreateReturn}
                className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm cursor-pointer"
              >
                Create Credit Note
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Credit Note #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Customer Name</th>
                    <th className="py-3 px-4">Ref Invoice #</th>
                    <th className="py-3 px-4">Items</th>
                    <th className="py-3 px-4 text-right">Return Amount</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredReturns.map(ret => (
                    <tr key={ret.id || ret.returnId} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4 font-bold text-slate-900 font-mono">
                        {ret.creditNoteNumber}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-mono">
                        {ret.returnDate}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{ret.partyName}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">
                        {ret.invoiceNumber || '-'}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-600">
                        {ret.items?.length || 0} item(s)
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-emerald-600">
                        Rs. {(ret.grandTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedReturn(ret);
                              setIsDetailModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition cursor-pointer"
                            title="View Credit Note Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => {
                              setSelectedReturn(ret);
                              setIsPrintModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                            title="Print Credit Note Slip"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteReturn(ret)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                            title="Delete Credit Note"
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

      {/* DETAIL MODAL */}
      {isDetailModalOpen && selectedReturn && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-base">Credit Note Details</h3>
                  <p className="text-xs text-slate-500 font-mono">{selectedReturn.creditNoteNumber}</p>
                </div>
              </div>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 pr-1 text-xs">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">Customer Name</span>
                  <span className="font-bold text-slate-800 text-sm">{selectedReturn.partyName}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">Return Date</span>
                  <span className="font-bold text-slate-800 font-mono">{selectedReturn.returnDate}</span>
                </div>
                {selectedReturn.invoiceNumber && (
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px] uppercase">Ref Invoice #</span>
                    <span className="font-bold text-slate-700 font-mono">{selectedReturn.invoiceNumber}</span>
                  </div>
                )}
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">Total Value</span>
                  <span className="font-black text-emerald-600 text-sm">
                    Rs. {(selectedReturn.grandTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <div className="font-extrabold text-slate-700 text-xs uppercase tracking-wider">Returned Products</div>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100/80 text-[10px] font-bold text-slate-500 uppercase">
                        <th className="py-2 px-3">Item Name</th>
                        <th className="py-2 px-3 text-center">Unit</th>
                        <th className="py-2 px-3 text-center">Returned Qty</th>
                        <th className="py-2 px-3 text-right">Unit Price</th>
                        <th className="py-2 px-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {selectedReturn.items?.map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-semibold">{item.itemName}</td>
                          <td className="py-2 px-3 text-center font-mono text-[11px]">{item.unitType || 'PCS'}</td>
                          <td className="py-2 px-3 text-center font-bold text-emerald-700">{item.returnQuantity}</td>
                          <td className="py-2 px-3 text-right font-mono">Rs. {Number(item.unitPrice || 0).toFixed(2)}</td>
                          <td className="py-2 px-3 text-right font-bold font-mono">Rs. {Number(item.totalAmount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedReturn.notes && (
                <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl">
                  <span className="text-[10px] font-bold text-amber-800 uppercase block">Notes</span>
                  <p className="text-xs text-amber-900">{selectedReturn.notes}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT MODAL */}
      {isPrintModalOpen && selectedReturn && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Printer className="w-4 h-4 text-emerald-600" />
                <span>Credit Note Slip</span>
              </h3>
              <button
                onClick={() => setIsPrintModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="thermal-paper p-5 border border-slate-200 rounded-xl text-slate-800 space-y-2 bg-white text-xs font-mono">
              <div className="text-center font-bold text-sm uppercase">{business.name}</div>
              <div className="text-center text-[10px]">{business.address}</div>
              <div className="text-center text-[10px]">Ph: {business.phone}</div>

              <div className="border-t border-dashed border-slate-400 my-2"></div>
              <div className="text-center font-bold uppercase text-xs">*** CREDIT NOTE (CR. NOTE) ***</div>
              <div>Note #: {selectedReturn.creditNoteNumber}</div>
              <div>Date  : {selectedReturn.returnDate}</div>
              <div>Cust  : {selectedReturn.partyName}</div>
              {selectedReturn.invoiceNumber && <div>Ref Inv: {selectedReturn.invoiceNumber}</div>}

              <div className="border-t border-dashed border-slate-400 my-2"></div>
              <div className="space-y-1">
                {selectedReturn.items?.map((item, idx) => (
                  <div key={idx} className="flex justify-between">
                    <div>{item.itemName} x{item.returnQuantity}</div>
                    <div className="font-bold">Rs {Number(item.totalAmount || 0).toFixed(2)}</div>
                  </div>
                ))}
              </div>

              <div className="border-t border-dashed border-slate-400 my-2"></div>
              <div className="flex justify-between font-extrabold text-sm">
                <span>TOTAL CREDIT:</span>
                <span className="text-emerald-700">Rs {Number(selectedReturn.grandTotal || 0).toFixed(2)}</span>
              </div>
              <div className="border-t border-dashed border-slate-400 my-2"></div>
              <div className="text-center text-[9px] uppercase font-bold text-slate-500">
                Merchandise Restocked & Customer Ledger Credited
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Credit Note</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
