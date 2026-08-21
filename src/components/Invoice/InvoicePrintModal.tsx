import React, { useState } from 'react';
import { X, Printer, Download, Cpu, FileText, MessageSquare, Loader2, Paperclip } from 'lucide-react';
import { Invoice, BusinessDetails } from '../../types';
import { A4InvoiceTemplate } from './templates/A4InvoiceTemplate';
import { ThermalReceiptTemplate } from './templates/ThermalReceiptTemplate';
import { triggerThermalPrint } from '../../services/printer';
import { shareInvoiceViaWhatsApp, generateInvoicePdfBlob, downloadPdfBlob } from '../../utils/whatsappShare';

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
  const [isSharing, setIsSharing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<{ type: 'success' | 'error'; message: string; whatsappUrl?: string; filename?: string } | null>(null);

  const handleBrowserPrint = () => {
    window.print();
  };

  const handleDirectThermalPrint = () => {
    const paperWidth = format === '58mm' ? '58mm' : '80mm';
    triggerThermalPrint(invoice, business, paperWidth);
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById('printable-invoice');
    if (!element) return;
    
    setIsDownloading(true);
    try {
      const invNumber = invoice.invoiceNumber || 'INV-000';
      const filename = `Invoice_${invNumber}_${format.toUpperCase()}.pdf`;
      const blob = await generateInvoicePdfBlob(element, filename, format);
      downloadPdfBlob(blob, filename);
    } catch (err) {
      console.error('PDF download error:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleWhatsAppShare = async () => {
    const element = document.getElementById('printable-invoice');
    if (!element) {
      setShareFeedback({ type: 'error', message: 'Unable to locate invoice printable area.' });
      return;
    }

    setIsSharing(true);
    setShareFeedback(null);
    try {
      const result = await shareInvoiceViaWhatsApp({
        invoice,
        business,
        targetElement: element,
        paperFormat: format
      });

      const invNumber = invoice.invoiceNumber || 'INV-000';
      const filename = `Invoice_${invNumber}_${format.toUpperCase()}.pdf`;

      if (result.success) {
        setShareFeedback({
          type: 'success',
          message: `PDF (${format.toUpperCase()}) downloaded! In WhatsApp, click 📎 (Attach Document) or drag & drop the PDF.`,
          whatsappUrl: result.whatsappUrl,
          filename
        });
      } else {
        setShareFeedback({ type: 'error', message: result.message, whatsappUrl: result.whatsappUrl });
      }
    } catch (err: any) {
      setShareFeedback({ type: 'error', message: err?.message || 'Failed to share invoice via WhatsApp.' });
    } finally {
      setIsSharing(false);
    }
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
              onClick={handleWhatsAppShare}
              disabled={isSharing}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs disabled:opacity-60 disabled:cursor-not-allowed"
              title="Generate PDF & Share directly on WhatsApp"
            >
              {isSharing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MessageSquare className="w-4 h-4 fill-emerald-100 stroke-emerald-600" />
              )}
              <span>{isSharing ? 'Generating PDF...' : 'Share WhatsApp'}</span>
            </button>

            <button
              onClick={handleBrowserPrint}
              className="btn-vyapar-blue text-xs font-bold cursor-pointer"
            >
              <Printer className="w-4 h-4 mr-1 inline" />
              <span>Print Invoice</span>
            </button>

            {(format === '80mm' || format === '58mm') && (
              <button
                onClick={handleDirectThermalPrint}
                className="btn-vyapar-red text-xs font-bold cursor-pointer"
                title="Send ESC/POS commands directly to printer slip window"
              >
                <Cpu className="w-4 h-4 mr-1 inline" />
                <span>ESC/POS Slip</span>
              </button>
            )}

            <button
              onClick={handleDownloadPDF}
              disabled={isDownloading}
              className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs disabled:opacity-60"
            >
              {isDownloading ? <Loader2 className="w-4 h-4 animate-spin text-emerald-600" /> : <Download className="w-4 h-4 text-emerald-600" />}
              <span>{isDownloading ? 'Generating...' : 'Download PDF'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Feedback Alert Bar with Clear WhatsApp Attachment Instructions */}
        {shareFeedback && (
          <div
            className={`no-print px-6 py-3 text-xs font-semibold flex flex-wrap items-center justify-between gap-2 border-b ${
              shareFeedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : 'bg-rose-50 text-rose-900 border-rose-200'
            }`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Paperclip className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{shareFeedback.message}</span>
            </div>
            
            <div className="flex items-center gap-2">
              {shareFeedback.whatsappUrl && (
                <a
                  href={shareFeedback.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors shadow-2xs"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Open WhatsApp Web</span>
                </a>
              )}

              <button
                onClick={handleDownloadPDF}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-800 font-bold text-xs transition-colors shadow-2xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                <span>Re-download PDF</span>
              </button>

              <button
                onClick={() => setShareFeedback(null)}
                className="text-xs font-bold underline cursor-pointer ml-2 text-slate-600 hover:text-slate-900"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

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
