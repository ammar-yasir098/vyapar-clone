import React from 'react';
import { Invoice, BusinessDetails } from '../../../types';

interface ThermalReceiptTemplateProps {
  invoice: Invoice;
  business: BusinessDetails;
  paperWidth?: '58mm' | '80mm';
}

export const ThermalReceiptTemplate: React.FC<ThermalReceiptTemplateProps> = ({
  invoice,
  business,
  paperWidth = '80mm'
}) => {
  const is58mm = paperWidth === '58mm';

  const subtotal = Number(invoice.subtotal || 0);
  const taxTotal = Number(invoice.taxTotal || 0);
  const discountTotal = Number(invoice.discountTotal || 0);
  const grandTotal = Number(invoice.grandTotal || 0);
  const receivedAmount = Number(invoice.receivedAmount ?? (invoice.paymentStatus === 'PAID' ? grandTotal : 0));
  const dueAmount = Number(invoice.dueAmount ?? (invoice.paymentStatus === 'PAID' ? 0 : Math.max(0, grandTotal - receivedAmount)));

  const items = Array.isArray(invoice.items) ? invoice.items : [];

  return (
    <div
      className={`thermal-paper bg-white text-black mx-auto p-3 font-mono leading-tight shadow-md border border-slate-300 ${
        is58mm ? 'max-w-[48mm] text-[10px]' : 'max-w-[72mm] text-[11px]'
      }`}
      style={{ fontFamily: "'Courier New', Courier, monospace" }}
    >
      {/* 1. Header Store Info (Centered) */}
      <div className="text-center space-y-0.5 uppercase">
        <div className="font-black text-sm tracking-tighter">{business.name || 'VYAPAR RETAIL'}</div>
        <div className="text-[10px] whitespace-normal font-semibold">{business.address}</div>
        <div className="text-[10px]">Ph: {business.phone}</div>
        {business.gstin && <div className="text-[10px] font-bold">NTN/GST: {business.gstin}</div>}
      </div>

      {/* Dashed Divider */}
      <div className="border-b border-dashed border-black my-2" />

      {/* 2. Bill Meta Info */}
      <div className="text-[10px] space-y-0.5">
        <div className="flex justify-between">
          <span>Inv #: <strong>{invoice.invoiceNumber || 'INV-000'}</strong></span>
          <span>{invoice.invoiceDate}</span>
        </div>
        <div>Cust: <strong>{invoice.partyName || 'Walk-in Retail Customer'}</strong></div>
        {invoice.partyGstin && <div>NTN/CNIC: {invoice.partyGstin}</div>}
        <div className="flex justify-between">
          <span>Mode: {invoice.paymentMethod || 'CASH'}</span>
          <span>Status: <strong>{invoice.paymentStatus || 'PAID'}</strong></span>
        </div>
      </div>

      {/* Dashed Divider */}
      <div className="border-b border-dashed border-black my-2" />

      {/* 3. Line Items Table */}
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-dashed border-black font-extrabold uppercase text-[10px]">
            <th className="py-1">Item</th>
            <th className="py-1 text-right">Qty</th>
            <th className="py-1 text-right">Rate</th>
            <th className="py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dashed divide-slate-200">
          {items.map((item, idx) => (
            <tr key={idx} className="align-top">
              <td className="py-1 pr-1 font-bold truncate max-w-[24mm]">{item.itemName || 'Item'}</td>
              <td className="py-1 text-right font-bold">{Number(item.quantity || 0)}</td>
              <td className="py-1 text-right">{Number(item.unitPrice || 0).toFixed(0)}</td>
              <td className="py-1 text-right font-black">{Number(item.totalAmount || 0).toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Dashed Divider */}
      <div className="border-b border-dashed border-black my-2" />

      {/* 4. Totals Summary */}
      <div className="space-y-0.5 text-right font-mono">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>Rs {subtotal.toFixed(2)}</span>
        </div>

        {discountTotal > 0 && (
          <div className="flex justify-between">
            <span>Discount:</span>
            <span>-Rs {discountTotal.toFixed(2)}</span>
          </div>
        )}

        {taxTotal > 0 && (
          <div className="flex justify-between">
            <span>Sales Tax:</span>
            <span>+Rs {taxTotal.toFixed(2)}</span>
          </div>
        )}

        <div className="border-t border-dashed border-black pt-1 flex justify-between font-black text-xs uppercase">
          <span>TOTAL:</span>
          <span>Rs {grandTotal.toFixed(2)}</span>
        </div>

        <div className="flex justify-between text-[10px]">
          <span>Paid ({invoice.paymentMethod || 'CASH'}):</span>
          <span>Rs {receivedAmount.toFixed(2)}</span>
        </div>

        {dueAmount > 0 && (
          <div className="flex justify-between font-black text-[10px]">
            <span>Balance Due:</span>
            <span>Rs {dueAmount.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Dashed Divider */}
      <div className="border-b border-dashed border-black my-2" />

      {/* 5. Receipt Footer Slogan */}
      <div className="text-center text-[9px] uppercase space-y-0.5">
        <div>Thank you for shopping with us!</div>
        <div>No exchange without original bill</div>
        <div className="font-bold pt-1">*** Powered by Vyapar POS ***</div>
      </div>
    </div>
  );
};
