import React, { useState, useEffect } from 'react';
import { X, Printer, Download, Cpu, FileText, MessageSquare, Loader2, Paperclip, QrCode, CheckCircle2, RefreshCw, ExternalLink } from 'lucide-react';
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
  const [shareMode, setShareMode] = useState<'open_app' | 'background_auto'>('open_app');
  const [shareFeedback, setShareFeedback] = useState<{ type: 'success' | 'error'; message: string; whatsappUrl?: string; whatsappDesktopUrl?: string; filename?: string; mode?: string } | null>(null);
  
  // WhatsApp QR Code & Status State
  const [showQrModal, setShowQrModal] = useState(false);
  const [waStatus, setWaStatus] = useState<{ status: string; qrCodeDataUrl: string | null; connectedPhone: string | null } | null>(null);
  const [loadingWaStatus, setLoadingWaStatus] = useState(false);

  const fetchWhatsAppStatus = async (isInitial = false) => {
    if (isInitial) setLoadingWaStatus(true);
    try {
      const res = await fetch('http://localhost:5000/api/v1/whatsapp/status');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setWaStatus(prev => {
            if (
              prev?.status === data.status &&
              prev?.qrCodeDataUrl === data.qrCodeDataUrl &&
              prev?.connectedPhone === data.connectedPhone
            ) {
              return prev;
            }
            return {
              status: data.status,
              qrCodeDataUrl: data.qrCodeDataUrl,
              connectedPhone: data.connectedPhone
            };
          });
        }
      }
    } catch (err) {
      console.warn('Could not fetch WhatsApp local status:', err);
    } finally {
      if (isInitial) setLoadingWaStatus(false);
    }
  };

  useEffect(() => {
    if (showQrModal) {
      fetchWhatsAppStatus(true);
      const interval = setInterval(() => fetchWhatsAppStatus(false), 3000);
      return () => clearInterval(interval);
    }
  }, [showQrModal]);

  const handleStartWhatsAppService = async () => {
    setLoadingWaStatus(true);
    try {
      await fetch('http://localhost:5000/api/v1/whatsapp/connect', { method: 'POST' });
      await fetchWhatsAppStatus(true);
    } catch (err) {
      console.error('Error starting WhatsApp service:', err);
    } finally {
      setLoadingWaStatus(false);
    }
  };

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
        paperFormat: format,
        preferOpenApp: shareMode === 'open_app'
      });

      const invNumber = invoice.invoiceNumber || 'INV-000';
      const filename = `Invoice_${invNumber}_${format.toUpperCase()}.pdf`;

      if (result.success) {
        setShareFeedback({
          type: 'success',
          message: result.message,
          whatsappUrl: result.whatsappUrl,
          whatsappDesktopUrl: result.whatsappDesktopUrl,
          filename,
          mode: result.mode
        });
      } else {
        setShareFeedback({ type: 'error', message: result.message, whatsappUrl: result.whatsappUrl, whatsappDesktopUrl: result.whatsappDesktopUrl, mode: result.mode });
      }
    } catch (err: any) {
      setShareFeedback({ type: 'error', message: err?.message || 'Failed to share invoice via WhatsApp.' });
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-100 border border-slate-300 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden relative">
        {/* Modal Top Controls Header */}
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
          <div className="flex items-center gap-2 flex-wrap">
            {/* WhatsApp Share Button */}
            <div className="flex items-center bg-emerald-50 border border-emerald-300 rounded-xl p-0.5 shadow-2xs">
              <button
                onClick={handleWhatsAppShare}
                disabled={isSharing}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                title={shareMode === 'open_app' ? 'Opens WhatsApp with customer chat & pre-filled text, PDF downloaded' : 'Sends PDF directly in background via WhatsApp'}
              >
                {isSharing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <MessageSquare className="w-4 h-4 fill-emerald-100 stroke-emerald-600" />
                )}
                <span>{isSharing ? 'Processing...' : 'Share WhatsApp'}</span>
              </button>

              {/* Mode Selector */}
              <select
                value={shareMode}
                onChange={(e) => setShareMode(e.target.value as 'open_app' | 'background_auto')}
                className="bg-transparent text-[11px] font-extrabold text-emerald-900 px-2 py-1 cursor-pointer focus:outline-none border-l border-emerald-300"
                title="Choose WhatsApp Share Mode"
              >
                <option value="open_app">📱 Open WhatsApp App</option>
                <option value="background_auto">⚡ Auto Background</option>
              </select>
            </div>

            {shareMode === 'background_auto' && (
              <button
                onClick={() => setShowQrModal(true)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                title="Link WhatsApp Engine for Background Delivery"
              >
                <QrCode className="w-4 h-4 text-emerald-600" />
              </button>
            )}

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

        {/* Feedback Alert Bar */}
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
            
            <div className="flex items-center gap-2 flex-wrap">
              {shareFeedback.whatsappDesktopUrl && shareFeedback.mode !== 'automated' && (
                <a
                  href={shareFeedback.whatsappDesktopUrl}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors shadow-2xs"
                  title="Open installed WhatsApp Windows Desktop Application"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open WhatsApp App</span>
                </a>
              )}

              {shareFeedback.whatsappUrl && shareFeedback.mode !== 'automated' && (
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

              {shareFeedback.mode !== 'automated' && (
                <button
                  onClick={handleDownloadPDF}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-800 font-bold text-xs transition-colors shadow-2xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Re-download PDF</span>
                </button>
              )}

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

        {/* WhatsApp QR Code Connection Modal */}
        {showQrModal && (
          <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-emerald-600" />
                  <span>Link WhatsApp Engine for Background Auto PDF</span>
                </h3>
                <button
                  onClick={() => setShowQrModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {loadingWaStatus ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs font-bold text-slate-600">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                  <span>Checking local WhatsApp service status...</span>
                </div>
              ) : waStatus?.status === 'CONNECTED' ? (
                <div className="py-6 flex flex-col items-center justify-center gap-3 text-center">
                  <CheckCircle2 className="w-12 h-12 text-emerald-600" />
                  <div className="text-sm font-extrabold text-slate-900">
                    WhatsApp Engine Connected!
                  </div>
                  <p className="text-xs text-slate-600 max-w-xs">
                    Linked to <span className="font-bold text-emerald-700">+{waStatus.connectedPhone}</span>.
                  </p>
                </div>
              ) : waStatus?.status === 'QR_READY' && waStatus.qrCodeDataUrl ? (
                <div className="flex flex-col items-center justify-center gap-3 text-center">
                  <div className="p-2 bg-white border border-slate-300 rounded-xl shadow-xs">
                    <img src={waStatus.qrCodeDataUrl} alt="WhatsApp QR Code" className="w-48 h-48" />
                  </div>
                  <div className="text-xs text-slate-700 font-semibold space-y-1 text-left bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div className="font-bold text-slate-900 mb-1 text-center">How to link your WhatsApp (1-Time):</div>
                    <div>1. Open WhatsApp on your phone.</div>
                    <div>2. Tap <span className="font-bold">Settings ➔ Linked Devices</span>.</div>
                    <div>3. Tap <span className="font-bold">Link a Device</span> and scan this QR code!</div>
                  </div>
                </div>
              ) : (
                <div className="py-6 flex flex-col items-center justify-center gap-3 text-center">
                  <p className="text-xs text-slate-600">
                    WhatsApp local engine is disconnected. Click below to start the service and generate your QR code.
                  </p>
                  <button
                    onClick={handleStartWhatsAppService}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Start WhatsApp Service & Generate QR</span>
                  </button>
                </div>
              )}

              <div className="flex justify-end pt-3 border-t border-slate-200">
                <button
                  onClick={() => setShowQrModal(false)}
                  className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
                >
                  Close Window
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
