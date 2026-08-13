import React, { useState } from 'react';
import { 
  FileText, 
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
  Download,
  Building2
} from 'lucide-react';
import { Estimate, BusinessDetails } from '../../types';
import { db } from '../../db';
import { useToast } from '../Common/ToastContext';

interface EstimateListScreenProps {
  estimates: Estimate[];
  business: BusinessDetails;
  onCreateEstimate: () => void;
  onEstimateUpdated: () => void;
}

export const EstimateListScreen: React.FC<EstimateListScreenProps> = ({
  estimates,
  business,
  onCreateEstimate,
  onEstimateUpdated
}) => {
  const { showToast, showConfirm } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEstimate, setSelectedEstimate] = useState<Estimate | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Search filtering
  const filteredEstimates = estimates.filter(est => 
    est.estimateNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    est.partyName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDeleteEstimate = async (id?: number) => {
    if (!id) return;
    showConfirm({
      title: 'Delete Quotation',
      message: 'Are you sure you want to delete this estimate/quotation?',
      type: 'danger',
      confirmText: 'Yes, Delete',
      onConfirm: async () => {
        await db.estimates.delete(id);
        showToast('Quotation deleted successfully', 'info');
        onEstimateUpdated();
        if (selectedEstimate?.id === id) {
          setIsDetailModalOpen(false);
          setIsPrintModalOpen(false);
        }
      }
    });
  };

  const handlePrintQuotation = (est: Estimate) => {
    setSelectedEstimate(est);
    setIsPrintModalOpen(true);
  };

  return (
    <div className="flex-1 bg-[#f0f4f8] p-6 overflow-y-auto flex flex-col justify-between select-none">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-amber-100 rounded-xl text-amber-700">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Estimates & Quotations</h1>
                <p className="text-xs text-slate-500 font-medium">Non-financial pricing quotations for clients (No stock deduction)</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onCreateEstimate}
              className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-md transition cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span> Create Estimate / Quotation</span>
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Quotations</div>
              <div className="text-2xl font-black text-slate-800 mt-1">{estimates.length}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Quoted Total Value</div>
              <div className="text-2xl font-black text-emerald-600 mt-1">
                Rs. {estimates.reduce((acc, est) => acc + (est.grandTotal || 0), 0).toLocaleString()}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              Rs
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Open Quotations</div>
              <div className="text-2xl font-black text-blue-600 mt-1">
                {estimates.filter(e => e.status === 'OPEN').length}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by estimate number or customer name..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div className="text-xs font-semibold text-slate-500 shrink-0">
            Showing <span className="text-slate-900 font-bold">{filteredEstimates.length}</span> estimate(s)
          </div>
        </div>

        {/* Estimates Table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {filteredEstimates.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 mb-1">
                <FileText className="w-8 h-8" />
              </div>
              <div className="text-sm font-bold text-slate-700">No Estimates / Quotations Found</div>
              <p className="text-xs text-slate-400 max-w-sm">
                Create your first pricing quotation for a client by clicking the button below.
              </p>
              <button
                onClick={onCreateEstimate}
                className="mt-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm cursor-pointer"
              >
                 Create Estimate / Quotation
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Estimate #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Items Count</th>
                    <th className="py-3 px-4 text-right">Quoted Amount</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredEstimates.map(est => (
                    <tr key={est.id || est.estimateId} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4 font-bold text-slate-900 font-mono">
                        {est.estimateNumber}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-mono">
                        {est.estimateDate}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{est.partyName}</div>
                        {est.partyPhone && <div className="text-[10px] text-slate-400">{est.partyPhone}</div>}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-600">
                        {est.items?.length || 0} item(s)
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-slate-900">
                        Rs. {(est.grandTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-amber-100 text-amber-800">
                          {est.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedEstimate(est);
                              setIsDetailModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handlePrintQuotation(est)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition cursor-pointer"
                            title="Print Quotation Receipt"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteEstimate(est.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                            title="Delete Estimate"
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
      {isDetailModalOpen && selectedEstimate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 border border-slate-200">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-400" />
                <span className="font-bold text-sm">Quotation Details - {selectedEstimate.estimateNumber}</span>
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
                  <div className="text-slate-400 font-semibold uppercase text-[10px]">Customer / Client</div>
                  <div className="font-bold text-slate-800 text-sm mt-0.5">{selectedEstimate.partyName}</div>
                  {selectedEstimate.partyPhone && <div className="text-slate-500">{selectedEstimate.partyPhone}</div>}
                </div>
                <div className="text-right">
                  <div className="text-slate-400 font-semibold uppercase text-[10px]">Quotation Date</div>
                  <div className="font-bold text-slate-800 text-sm mt-0.5">{selectedEstimate.estimateDate}</div>
                  <div className="text-amber-600 font-bold uppercase text-[10px] mt-0.5">Non-Financial Estimate</div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">Quoted Items</h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-bold">
                      <tr>
                        <th className="py-2 px-3">Item Description</th>
                        <th className="py-2 px-3 text-center">Qty</th>
                        <th className="py-2 px-3 text-right">Rate</th>
                        <th className="py-2 px-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedEstimate.items?.map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-semibold text-slate-800">{item.itemName}</td>
                          <td className="py-2 px-3 text-center font-mono">{item.quantity} {item.unitType || 'PCS'}</td>
                          <td className="py-2 px-3 text-right font-mono">Rs. {item.unitPrice}</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900 font-mono">Rs. {item.totalAmount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 flex flex-col items-end gap-1 text-xs">
                <div className="flex justify-between w-48 font-medium text-slate-600">
                  <span>Subtotal:</span>
                  <span>Rs. {selectedEstimate.subtotal}</span>
                </div>
                <div className="flex justify-between w-48 font-black text-slate-900 text-sm pt-1 border-t border-slate-200">
                  <span>Grand Total:</span>
                  <span className="text-emerald-600">Rs. {selectedEstimate.grandTotal}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => handlePrintQuotation(selectedEstimate)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Quotation</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT QUOTATION RECEIPT MODAL (A4 Professional Template) */}
      {isPrintModalOpen && selectedEstimate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white px-6 py-3.5 flex items-center justify-between">
              <span className="font-bold text-sm flex items-center gap-2">
                <Printer className="w-4 h-4 text-amber-400" />
                <span>Print Professional A4 Quotation</span>
              </span>
              <button onClick={() => setIsPrintModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[80vh]">
              {/* Professional A4 Quotation Template */}
              <div id="quotation-print-area" className="bg-white p-8 font-sans text-slate-900 border border-slate-300 rounded-xl shadow-xs space-y-6">
                {/* Header: Store Details Left, QUOTATION & Metadata Right */}
                <div className="flex justify-between items-start border-b border-slate-300 pb-6">
                  <div className="space-y-1">
                    <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{business.name || 'Company Name'}</h1>
                    <p className="text-xs text-slate-600 font-medium">{business.address || 'Store Location / Street Address'}</p>
                    <p className="text-xs text-slate-600">Phone: {business.phone || '+92 300 0000000'}</p>
                    {business.email && <p className="text-xs text-slate-600">Email: {business.email}</p>}
                    {business.gstin && <p className="text-xs text-slate-600 font-mono font-semibold">{business.gstin}</p>}
                  </div>

                  <div className="flex flex-col items-end space-y-3">
                    <h2 className="text-3xl font-black text-slate-800 uppercase tracking-wider">QUOTATION</h2>
                    
                    {/* Quote Metadata Table Box */}
                    <table className="border-collapse border border-slate-400 text-[11px] font-sans w-64 text-center">
                      <thead>
                        <tr className="bg-slate-200 text-slate-800 font-bold uppercase border-b border-slate-400">
                          <th className="py-1 px-2 border-r border-slate-400">QUOTE #</th>
                          <th className="py-1 px-2">DATE</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-slate-400 font-mono font-bold">
                          <td className="py-1 px-2 border-r border-slate-400 text-slate-900">{selectedEstimate.estimateNumber}</td>
                          <td className="py-1 px-2 text-slate-900">{selectedEstimate.estimateDate}</td>
                        </tr>
                        <tr className="bg-slate-200 text-slate-800 font-bold uppercase border-b border-slate-400">
                          <th className="py-1 px-2 border-r border-slate-400">CUSTOMER ID</th>
                          <th className="py-1 px-2">VALID UNTIL</th>
                        </tr>
                        <tr className="font-mono font-bold">
                          <td className="py-1 px-2 border-r border-slate-400 text-slate-900">{selectedEstimate.partyId ? `CUST-${selectedEstimate.partyId}` : 'WALK-IN'}</td>
                          <td className="py-1 px-2 text-slate-900">30 Days</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* CUSTOMER INFO SECTION */}
                <div>
                  <div className="bg-slate-200 border border-slate-400 px-3 py-1.5 font-bold text-xs uppercase tracking-wider text-slate-800 mb-2">
                    CUSTOMER INFO
                  </div>
                  <div className="px-2 text-xs space-y-0.5">
                    <div className="font-bold text-slate-900 text-sm">{selectedEstimate.partyName}</div>
                    {selectedEstimate.partyPhone && <div className="text-slate-600">Phone: {selectedEstimate.partyPhone}</div>}
                    {selectedEstimate.partyGstin && <div className="text-slate-600 font-mono">GSTIN/NTN: {selectedEstimate.partyGstin}</div>}
                  </div>
                </div>

                {/* ITEMIZED COSTS TABLE */}
                <div className="border border-slate-400 rounded-xs overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-200 text-slate-800 font-extrabold uppercase border-b border-slate-400">
                        <th className="py-2 px-3 border-r border-slate-400">ITEMIZED COSTS</th>
                        <th className="py-2 px-3 text-center border-r border-slate-400 w-20">QTY</th>
                        <th className="py-2 px-3 text-right border-r border-slate-400 w-28">UNIT PRICE</th>
                        <th className="py-2 px-3 text-right w-32">AMOUNT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      {selectedEstimate.items?.map((item, idx) => (
                        <tr key={idx} className="font-medium text-slate-800">
                          <td className="py-2.5 px-3 border-r border-slate-300 font-bold">{item.itemName}</td>
                          <td className="py-2.5 px-3 text-center border-r border-slate-300 font-mono">{item.quantity} {item.unitType || 'PCS'}</td>
                          <td className="py-2.5 px-3 text-right border-r border-slate-300 font-mono">Rs. {(item.unitPrice || 0).toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">Rs. {(item.totalAmount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* FINANCIAL TOTALS SUMMARY */}
                <div className="flex justify-between items-start pt-2">
                  <div className="italic text-xs text-slate-600 font-medium">
                    Thank you for your business!
                  </div>

                  <table className="border-collapse border border-slate-400 text-xs w-64">
                    <tbody>
                      <tr className="border-b border-slate-300">
                        <td className="py-1.5 px-3 font-extrabold uppercase bg-slate-100 text-slate-700">SUBTOTAL</td>
                        <td className="py-1.5 px-3 text-right font-bold font-mono">Rs. {(selectedEstimate.subtotal || 0).toFixed(2)}</td>
                      </tr>
                      {selectedEstimate.discountTotal > 0 && (
                        <tr className="border-b border-slate-300">
                          <td className="py-1.5 px-3 font-extrabold uppercase bg-slate-100 text-slate-700">DISCOUNT</td>
                          <td className="py-1.5 px-3 text-right font-bold font-mono text-red-600">- Rs. {(selectedEstimate.discountTotal || 0).toFixed(2)}</td>
                        </tr>
                      )}
                      <tr className="bg-slate-200 border-t-2 border-slate-400">
                        <td className="py-2 px-3 font-black uppercase text-slate-900 text-sm">TOTAL QUOTE</td>
                        <td className="py-2 px-3 text-right font-black text-slate-900 text-sm font-mono">
                          Rs. {(selectedEstimate.grandTotal || 0).toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* TERMS & SIGNATURE SECTION */}
                <div className="border-t border-slate-300 pt-4 space-y-4">
                  <p className="text-[10px] text-slate-600 leading-normal text-justify">
                    This quotation is not a contract or a bill. It is our best guess at the total price for the service and goods described above. The customer will be billed after indicating acceptance of this quote. Payment will be due prior to the delivery of service and goods.
                  </p>

                  <div>
                    <div className="text-[10px] font-bold uppercase text-slate-700 mb-1">Customer Acceptance</div>
                    <table className="w-full border-collapse border border-slate-400 text-[10px]">
                      <tbody>
                        <tr>
                          <td className="h-8 border-r border-slate-400 w-1/2 p-1 align-bottom text-slate-400">Signature</td>
                          <td className="h-8 border-r border-slate-400 w-1/4 p-1 align-bottom text-slate-400">Printed Name</td>
                          <td className="h-8 w-1/4 p-1 align-bottom text-slate-400">Date</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="text-[10px] text-center text-slate-500 pt-2 border-t border-slate-200">
                    If you have any questions, please contact {business.name || 'our store'} ({business.phone || business.email || 'Customer Support'})
                  </div>
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
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Full A4 Quotation</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
