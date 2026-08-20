import React from 'react';
import { Invoice, BusinessDetails } from '../../../types';

interface A4InvoiceTemplateProps {
  invoice: Invoice;
  business: BusinessDetails;
  paperFormat?: 'a4' | 'a5';
  customNotes?: string;
}

export const A4InvoiceTemplate: React.FC<A4InvoiceTemplateProps> = ({
  invoice,
  business,
  paperFormat = 'a4',
  customNotes
}) => {
  const isA5 = paperFormat === 'a5';

  const subtotal = Number(invoice.subtotal || 0);
  const taxTotal = Number(invoice.taxTotal || 0);
  const discountTotal = Number(invoice.discountTotal || 0);
  const grandTotal = Number(invoice.grandTotal || 0);
  const receivedAmount = Number(invoice.receivedAmount ?? (invoice.paymentStatus === 'PAID' ? grandTotal : 0));
  const dueAmount = Number(invoice.dueAmount ?? (invoice.paymentStatus === 'PAID' ? 0 : Math.max(0, grandTotal - receivedAmount)));

  const items = Array.isArray(invoice.items) ? invoice.items : [];

  return (
    <div
      className={`bg-white text-slate-900 mx-auto border border-slate-200 shadow-md ${
        isA5 ? 'p-6 max-w-[148mm] text-xs' : 'p-8 max-w-[210mm] text-xs'
      }`}
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* 1. Header / Store Branding Banner */}
      <div className="flex justify-between items-start border-b-2 border-slate-800 pb-5 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">
            {business.name || 'VYAPAR RETAILERS'}
          </h1>
          {business.tagline && (
            <p className="text-xs font-semibold text-slate-500 italic mt-0.5">{business.tagline}</p>
          )}
          <p className="text-xs font-medium text-slate-600 mt-2 max-w-sm leading-relaxed">
            {business.address}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 font-semibold mt-1.5">
            <span>Phone: {business.phone}</span>
            {business.gstin && <span>NTN / GSTIN: <strong className="text-slate-900 font-mono">{business.gstin}</strong></span>}
          </div>
        </div>

        <div className="text-right flex flex-col items-end">
          <span className="px-3 py-1 bg-slate-900 text-white font-extrabold text-xs uppercase tracking-wider rounded mb-2">
            GST TAX INVOICE
          </span>
          <div className="text-xs font-mono font-bold text-slate-800">
            <div>Invoice #: <span className="text-blue-700">{invoice.invoiceNumber || 'INV-0000'}</span></div>
            <div>Date: <span>{invoice.invoiceDate}</span></div>
            <div>Payment: <span className="uppercase text-slate-900">{invoice.paymentMethod || 'CASH'}</span></div>
          </div>
        </div>
      </div>

      {/* 2. Customer & Billing Details */}
      <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
            BILLED TO (CUSTOMER)
          </span>
          <h3 className="font-extrabold text-sm text-slate-900">
            {invoice.partyName || 'Walk-in Retail Customer'}
          </h3>
          {invoice.partyPhone && (
            <p className="text-xs text-slate-600 font-medium mt-0.5">Phone: {invoice.partyPhone}</p>
          )}
          {invoice.partyAddress && (
            <p className="text-xs text-slate-600 font-medium mt-0.5">{invoice.partyAddress}</p>
          )}
          {invoice.partyGstin && (
            <p className="text-xs text-slate-600 font-mono font-bold mt-1">NTN / CNIC: {invoice.partyGstin}</p>
          )}
        </div>

        <div className="text-right flex flex-col justify-between items-end">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
              STATUS
            </span>
            <span
              className={`inline-block px-3 py-1 rounded text-xs font-black uppercase tracking-wider border ${
                invoice.paymentStatus === 'PAID'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : invoice.paymentStatus === 'PARTIAL'
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-rose-100 text-rose-800 border-rose-300'
              }`}
            >
              {invoice.paymentStatus || 'PAID'}
            </span>
          </div>

          {dueAmount > 0 && (
            <div className="text-xs font-mono font-black text-rose-600">
              Balance Due: Rs {dueAmount.toFixed(2)}
            </div>
          )}
        </div>
      </div>

      {/* 3. Itemization Table */}
      <div className="overflow-x-auto mb-6 border border-slate-200 rounded-xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-800 text-white text-[11px] font-extrabold uppercase tracking-wider">
              <th className="py-2.5 px-3 text-center w-10">#</th>
              <th className="py-2.5 px-3">Item Description</th>
              <th className="py-2.5 px-3 text-center">Qty</th>
              <th className="py-2.5 px-3 text-right">Unit Rate</th>
              {discountTotal > 0 && <th className="py-2.5 px-3 text-right">Discount</th>}
              <th className="py-2.5 px-3 text-right">Tax</th>
              <th className="py-2.5 px-3 text-right">Total Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-xs font-medium text-slate-800">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-6 text-slate-400 font-semibold">
                  No line items found.
                </td>
              </tr>
            ) : (
              items.map((item, idx) => {
                const qty = Number(item.quantity || 0);
                const rate = Number(item.unitPrice || 0);
                const itemTax = Number(item.taxAmount || 0);
                const itemTot = Number(item.totalAmount || 0);
                return (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-500 font-bold">{idx + 1}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-extrabold text-slate-900">{item.itemName || 'Product'}</div>
                      {item.unitType && <div className="text-[10px] text-slate-400 font-semibold">Unit: {item.unitType}</div>}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900">{qty}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">Rs {rate.toFixed(2)}</td>
                    {discountTotal > 0 && (
                      <td className="py-2.5 px-3 text-right font-mono text-rose-600">
                        {item.discountAmount ? `-Rs ${Number(item.discountAmount).toFixed(2)}` : '-'}
                      </td>
                    )}
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                      {itemTax > 0 ? `Rs ${itemTax.toFixed(2)}` : 'Exempt'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                      Rs {itemTot.toFixed(2)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 4. Financial Summary & Footer Notes */}
      <div className="grid grid-cols-2 gap-6 items-start border-t-2 border-slate-800 pt-5">
        {/* Left Column: QR Code & Terms */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="w-16 h-16 bg-white border border-slate-300 rounded p-1 flex items-center justify-center font-mono text-[9px] text-center font-bold text-slate-400">
              [ SCAN QR ]
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800">Digital Payment & Verification</div>
              <div className="text-[10px] text-slate-500">Scan QR Code via EasyPaisa / JazzCash / Banking App</div>
            </div>
          </div>

          <div className="text-[11px] text-slate-600 leading-relaxed">
            <span className="font-extrabold text-slate-800 uppercase block text-[10px] mb-1">Terms & Conditions:</span>
            <p>1. Goods once sold can be returned/exchanged within 7 days with original invoice.</p>
            <p>2. Subject to local trade jurisdiction.</p>
            {customNotes && <p className="mt-1 font-semibold text-blue-800 italic">{customNotes}</p>}
          </div>
        </div>

        {/* Right Column: Numeric Totals Summary */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs font-mono text-slate-700">
          <div className="flex justify-between">
            <span>Subtotal (Net):</span>
            <span className="font-bold text-slate-900">Rs {subtotal.toFixed(2)}</span>
          </div>

          {discountTotal > 0 && (
            <div className="flex justify-between text-rose-600 font-bold">
              <span>Total Discount:</span>
              <span>-Rs {discountTotal.toFixed(2)}</span>
            </div>
          )}

          {taxTotal > 0 && (
            <div className="flex justify-between text-slate-800">
              <span>Sales Tax (GST):</span>
              <span className="font-bold text-emerald-700">+Rs {taxTotal.toFixed(2)}</span>
            </div>
          )}

          <div className="border-t border-slate-300 pt-2 flex justify-between text-base font-black text-slate-900 font-sans">
            <span>GRAND TOTAL:</span>
            <span className="font-mono text-blue-700">Rs {grandTotal.toFixed(2)}</span>
          </div>

          <div className="flex justify-between border-t border-slate-200 pt-1.5 text-xs">
            <span>Amount Received:</span>
            <span className="font-bold text-emerald-600">Rs {receivedAmount.toFixed(2)}</span>
          </div>

          <div className="flex justify-between text-xs font-black">
            <span>Balance Due:</span>
            <span className={dueAmount > 0 ? 'text-rose-600' : 'text-slate-900'}>
              Rs {dueAmount.toFixed(2)}
            </span>
          </div>

          {/* Signatory Box */}
          <div className="pt-8 text-center border-t border-dashed border-slate-300 mt-4">
            <div className="border-b border-slate-400 w-36 mx-auto mb-1"></div>
            <div className="text-[10px] font-sans font-extrabold uppercase text-slate-500">Authorized Signature & Stamp</div>
          </div>
        </div>
      </div>
    </div>
  );
};
