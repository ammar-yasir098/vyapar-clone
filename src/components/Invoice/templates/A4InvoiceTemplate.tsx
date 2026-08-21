import React from 'react';
import { QrCode } from 'lucide-react';
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
      style={{
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        backgroundColor: '#ffffff',
        color: '#0f172a',
        boxSizing: 'border-box'
      }}
    >
      {/* 1. Header / Store Branding Banner */}
      <div
        className="flex justify-between items-start border-b-2 pb-5 mb-5"
        style={{ borderColor: '#0f172a' }}
      >
        <div>
          <h1 className="text-2xl font-black tracking-tight uppercase" style={{ color: '#0f172a', lineHeight: 1.1 }}>
            {business.name || 'VYAPAR RETAILERS'}
          </h1>
          {business.tagline && (
            <p className="text-xs font-semibold italic mt-0.5" style={{ color: '#64748b' }}>
              {business.tagline}
            </p>
          )}
          <p className="text-xs font-medium mt-1.5 max-w-sm leading-relaxed" style={{ color: '#334155' }}>
            {business.address}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold mt-1.5" style={{ color: '#334155' }}>
            <span>Phone: {business.phone}</span>
            {business.gstin && (
              <span>
                NTN / GSTIN: <strong style={{ color: '#0f172a' }}>{business.gstin}</strong>
              </span>
            )}
          </div>
        </div>

        <div className="text-right flex flex-col items-end">
          <span
            className="font-black text-xs uppercase tracking-wider shadow-2xs"
            style={{
              backgroundColor: '#0f172a',
              color: '#ffffff',
              padding: '5px 14px',
              borderRadius: '6px',
              whiteSpace: 'nowrap',
              display: 'inline-block',
              lineHeight: '1.2',
              marginBottom: '8px'
            }}
          >
            GST TAX INVOICE
          </span>
          <div
            className="text-xs font-semibold space-y-1 text-right mt-1"
            style={{ color: '#1e293b', whiteSpace: 'nowrap', lineHeight: '1.4' }}
          >
            <div style={{ whiteSpace: 'nowrap', marginBottom: '2px' }}>
              Invoice #: <span className="font-bold" style={{ color: '#1d4ed8' }}>{invoice.invoiceNumber || 'INV-0000'}</span>
            </div>
            <div style={{ whiteSpace: 'nowrap', marginBottom: '2px' }}>
              Date: <span className="font-bold">{invoice.invoiceDate}</span>
            </div>
            <div style={{ whiteSpace: 'nowrap' }}>
              Payment: <span className="uppercase font-bold" style={{ color: '#0f172a' }}>{invoice.paymentMethod || 'CASH'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Customer & Billing Details */}
      <div
        className="grid grid-cols-2 gap-4 p-4 rounded-xl border mb-5"
        style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }}
      >
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider block mb-1" style={{ color: '#64748b' }}>
            BILLED TO (CUSTOMER)
          </span>
          <h3 className="font-black text-sm" style={{ color: '#0f172a' }}>
            {invoice.partyName || 'Walk-in Retail Customer'}
          </h3>
          {invoice.partyPhone && (
            <p className="text-xs font-medium mt-0.5" style={{ color: '#334155' }}>
              Phone: {invoice.partyPhone}
            </p>
          )}
          {invoice.partyAddress && (
            <p className="text-xs font-medium mt-0.5" style={{ color: '#334155' }}>
              {invoice.partyAddress}
            </p>
          )}
          {invoice.partyGstin && (
            <p className="text-xs font-bold mt-1" style={{ color: '#334155' }}>
              NTN / CNIC: {invoice.partyGstin}
            </p>
          )}
        </div>

        <div className="text-right flex flex-col justify-between items-end">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider block mb-1.5" style={{ color: '#64748b' }}>
              STATUS
            </span>
            <span
              className="font-black text-xs uppercase tracking-wider border shadow-2xs"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px 14px',
                borderRadius: '6px',
                whiteSpace: 'nowrap',
                lineHeight: '1.2',
                ...(invoice.paymentStatus === 'PAID'
                  ? { backgroundColor: '#d1fae5', color: '#065f46', borderColor: '#a7f3d0' }
                  : invoice.paymentStatus === 'PARTIAL'
                  ? { backgroundColor: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }
                  : { backgroundColor: '#ffe4e6', color: '#9f1239', borderColor: '#fecdd3' })
              }}
            >
              {invoice.paymentStatus || 'PAID'}
            </span>
          </div>

          {dueAmount > 0 && (
            <div className="text-xs font-black mt-2" style={{ color: '#e11d48' }}>
              Balance Due: Rs {dueAmount.toFixed(2)}
            </div>
          )}
        </div>
      </div>

      {/* 3. Itemization Table */}
      <div className="overflow-x-auto mb-5 border rounded-xl" style={{ borderColor: '#cbd5e1' }}>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-[11px] font-extrabold uppercase tracking-wider" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
              <th className="py-2.5 px-3 text-center w-10">#</th>
              <th className="py-2.5 px-3">Item Description</th>
              <th className="py-2.5 px-3 text-center">Qty</th>
              <th className="py-2.5 px-3 text-right">Unit Rate</th>
              {discountTotal > 0 && <th className="py-2.5 px-3 text-right">Discount</th>}
              <th className="py-2.5 px-3 text-right">Tax</th>
              <th className="py-2.5 px-3 text-right">Total Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y text-xs font-medium" style={{ borderColor: '#e2e8f0', color: '#1e293b' }}>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-6 font-semibold" style={{ color: '#94a3b8' }}>
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
                  <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                    <td className="py-3 px-3 text-center font-bold" style={{ color: '#64748b', verticalAlign: 'middle' }}>{idx + 1}</td>
                    <td className="py-3 px-3" style={{ verticalAlign: 'middle' }}>
                      <div className="font-extrabold text-sm" style={{ color: '#0f172a', marginBottom: '2px', lineHeight: '1.2' }}>{item.itemName || 'Product'}</div>
                      {item.unitType && <div className="text-[11px] font-semibold" style={{ color: '#64748b', lineHeight: '1' }}>Unit: {item.unitType}</div>}
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-sm" style={{ color: '#0f172a', verticalAlign: 'middle' }}>{qty}</td>
                    <td className="py-3 px-3 text-right font-medium text-xs" style={{ color: '#334155', verticalAlign: 'middle' }}>Rs {rate.toFixed(2)}</td>
                    {discountTotal > 0 && (
                      <td className="py-3 px-3 text-right font-medium text-xs" style={{ color: '#e11d48', verticalAlign: 'middle' }}>
                        {item.discountAmount ? `-Rs ${Number(item.discountAmount).toFixed(2)}` : '-'}
                      </td>
                    )}
                    <td className="py-3 px-3 text-right font-medium text-xs" style={{ color: '#475569', verticalAlign: 'middle' }}>
                      {itemTax > 0 ? `Rs ${itemTax.toFixed(2)}` : 'Exempt'}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-sm" style={{ color: '#0f172a', verticalAlign: 'middle' }}>
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
      <div className="grid grid-cols-2 gap-5 items-start border-t-2 pt-4" style={{ borderColor: '#0f172a' }}>
        {/* Left Column: QR Code & Terms */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-xl border" style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }}>
            <div
              style={{
                minWidth: '64px',
                height: '54px',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px',
                boxSizing: 'border-box'
              }}
            >
              <QrCode style={{ width: '22px', height: '22px', color: '#1e293b' }} />
              <span style={{ fontSize: '8px', fontWeight: 800, color: '#475569', marginTop: '2px', whiteSpace: 'nowrap' }}>SCAN QR</span>
            </div>
            <div>
              <div className="text-xs font-bold" style={{ color: '#0f172a' }}>Digital Payment & Verification</div>
              <div className="text-[10px]" style={{ color: '#64748b' }}>Scan QR Code via EasyPaisa / JazzCash / Banking App</div>
            </div>
          </div>

          <div className="text-[11px] leading-relaxed" style={{ color: '#475569' }}>
            <span className="font-extrabold uppercase block text-[10px] mb-1" style={{ color: '#0f172a' }}>Terms & Conditions:</span>
            <p>1. Goods once sold can be returned/exchanged within 7 days with original invoice.</p>
            <p>2. Subject to local trade jurisdiction.</p>
            {customNotes && <p className="mt-1 font-semibold italic" style={{ color: '#1e40af' }}>{customNotes}</p>}
          </div>
        </div>

        {/* Right Column: Numeric Totals Summary */}
        <div className="p-4 rounded-xl border space-y-2 text-xs" style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: '#334155' }}>
          <div className="flex justify-between">
            <span>Subtotal (Net):</span>
            <span className="font-bold" style={{ color: '#0f172a' }}>Rs {subtotal.toFixed(2)}</span>
          </div>

          {discountTotal > 0 && (
            <div className="flex justify-between font-bold" style={{ color: '#e11d48' }}>
              <span>Total Discount:</span>
              <span>-Rs {discountTotal.toFixed(2)}</span>
            </div>
          )}

          {taxTotal > 0 && (
            <div className="flex justify-between" style={{ color: '#1e293b' }}>
              <span>Sales Tax (GST):</span>
              <span className="font-bold" style={{ color: '#047857' }}>+Rs {taxTotal.toFixed(2)}</span>
            </div>
          )}

          <div className="border-t pt-2 flex justify-between text-base font-black font-sans" style={{ borderColor: '#cbd5e1', color: '#0f172a' }}>
            <span>GRAND TOTAL:</span>
            <span className="font-bold" style={{ color: '#1d4ed8' }}>Rs {grandTotal.toFixed(2)}</span>
          </div>

          <div className="flex justify-between border-t pt-1.5 text-xs" style={{ borderColor: '#e2e8f0' }}>
            <span>Amount Received:</span>
            <span className="font-bold" style={{ color: '#059669' }}>Rs {receivedAmount.toFixed(2)}</span>
          </div>

          <div className="flex justify-between text-xs font-black">
            <span>Balance Due:</span>
            <span style={{ color: dueAmount > 0 ? '#e11d48' : '#0f172a' }}>
              Rs {dueAmount.toFixed(2)}
            </span>
          </div>

          {/* Signatory Box */}
          <div className="pt-6 text-center border-t border-dashed mt-3" style={{ borderColor: '#cbd5e1' }}>
            <div className="border-b w-36 mx-auto mb-1" style={{ borderColor: '#94a3b8' }}></div>
            <div className="text-[10px] font-sans font-extrabold uppercase" style={{ color: '#64748b' }}>Authorized Signature & Stamp</div>
          </div>
        </div>
      </div>
    </div>
  );
};
