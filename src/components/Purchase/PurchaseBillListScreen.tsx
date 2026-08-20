import React, { useState } from 'react';
import { 
  FileText, 
  Plus, 
  Search, 
  Printer, 
  Trash2, 
  Eye, 
  Clock, 
  X, 
  ShoppingBag,
  ArrowDownLeft,
  PackageCheck
} from 'lucide-react';
import { PurchaseBill, BusinessDetails } from '../../types';
import { db } from '../../db';
import { deleteServerPurchaseBill } from '../../services/api';
import { useToast } from '../Common/ToastContext';

interface PurchaseBillListScreenProps {
  purchaseBills: PurchaseBill[];
  business: BusinessDetails;
  onCreateBill: () => void;
  onBillUpdated: () => void;
}

export const PurchaseBillListScreen: React.FC<PurchaseBillListScreenProps> = ({
  purchaseBills,
  business,
  onCreateBill,
  onBillUpdated
}) => {
  const { showToast, showConfirm } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBill, setSelectedBill] = useState<PurchaseBill | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const filteredBills = purchaseBills.filter(bill => 
    bill.billNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bill.supplierName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDeleteBill = async (bill: PurchaseBill) => {
    if (!bill.id && !bill.billId) return;
    showConfirm({
      title: 'Delete Purchase Bill',
      message: `Are you sure you want to delete Purchase Bill ${bill.billNumber}? Stock levels will be deducted, supplier payables reverted, and linked cash/journal records deleted.`,
      type: 'danger',
      confirmText: 'Yes, Delete',
      onConfirm: async () => {
        const { voidPurchaseBill } = await import('../../services/reversal');
        const res = await voidPurchaseBill(bill.id || bill.billNumber);
        try {
          if (bill.id) await deleteServerPurchaseBill(bill.id);
        } catch {}
        if (res.success) {
          showToast(res.message || `Purchase Bill ${bill.billNumber} deleted and stock rolled back`, 'info');
        } else {
          showToast(res.error || 'Failed to void Purchase Bill', 'error');
        }
        onBillUpdated();
        if (selectedBill?.id === bill.id) {
          setIsDetailModalOpen(false);
          setIsPrintModalOpen(false);
        }
      }
    });
  };

  const totalInwardValue = purchaseBills.reduce((acc, b) => acc + (b.grandTotal || 0), 0);
  const totalItemsCount = purchaseBills.reduce((acc, b) => acc + (b.items?.length || 0), 0);

  return (
    <div className="flex-1 bg-[#f0f4f8] p-6 overflow-y-auto flex flex-col justify-between select-none">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-100 rounded-xl text-indigo-700">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Purchase Bills (Inward Invoices)</h1>
                <p className="text-xs text-slate-500 font-medium">Record received stock from suppliers to credit inventory & update payables</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onCreateBill}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-md transition cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Create Purchase Bill</span>
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Purchase Bills</div>
              <div className="text-2xl font-black text-slate-800 mt-1">{purchaseBills.length}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Inward Value</div>
              <div className="text-2xl font-black text-emerald-600 mt-1">
                Rs. {totalInwardValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              Rs
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Products Received</div>
              <div className="text-2xl font-black text-indigo-600 mt-1">
                {totalItemsCount}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <PackageCheck className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by supplier bill # or supplier name..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="text-xs font-semibold text-slate-500 shrink-0">
            Showing <span className="text-slate-900 font-bold">{filteredBills.length}</span> bill(s)
          </div>
        </div>

        {/* Purchase Bills Table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {filteredBills.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 mb-1">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <div className="text-sm font-bold text-slate-700">No Purchase Bills Found</div>
              <p className="text-xs text-slate-400 max-w-sm">
                Record received stock from your suppliers by creating a new Purchase Bill.
              </p>
              <button
                onClick={onCreateBill}
                className="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm cursor-pointer"
              >
                Create Purchase Bill
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Bill #</th>
                    <th className="py-3 px-4">Bill Date</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4">Items Count</th>
                    <th className="py-3 px-4 text-right">Total Bill Cost</th>
                    <th className="py-3 px-4 text-center">Stock Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredBills.map(bill => (
                    <tr key={bill.id || bill.billId} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4 font-bold text-slate-900 font-mono">
                        {bill.billNumber}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-mono">
                        {bill.billDate}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{bill.supplierName}</div>
                        {bill.supplierPhone && <div className="text-[10px] text-slate-400">{bill.supplierPhone}</div>}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-600">
                        {bill.items?.length || 0} item(s)
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-slate-900">
                        Rs. {(bill.grandTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-emerald-100 text-emerald-800">
                          STOCK ADDED
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedBill(bill);
                              setIsDetailModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                            title="View Bill Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => {
                              setSelectedBill(bill);
                              setIsPrintModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                            title="Print Goods Receipt Document"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteBill(bill)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                            title="Delete Bill Record"
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
      {isDetailModalOpen && selectedBill && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                <span className="font-bold text-sm">Purchase Bill Details - {selectedBill.billNumber}</span>
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
                  <div className="font-bold text-slate-800 text-sm mt-0.5">{selectedBill.supplierName}</div>
                  {selectedBill.supplierPhone && <div className="text-slate-500">{selectedBill.supplierPhone}</div>}
                </div>
                <div className="text-right">
                  <div className="text-slate-400 font-semibold uppercase text-[10px]">Bill Date</div>
                  <div className="font-bold text-slate-800 text-sm mt-0.5">{selectedBill.billDate}</div>
                  <div className="text-emerald-600 font-bold uppercase text-[10px] mt-0.5">Inventory Credited</div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">Inward Items Breakdown</h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-bold">
                      <tr>
                        <th className="py-2 px-3">Item Description</th>
                        <th className="py-2 px-3 text-center">Inward Qty</th>
                        <th className="py-2 px-3 text-right">Purchase Rate</th>
                        <th className="py-2 px-3 text-right">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedBill.items?.map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-semibold text-slate-800">{item.itemName}</td>
                          <td className="py-2 px-3 text-center font-mono">{item.quantity} {item.unitType || 'PCS'}</td>
                          <td className="py-2 px-3 text-right font-mono">Rs. {item.unitPrice || item.purchasePrice}</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900 font-mono">Rs. {item.totalAmount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedBill.notes && (
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs text-slate-700">
                  <span className="font-bold block mb-0.5">Bill Notes:</span>
                  {selectedBill.notes}
                </div>
              )}

              <div className="border-t border-slate-200 pt-3 flex flex-col items-end gap-1 text-xs">
                <div className="flex justify-between w-48 font-black text-slate-900 text-sm border-slate-200">
                  <span>Grand Total Bill:</span>
                  <span className="text-blue-600">Rs. {selectedBill.grandTotal}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setIsPrintModalOpen(true);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Goods Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT PURCHASE BILL RECEIPT MODAL (A4 Professional Template) */}
      {isPrintModalOpen && selectedBill && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white px-6 py-3.5 flex items-center justify-between">
              <span className="font-bold text-sm flex items-center gap-2">
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>Print A4 Purchase Bill / Goods Receipt</span>
              </span>
              <button onClick={() => setIsPrintModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[80vh]">
              <div id="bill-print-area" className="bg-white p-8 font-sans text-slate-900 border border-slate-300 rounded-xl shadow-xs space-y-6">
                <div className="flex justify-between items-start border-b border-slate-300 pb-6">
                  <div className="space-y-1">
                    <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{business.name || 'Company Name'}</h1>
                    <p className="text-xs text-slate-600 font-medium">{business.address || 'Store Location / Street Address'}</p>
                    <p className="text-xs text-slate-600">Phone: {business.phone || '+92 300 0000000'}</p>
                    {business.gstin && <p className="text-xs text-slate-600 font-mono font-semibold">{business.gstin}</p>}
                  </div>

                  <div className="flex flex-col items-end space-y-3">
                    <h2 className="text-3xl font-black text-slate-800 uppercase tracking-wider">PURCHASE BILL</h2>
                    
                    <table className="border-collapse border border-slate-400 text-[11px] font-sans w-64 text-center">
                      <thead>
                        <tr className="bg-slate-200 text-slate-800 font-bold uppercase border-b border-slate-400">
                          <th className="py-1 px-2 border-r border-slate-400">BILL #</th>
                          <th className="py-1 px-2">DATE</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-slate-400 font-mono font-bold">
                          <td className="py-1 px-2 border-r border-slate-400 text-slate-900">{selectedBill.billNumber}</td>
                          <td className="py-1 px-2 text-slate-900">{selectedBill.billDate}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <div className="bg-slate-200 border border-slate-400 px-3 py-1.5 font-bold text-xs uppercase tracking-wider text-slate-800 mb-2">
                    SUPPLIER VENDOR DETAILS
                  </div>
                  <div className="px-2 text-xs space-y-0.5">
                    <div className="font-bold text-slate-900 text-sm">{selectedBill.supplierName}</div>
                    {selectedBill.supplierPhone && <div className="text-slate-600">Phone: {selectedBill.supplierPhone}</div>}
                  </div>
                </div>

                <div className="border border-slate-400 rounded-xs overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-200 text-slate-800 font-extrabold uppercase border-b border-slate-400">
                        <th className="py-2 px-3 border-r border-slate-400">INWARD PRODUCT</th>
                        <th className="py-2 px-3 text-center border-r border-slate-400 w-20">QTY</th>
                        <th className="py-2 px-3 text-right border-r border-slate-400 w-28">RATE</th>
                        <th className="py-2 px-3 text-right w-32">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      {selectedBill.items?.map((item, idx) => (
                        <tr key={idx} className="font-medium text-slate-800">
                          <td className="py-2.5 px-3 border-r border-slate-300 font-bold">{item.itemName}</td>
                          <td className="py-2.5 px-3 text-center border-r border-slate-300 font-mono">{item.quantity} {item.unitType || 'PCS'}</td>
                          <td className="py-2.5 px-3 text-right border-r border-slate-300 font-mono">Rs. {(item.unitPrice || item.purchasePrice || 0).toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">Rs. {(item.totalAmount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between items-start pt-2">
                  <div className="italic text-xs text-slate-600 font-medium">
                    Stock received and credited to warehouse inventory.
                  </div>

                  <table className="border-collapse border border-slate-400 text-xs w-64">
                    <tbody>
                      <tr className="bg-slate-200 border-t-2 border-slate-400">
                        <td className="py-2 px-3 font-black uppercase text-slate-900 text-sm">TOTAL BILL COST</td>
                        <td className="py-2 px-3 text-right font-black text-slate-900 text-sm font-mono">
                          Rs. {(selectedBill.grandTotal || 0).toFixed(2)}
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
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Purchase Bill</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
