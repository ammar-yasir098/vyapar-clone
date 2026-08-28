import React, { useState } from 'react';
import { Printer, Download, Cpu, Trash2, RotateCcw } from 'lucide-react';
import { BusinessDetails, Invoice } from '../../types';
import { buildThermalReceiptBytes } from '../../services/printer';
import { clearAllDatabaseData } from '../../db';

interface PrinterModalProps {
  business: BusinessDetails;
}

export const PrinterModal: React.FC<PrinterModalProps> = ({ business }) => {
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('80mm');
  const [cutPaper, setCutPaper] = useState(true);

  // Sample mockup invoice for test printing
  const sampleInvoice: Invoice = {
    invoiceId: 'sample-001',
    tenantId: 'default',
    partyName: 'Sample Customer',
    partyGstin: '35202-1234567-1',
    invoiceNumber: 'INV-2026-0001',
    invoiceDate: new Date().toISOString().split('T')[0],
    items: [
      {
        itemId: 1,
        itemName: 'Sample Product Item',
        hsnSacCode: '1000',
        unitType: 'PCS',
        quantity: 1,
        unitPrice: 100.00,
        purchasePrice: 80,
        cgstRate: 9,
        sgstRate: 9,
        igstRate: 18,
        taxAmount: 18.00,
        totalAmount: 118.00
      }
    ],
    subtotal: 100.00,
    cgstTotal: 9.00,
    sgstTotal: 9.00,
    igstTotal: 0,
    taxTotal: 18.00,
    discountTotal: 0,
    grandTotal: 118.00,
    receivedAmount: 118.00,
    dueAmount: 0,
    paymentStatus: 'PAID',
    paymentMethod: 'CASH',
    createdAt: new Date().toISOString(),
    syncStatus: 'SYNCED'
  };

  const bytes = buildThermalReceiptBytes(sampleInvoice, business, {
    paperWidth,
    showGstin: true,
    cutPaper
  });

  const handleDownloadBin = () => {
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `esc_pos_sample_${paperWidth}.bin`;
    a.click();
  };

  const handleResetData = async () => {
    const activeTenant = business?.tenantId || localStorage.getItem('vyapar_current_tenant') || 'default-tenant';
    if (confirm('Are you sure you want to delete ALL store products, inventory locations, bills, and party data for your store account? This will give you a clean blank database.')) {
      await clearAllDatabaseData(activeTenant);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-5 bg-[#f3f4f6] overflow-y-auto gap-5 select-none">
      <div>
        <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
          <Printer className="w-5 h-5 text-blue-600" />
          <span>Thermal Printer & System Settings</span>
        </h2>
        <p className="text-xs text-slate-500 font-semibold">
          ESC/POS direct byte command encoder & store database management
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Settings Panel */}
        <div className="w-full lg:w-96 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
              <Cpu className="w-4 h-4 text-blue-600" />
              <span>Hardware Driver Configuration</span>
            </h3>

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Paper Roll Width</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPaperWidth('80mm')}
                  className={`py-2 text-xs font-extrabold rounded-lg border transition cursor-pointer ${
                    paperWidth === '80mm'
                      ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  80mm (Standard POS)
                </button>
                <button
                  onClick={() => setPaperWidth('58mm')}
                  className={`py-2 text-xs font-extrabold rounded-lg border transition cursor-pointer ${
                    paperWidth === '58mm'
                      ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  58mm (Compact Mobile)
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <span className="text-xs text-slate-700 font-semibold">Auto Paper Cut Command (GS V 65)</span>
              <input
                type="checkbox"
                checked={cutPaper}
                onChange={e => setCutPaper(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 accent-blue-600 cursor-pointer"
              />
            </div>
          </div>

          {/* Database Reset Section */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-sm">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
              <RotateCcw className="w-4 h-4 text-red-600" />
              <span>Reset Store Database</span>
            </h3>

            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              Wipe all existing demo data and start with a 100% clean database where you add your own products and bills.
            </p>

            <button
              onClick={handleResetData}
              className="btn-vyapar-red w-full py-2.5 text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <Trash2 className="w-4 h-4" />
              <span>CLEAR ALL DATA & START BLANK</span>
            </button>
          </div>

          {/* Test Raw Binary Export */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2 shadow-sm">
            <div className="text-xs font-bold text-slate-700">Raw ESC/POS Command Stream</div>
            <div className="font-mono text-[10px] bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-emerald-400 truncate">
              {Array.from(bytes.slice(0, 30))
                .map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0'))
                .join(' ')}
              ...
            </div>
            <p className="text-[11px] text-slate-500 font-semibold">
              Total Stream Size: <strong className="text-slate-800">{bytes.length} Bytes</strong>
            </p>

            <button
              onClick={handleDownloadBin}
              className="btn-vyapar-outline w-full text-xs font-bold mt-2 cursor-pointer"
            >
              <Download className="w-4 h-4 inline mr-1" />
              <span>Export Raw `.bin` Byte Buffer</span>
            </button>
          </div>
        </div>

        {/* Right Preview Thermal Slip Simulator */}
        <div className="flex-1 flex justify-center items-start pt-2">
          <div
            className="thermal-paper p-5 transition-all shadow-xl"
            style={{ width: paperWidth === '80mm' ? '340px' : '260px' }}
          >
            <div className="text-center font-bold text-sm tracking-wider uppercase">{business.name}</div>
            <div className="text-center text-[10px] leading-tight">{business.address}</div>
            <div className="text-center text-[10px]">Ph: {business.phone}</div>
            <div className="text-center text-[10px]">{business.gstin ? (business.gstin.startsWith('NTN') ? business.gstin : `NTN / Tax ID: ${business.gstin}`) : 'NTN: 1234567-8'}</div>

            <div className="border-t border-dashed border-gray-800 my-2"></div>
            <div className="text-[10px]">
              <div>Inv #: {sampleInvoice.invoiceNumber}</div>
              <div>Date : {sampleInvoice.invoiceDate}</div>
              <div>Cust : {sampleInvoice.partyName}</div>
            </div>

            <div className="border-t border-dashed border-gray-800 my-2"></div>
            <div className="text-[10px] space-y-1">
              {sampleInvoice.items.map((item, idx) => (
                <div key={idx} className="flex justify-between">
                  <div>
                    {item.itemName} x{item.quantity}
                  </div>
                  <div className="font-bold">Rs {Number(item.totalAmount || 0).toFixed(2)}</div>
                </div>
              ))}
            </div>

            <div className="border-t border-dashed border-gray-800 my-2"></div>
            <div className="text-[10px] space-y-0.5 text-right font-mono">
              <div>Subtotal: Rs {Number(sampleInvoice.subtotal || 0).toFixed(2)}</div>
              <div>Tax (GST): Rs {Number(sampleInvoice.taxTotal || 0).toFixed(2)}</div>
              <div className="text-xs font-bold text-black border-t border-gray-800 pt-0.5">
                TOTAL: Rs {Number(sampleInvoice.grandTotal || 0).toFixed(2)}
              </div>
            </div>

            <div className="border-t border-dashed border-gray-800 my-3"></div>
            <div className="text-center text-[9px] uppercase font-bold">
              *** Thermal Print Receipt Verified ***
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
