import React from 'react';
import { BarChart3, TrendingUp, DollarSign, Receipt, Percent } from 'lucide-react';
import { Invoice } from '../../types';

interface ReportsScreenProps {
  invoices: Invoice[];
}

export const ReportsScreen: React.FC<ReportsScreenProps> = ({ invoices }) => {
  const totalSales = invoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
  const totalTaxCollected = invoices.reduce((sum, inv) => sum + inv.taxTotal, 0);
  const totalInvoices = invoices.length;
  const averageTicket = totalInvoices > 0 ? totalSales / totalInvoices : 0;

  const totalCgst = invoices.reduce((sum, inv) => sum + inv.cgstTotal, 0);
  const totalSgst = invoices.reduce((sum, inv) => sum + inv.sgstTotal, 0);

  return (
    <div className="flex-1 flex flex-col p-4 bg-[#0d1322] overflow-auto gap-4 select-none">
      <div>
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-400" />
          <span>Tax & Daily Financial Reports</span>
        </h2>
        <p className="text-xs text-slate-400">GST collection & total revenue breakdown</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-950 text-emerald-400 flex items-center justify-center border border-emerald-800">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Total Gross Sales</div>
            <div className="text-lg font-mono font-extrabold text-emerald-400">
              ₹{totalSales.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-950 text-blue-400 flex items-center justify-center border border-blue-800">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Total Bills Generated</div>
            <div className="text-lg font-mono font-extrabold text-slate-100">{totalInvoices}</div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-950 text-purple-400 flex items-center justify-center border border-purple-800">
            <Percent className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Total GST Collected</div>
            <div className="text-lg font-mono font-extrabold text-purple-400">
              ₹{totalTaxCollected.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-950 text-amber-400 flex items-center justify-center border border-amber-800">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Average Bill Value</div>
            <div className="text-lg font-mono font-extrabold text-amber-400">
              ₹{averageTicket.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Tax Breakdown Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
          GST Tax Liability Summary (GSTR-1 Ready)
        </h3>
        <div className="grid grid-cols-3 gap-4 font-mono text-xs">
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <div className="text-slate-400 mb-1">Central GST (CGST)</div>
            <div className="text-base font-bold text-slate-200">₹{totalCgst.toFixed(2)}</div>
          </div>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <div className="text-slate-400 mb-1">State GST (SGST)</div>
            <div className="text-base font-bold text-slate-200">₹{totalSgst.toFixed(2)}</div>
          </div>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <div className="text-slate-400 mb-1">Integrated GST (IGST)</div>
            <div className="text-base font-bold text-slate-200">₹0.00</div>
          </div>
        </div>
      </div>
    </div>
  );
};
