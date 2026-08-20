import React, { useState } from 'react';
import { X, Printer, Download, Cpu, FileText } from 'lucide-react';
import { Invoice, BusinessDetails } from '../../types';
import { A4InvoiceTemplate } from './templates/A4InvoiceTemplate';
import { ThermalReceiptTemplate } from './templates/ThermalReceiptTemplate';
import { triggerThermalPrint } from '../../services/printer';

export type InvoiceFormat = 'a4' | 'a5' | '80mm' | '58mm';

interface InvoicePrintModalProps {
  invoice: Invoice;
  business: BusinessDetails;
  onClose: () => void;
  defaultFormat?: InvoiceFormat;
}

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({
  invoice,
  business,
  onClose,
  defaultFormat = 'a4'
}) => {
  const [format, setFormat] = useState<InvoiceFormat>(defaultFormat);
  const [customNotes, setCustomNotes] = useState<string>('');

  const handleBrowserPrint = () => {
    window.print();
  };

  const handleDirectThermalPrint = () => {
    const paperWidth = format === '58mm' ? '58mm' : '80mm';
    triggerThermalPrint(invoice, business, paperWidth);
  };

  const handleDownloadPDF = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-100 border border-slate-300 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Top Controls Header (Hidden during printing via no-print class) */}
        <div className="no-print bg-white px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">
                Invoice #{invoice.invoiceNumber || 'INV-000'} Preview
              </h3>
              <p className="text-xs text-slate-500 font-semibold">
                Customer: {invoice.partyName || 'Walk-in'} | Total: Rs {Number(invoice.grandTotal || 0).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Format Toggle Buttons */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setFormat('a4')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                format === 'a4' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              A4 Standard
            </button>
            <button
              onClick={() => setFormat('a5')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                format === 'a5' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              A5 Compact
            </button>
            <button
              onClick={() => setFormat('80mm')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                format === '80mm' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              80mm Thermal
            </button>
            <button
              onClick={() => setFormat('58mm')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                format === '58mm' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              58mm Slip
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleBrowserPrint}
              className="btn-vyapar-blue text-xs font-bold"
            >
              <Printer className="w-4 h-4 mr-1 inline" />
              <span>Print Invoice</span>
            </button>

            {(format === '80mm' || format === '58mm') && (
              <button
                onClick={handleDirectThermalPrint}
                className="btn-vyapar-red text-xs font-bold"
                title="Send ESC/POS commands directly to printer slip window"
              >
                <Cpu className="w-4 h-4 mr-1 inline" />
                <span>ESC/POS Slip</span>
              </button>
            )}

            <button
              onClick={handleDownloadPDF}
              className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              <span>PDF / Print</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Template Container */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-200/60 flex justify-center items-start min-h-[500px]">
          <div id="printable-invoice" className="w-full flex justify-center">
            {format === 'a4' || format === 'a5' ? (
              <A4InvoiceTemplate
                invoice={invoice}
                business={business}
                paperFormat={format}
                customNotes={customNotes}
              />
            ) : (
              <ThermalReceiptTemplate
                invoice={invoice}
                business={business}
                paperWidth={format}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
