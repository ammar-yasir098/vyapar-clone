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
  PackageMinus,
  Building2
} from 'lucide-react';
import { PurchaseReturn, BusinessDetails } from '../../types';
import { db } from '../../db';
import { deleteServerPurchaseReturn } from '../../services/api';
import { useToast } from '../Common/ToastContext';

interface PurchaseReturnListScreenProps {
  purchaseReturns: PurchaseReturn[];
  business: BusinessDetails;
  onCreateReturn: () => void;
  onReturnUpdated: () => void;
}

export const PurchaseReturnListScreen: React.FC<PurchaseReturnListScreenProps> = ({
  purchaseReturns,
  business,
  onCreateReturn,
  onReturnUpdated
}) => {
  const { showToast, showConfirm } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReturn, setSelectedReturn] = useState<PurchaseReturn | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const filteredReturns = purchaseReturns.filter(ret => 
    ret.debitNoteNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ret.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (ret.purchaseBillNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalReturnValue = purchaseReturns.reduce((acc, r) => acc + (r.grandTotal || 0), 0);
  const totalItemsCount = purchaseReturns.reduce((acc, r) => acc + (r.items?.length || 0), 0);

  const handleDeleteReturn = async (ret: PurchaseReturn) => {
    if (!ret.id && !ret.returnId) return;
    showConfirm({
      title: 'Delete Debit Note / Purchase Return',
      message: `Are you sure you want to delete Debit Note ${ret.debitNoteNumber}?`,
      type: 'danger',
      confirmText: 'Yes, Delete',
      onConfirm: async () => {
        if (ret.id) await db.purchaseReturns.delete(ret.id);
        try {
          if (ret.id) await deleteServerPurchaseReturn(ret.id);
        } catch {}
        showToast(`Debit Note ${ret.debitNoteNumber} deleted`, 'info');
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
              <div className="p-2 bg-red-100 rounded-xl text-red-700">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Purchase Return</h1>
                <p className="text-xs text-slate-500 font-medium">Return defective or damaged goods to suppliers — Deducts inventory stock & reduces supplier payables</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onCreateReturn}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-md transition cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Create Purchase Return</span>
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Debit Notes</div>
              <div className="text-2xl font-black text-slate-800 mt-1">{purchaseReturns.length}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Return Value</div>
              <div className="text-2xl font-black text-red-600 mt-1">
                Rs. {totalReturnValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              Rs
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Products Returned</div>
              <div className="text-2xl font-black text-amber-600 mt-1">
                {totalItemsCount}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <PackageMinus className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by debit note #, bill # or supplier name..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div className="text-xs font-semibold text-slate-500 shrink-0">
            Showing <span className="text-slate-900 font-bold">{filteredReturns.length}</span> return note(s)
          </div>
        </div>

        {/* Purchase Returns Table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {filteredReturns.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center text-red-500 mb-1">
                <RotateCcw className="w-8 h-8" />
              </div>
              <div className="text-sm font-bold text-slate-700">No Purchase Returns Recorded</div>
              <p className="text-xs text-slate-400 max-w-sm">
                Return defective items to your supplier by issuing a Debit Note.
              </p>
              <button
                onClick={onCreateReturn}
                className="mt-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm cursor-pointer"
              >
                Create Purchase Return
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Debit Note #</th>
                    <th className="py-3 px-4">Return Date</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4">Ref Bill #</th>
                    <th className="py-3 px-4">Items</th>
                    <th className="py-3 px-4 text-right">Return Amount</th>
                    <th className="py-3 px-4 text-center">Ledger Impact</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredReturns.map(ret => (
                    <tr key={ret.id || ret.returnId} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4 font-bold text-slate-900 font-mono">
                        {ret.debitNoteNumber}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-mono">
                        {ret.returnDate}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{ret.supplierName}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">
                        {ret.purchaseBillNumber || '-'}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-600">
                        {ret.items?.length || 0} item(s)
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-red-600">
                        Rs. {(ret.grandTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-red-100 text-red-800">
                          PAYABLE REDUCED
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedReturn(ret);
                              setIsDetailModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                            title="View Debit Note Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => {
                              setSelectedReturn(ret);
                              setIsPrintModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                            title="Print Debit Note Document"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteReturn(ret)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                            title="Delete Record"
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-red-400" />
                <span className="font-bold text-sm">Debit Note Details - {selectedReturn.debitNoteNumber}</span>
              </div>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-xs">
                <div>
                  <div className="text-slate-400 font-semibold uppercase text-[10px]">Supplier</div>
                  <div className="font-bold text-slate-800 text-sm mt-0.5">{selectedReturn.supplierName}</div>
                  {selectedReturn.purchaseBillNumber && (
                    <div className="text-slate-500 mt-1">Ref Bill: <span className="font-mono font-bold">{selectedReturn.purchaseBillNumber}</span></div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-slate-400 font-semibold uppercase text-[10px]">Return Date</div>
                  <div className="font-bold text-slate-800 text-sm mt-0.5">{selectedReturn.returnDate}</div>
                  <div className="text-red-600 font-bold uppercase text-[10px] mt-0.5">Stock Deducted</div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">Returned Items Breakdown</h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-bold">
                      <tr>
                        <th className="py-2 px-3">Item Description</th>
                        <th className="py-2 px-3 text-center">Return Qty</th>
                        <th className="py-2 px-3 text-right">Return Rate</th>
                        <th className="py-2 px-3 text-right">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedReturn.items?.map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-semibold text-slate-800">{item.itemName}</td>
                          <td className="py-2 px-3 text-center font-mono">{item.returnQuantity} {item.unitType || 'PCS'}</td>
                          <td className="py-2 px-3 text-right font-mono">Rs. {item.unitPrice}</td>
                          <td className="py-2 px-3 text-right font-bold text-red-600 font-mono">Rs. {item.totalAmount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedReturn.notes && (
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs text-slate-700">
                  <span className="font-bold block mb-0.5">Return Reason / Notes:</span>
                  {selectedReturn.notes}
                </div>
              )}

              <div className="border-t border-slate-200 pt-3 flex flex-col items-end gap-1 text-xs">
                <div className="flex justify-between w-48 font-black text-slate-900 text-sm">
                  <span>Grand Total Return:</span>
                  <span className="text-red-600">Rs. {selectedReturn.grandTotal}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setIsPrintModalOpen(true);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Debit Note Document</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT DEBIT NOTE MODAL */}
      {isPrintModalOpen && selectedReturn && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white px-6 py-3.5 flex items-center justify-between">
              <span className="font-bold text-sm flex items-center gap-2">
                <Printer className="w-4 h-4 text-red-400" />
                <span>Print A4 Debit Note (Dr. Note)</span>
              </span>
              <button onClick={() => setIsPrintModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[80vh]">
              <div id="debit-note-print-area" className="bg-white p-8 font-sans text-slate-900 border border-slate-300 rounded-xl shadow-xs space-y-6">
                <div className="flex justify-between items-start border-b border-slate-300 pb-6">
                  <div className="space-y-1">
                    <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{business.name || 'Company Name'}</h1>
                    <p className="text-xs text-slate-600 font-medium">{business.address || 'Store Location'}</p>
                    <p className="text-xs text-slate-600">Phone: {business.phone || '+92 300 0000000'}</p>
                  </div>

                  <div className="flex flex-col items-end space-y-3">
                    <h2 className="text-3xl font-black text-red-700 uppercase tracking-wider">DEBIT NOTE</h2>
                    
                    <table className="border-collapse border border-slate-400 text-[11px] font-sans w-64 text-center">
                      <thead>
                        <tr className="bg-slate-200 text-slate-800 font-bold uppercase border-b border-slate-400">
                          <th className="py-1 px-2 border-r border-slate-400">DR NOTE #</th>
                          <th className="py-1 px-2">DATE</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-slate-400 font-mono font-bold">
                          <td className="py-1 px-2 border-r border-slate-400 text-slate-900">{selectedReturn.debitNoteNumber}</td>
                          <td className="py-1 px-2 text-slate-900">{selectedReturn.returnDate}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <div className="bg-slate-200 border border-slate-400 px-3 py-1.5 font-bold text-xs uppercase tracking-wider text-slate-800 mb-2">
                    DEBITED SUPPLIER DETAILS
                  </div>
                  <div className="px-2 text-xs space-y-0.5">
                    <div className="font-bold text-slate-900 text-sm">{selectedReturn.supplierName}</div>
                    {selectedReturn.purchaseBillNumber && (
                      <div className="text-slate-600">Against Bill #: <span className="font-mono font-bold">{selectedReturn.purchaseBillNumber}</span></div>
                    )}
                  </div>
                </div>

                <div className="border border-slate-400 rounded-xs overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-200 text-slate-800 font-extrabold uppercase border-b border-slate-400">
                        <th className="py-2 px-3 border-r border-slate-400">RETURNED ITEM</th>
                        <th className="py-2 px-3 text-center border-r border-slate-400 w-20">QTY</th>
                        <th className="py-2 px-3 text-right border-r border-slate-400 w-28">RATE</th>
                        <th className="py-2 px-3 text-right w-32">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      {selectedReturn.items?.map((item, idx) => (
                        <tr key={idx} className="font-medium text-slate-800">
                          <td className="py-2.5 px-3 border-r border-slate-300 font-bold">{item.itemName}</td>
                          <td className="py-2.5 px-3 text-center border-r border-slate-300 font-mono">{item.returnQuantity} {item.unitType || 'PCS'}</td>
                          <td className="py-2.5 px-3 text-right border-r border-slate-300 font-mono">Rs. {(item.unitPrice || 0).toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">Rs. {(item.totalAmount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between items-start pt-2">
                  <div className="italic text-xs text-slate-600 font-medium">
                    Stock returned to supplier. Payable balance debited accordingly.
                  </div>

                  <table className="border-collapse border border-slate-400 text-xs w-64">
                    <tbody>
                      <tr className="bg-slate-200 border-t-2 border-slate-400">
                        <td className="py-2 px-3 font-black uppercase text-slate-900 text-sm">TOTAL DEBIT AMOUNT</td>
                        <td className="py-2 px-3 text-right font-black text-red-600 text-sm font-mono">
                          Rs. {(selectedReturn.grandTotal || 0).toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsPrintModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Debit Note</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
