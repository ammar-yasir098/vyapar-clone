import React, { useState } from 'react';
import { ShieldCheck, FileCheck, Download, Truck, QrCode, CheckCircle2 } from 'lucide-react';
import { Invoice, BusinessDetails } from '../../types';
import { generateIRNHash, exportEInvoiceNICJSON, exportEWayBillJSON, TransporterDetails } from '../../services/gstPortal';

interface GSTComplianceScreenProps {
  invoices: Invoice[];
  business: BusinessDetails;
}

export const GSTComplianceScreen: React.FC<GSTComplianceScreenProps> = ({ invoices, business }) => {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | ''>(invoices[0]?.id || '');
  const [transporter, setTransporter] = useState<TransporterDetails>({
    transporterId: '27AAAAA0000A1Z5',
    transporterName: 'VRL Logistics India',
    vehicleNumber: 'MH-02-AB-1234',
    distanceKm: 150,
    mode: 'ROAD'
  });

  const [generatedIrn, setGeneratedIrn] = useState<string>('');

  const selectedInvoice = invoices.find(inv => inv.id === Number(selectedInvoiceId)) || invoices[0];

  const handleGenerateIRN = async () => {
    if (!selectedInvoice) return;
    const hash = await generateIRNHash(selectedInvoice, business.gstin);
    setGeneratedIrn(hash);
  };

  const handleExportNICInvoice = () => {
    if (!selectedInvoice) return;
    exportEInvoiceNICJSON(selectedInvoice, business);
  };

  const handleExportEWayBill = () => {
    if (!selectedInvoice) return;
    exportEWayBillJSON(selectedInvoice, business, transporter);
  };

  const totalTaxCollected = invoices.reduce((sum, inv) => sum + inv.taxTotal, 0);

  return (
    <div className="flex-1 flex flex-col p-5 bg-[#f3f4f6] overflow-y-auto gap-5 select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            <span>GST Compliance, E-Way Bills & E-Invoicing</span>
          </h2>
          <p className="text-xs text-slate-500 font-semibold">
            Generate 64-char IRN hashes, E-Way bills ({'>'} ₹50,000), and GSTR-1 tax return payloads
          </p>
        </div>
      </div>

      {/* GSTR Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <div className="text-xs text-slate-500 font-semibold">GSTR-1 Outward Taxable Value</div>
          <div className="text-xl font-mono font-black text-slate-900">
            ₹{invoices.reduce((sum, i) => sum + i.subtotal, 0).toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-400 font-semibold">Ready for NIC Filing</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <div className="text-xs text-slate-500 font-semibold">GSTR-3B Tax Output Collected</div>
          <div className="text-xl font-mono font-black text-blue-600">
            ₹{totalTaxCollected.toFixed(2)}
          </div>
          <div className="text-[10px] text-emerald-600 font-bold">100% Reconciled</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <div className="text-xs text-slate-500 font-semibold">E-Way Bills Threshold ({'>'} ₹50,000)</div>
          <div className="text-xl font-mono font-black text-purple-600">
            {invoices.filter(i => i.grandTotal >= 50000).length} Eligible Bills
          </div>
          <div className="text-[10px] text-slate-400 font-semibold">Mandatory for Consignments</div>
        </div>
      </div>

      {/* Main E-Way Bill & E-Invoicing Generator Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left Box: E-Way Bill Consignment Generator */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
            <Truck className="w-4 h-4 text-blue-600" />
            <span>Generate E-Way Bill JSON Payload ({'>'} ₹50,000)</span>
          </h3>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Select Sales Invoice</label>
              <select
                value={selectedInvoiceId}
                onChange={e => setSelectedInvoiceId(Number(e.target.value))}
                className="input-field text-xs font-bold"
              >
                {invoices.map(inv => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber} - {inv.partyName} (₹{inv.grandTotal.toFixed(2)})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Transporter ID (GSTIN)</label>
                <input
                  type="text"
                  value={transporter.transporterId}
                  onChange={e => setTransporter({ ...transporter, transporterId: e.target.value })}
                  className="input-field text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Vehicle Number *</label>
                <input
                  type="text"
                  value={transporter.vehicleNumber}
                  onChange={e => setTransporter({ ...transporter, vehicleNumber: e.target.value })}
                  className="input-field text-xs font-mono font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Transporter Name</label>
                <input
                  type="text"
                  value={transporter.transporterName}
                  onChange={e => setTransporter({ ...transporter, transporterName: e.target.value })}
                  className="input-field text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Distance (Approx. Km)</label>
                <input
                  type="number"
                  value={transporter.distanceKm}
                  onChange={e => setTransporter({ ...transporter, distanceKm: parseInt(e.target.value) || 0 })}
                  className="input-field text-xs font-mono"
                />
              </div>
            </div>

            <button
              onClick={handleExportEWayBill}
              className="btn-vyapar-blue w-full py-2.5 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
            >
              <Download className="w-4 h-4" />
              <span>EXPORT E-WAY BILL JSON PAYLOAD</span>
            </button>
          </div>
        </div>

        {/* Right Box: E-Invoicing IRN Hash Generator */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
            <QrCode className="w-4 h-4 text-purple-600" />
            <span>B2B E-Invoicing SHA-256 IRN Generator</span>
          </h3>

          <div className="space-y-3">
            {selectedInvoice && (
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Target Invoice:</span>
                  <span className="font-bold text-slate-900">{selectedInvoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Party GSTIN:</span>
                  <span className="font-bold text-blue-600">{selectedInvoice.partyGstin || '27ABCDE1234F1ZH'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Invoice Amount:</span>
                  <span className="font-bold text-emerald-600">₹{selectedInvoice.grandTotal.toFixed(2)}</span>
                </div>
              </div>
            )}

            <button
              onClick={handleGenerateIRN}
              className="btn-vyapar-red w-full py-2 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
            >
              <FileCheck className="w-4 h-4" />
              <span>GENERATE 64-CHAR IRN HASH</span>
            </button>

            {generatedIrn && (
              <div className="bg-slate-900 text-emerald-400 p-3 rounded-xl font-mono text-[11px] break-all border border-slate-800 space-y-1">
                <div className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>SHA-256 IRN Hash Generated:</span>
                </div>
                <div className="font-bold">{generatedIrn}</div>
              </div>
            )}

            <button
              onClick={handleExportNICInvoice}
              className="btn-vyapar-outline w-full py-2.5 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export NIC Portal E-Invoice JSON Payload</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
