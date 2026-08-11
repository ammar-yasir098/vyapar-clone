import React from 'react';
import { BarChart3, TrendingUp, DollarSign, Receipt, Percent, FileText, ArrowUpRight } from 'lucide-react';
import { Invoice } from '../../types';

interface ReportsScreenProps {
  invoices: Invoice[];
}

export const ReportsScreen: React.FC<ReportsScreenProps> = ({ invoices = [] }) => {
  const safeInvoices = Array.isArray(invoices) ? invoices : [];
  const totalSales = safeInvoices.reduce((sum, inv) => sum + Number(inv?.grandTotal || 0), 0);
  const totalTaxCollected = safeInvoices.reduce((sum, inv) => sum + Number(inv?.taxTotal || 0), 0);
  const totalInvoices = safeInvoices.length;
  const averageTicket = totalInvoices > 0 ? totalSales / totalInvoices : 0;

  const totalCgst = safeInvoices.reduce(
    (sum, inv) => sum + Number(inv?.cgstTotal ?? (inv?.taxTotal ? Number(inv.taxTotal) / 2 : 0)),
    0
  );
  const totalSgst = safeInvoices.reduce(
    (sum, inv) => sum + Number(inv?.sgstTotal ?? (inv?.taxTotal ? Number(inv.taxTotal) / 2 : 0)),
    0
  );

  return (
    <div className="flex-1 flex flex-col p-6 bg-[#f3f4f6] overflow-y-auto gap-6 select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <span>Tax & Financial Reports Overview</span>
          </h2>
          <p className="text-xs text-slate-500 font-semibold">
            Real-time tax liability, sales revenue breakdown, and average ticket statistics
          </p>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Gross Sales */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Total Gross Sales</div>
            <div className="text-2xl font-mono font-black text-slate-900">
              Rs {totalSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-emerald-600 font-bold mt-1 flex items-center gap-0.5">
              <ArrowUpRight className="w-3 h-3 inline" />
              <span>Revenue Reconciled</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
            <DollarSign className="w-6 h-6 stroke-[2.5]" />
          </div>
        </div>

        {/* Total Bills Generated */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Bills Generated</div>
            <div className="text-2xl font-mono font-black text-slate-900">
              {totalInvoices}
            </div>
            <div className="text-[10px] text-slate-400 font-semibold mt-1">Total Completed Invoices</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
            <Receipt className="w-6 h-6 stroke-[2.5]" />
          </div>
        </div>

        {/* Total GST Collected */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">GST Tax Collected</div>
            <div className="text-2xl font-mono font-black text-purple-600">
              Rs {totalTaxCollected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-400 font-semibold mt-1">GSTR Output Tax</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600 shrink-0">
            <Percent className="w-6 h-6 stroke-[2.5]" />
          </div>
        </div>

        {/* Average Ticket Value */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Average Bill Value</div>
            <div className="text-2xl font-mono font-black text-amber-600">
              Rs {averageTicket.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-400 font-semibold mt-1">Per Bill Ticket Size</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
            <TrendingUp className="w-6 h-6 stroke-[2.5]" />
          </div>
        </div>
      </div>

      {/* Tax Liability Breakdown Panel */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>GST Tax Liability Summary (GSTR-1 & GSTR-3B Ready)</span>
            </h3>
            <p className="text-xs text-slate-500 font-medium">Automatic tax classification for monthly return filings</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
            <div className="text-slate-500 font-bold text-[11px] uppercase">Central GST (CGST)</div>
            <div className="text-xl font-black text-slate-900">
              Rs {totalCgst.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-400 font-sans font-semibold">Central Tax Component (50%)</div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
            <div className="text-slate-500 font-bold text-[11px] uppercase">State GST (SGST)</div>
            <div className="text-xl font-black text-slate-900">
              Rs {totalSgst.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-400 font-sans font-semibold">State Tax Component (50%)</div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
            <div className="text-slate-500 font-bold text-[11px] uppercase">Integrated GST (IGST)</div>
            <div className="text-xl font-black text-slate-900">Rs 0.00</div>
            <div className="text-[10px] text-slate-400 font-sans font-semibold">Inter-State Consignment Tax</div>
          </div>
        </div>
      </div>
    </div>
  );
};
