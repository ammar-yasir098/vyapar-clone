import { Invoice, BusinessDetails } from '../types';

/**
 * Generates direct WhatsApp click-to-send link with pre-filled invoice summary message.
 */
export function buildWhatsAppInvoiceLink(invoice: Invoice, business: BusinessDetails): string {
  const phone = invoice.partyPhone?.replace(/\D/g, '') || '';
  const message = `Hello ${invoice.partyName},\n\nThank you for shopping with ${business.name}!\n\n📄 *Invoice No:* ${invoice.invoiceNumber}\n📅 *Date:* ${invoice.invoiceDate}\n💰 *Grand Total:* Rs ${invoice.grandTotal.toFixed(2)}\n💳 *Payment Status:* ${invoice.paymentStatus} (${invoice.paymentMethod})\n\nPlease let us know if you need any assistance!\n\nPowered by Vyapar POS.`;

  return `https://api.whatsapp.com/send?phone=${phone.length === 11 && phone.startsWith('0') ? '92' + phone.substring(1) : phone}&text=${encodeURIComponent(message)}`;
}

/**
 * Opens browser print window formatted as a standard A4 / A5 Sales Tax Invoice with JazzCash / EasyPaisa / Bank QR code.
 */
export function printA4TaxInvoice(invoice: Invoice, business: BusinessDetails, format: 'A4' | 'A5' = 'A4') {
  const printWindow = window.open('', '_blank', 'width=800,height=1000');
  if (!printWindow) return;

  const upiQrUrl = business.upiId
    ? `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(
        `account=${business.upiId}&name=${business.name}&amount=${invoice.grandTotal.toFixed(2)}`
      )}`
    : '';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>SALES TAX INVOICE - ${invoice.invoiceNumber}</title>
      <style>
        @page { size: ${format}; margin: 15mm; }
        body {
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          color: #1e293b;
          margin: 0;
          padding: 20px;
          font-size: 13px;
          background: #fff;
        }
        .header-table { width: 100%; border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 16px; }
        .title { font-size: 24px; font-weight: bold; color: #1e3a8a; letter-spacing: 0.5px; }
        .sub-title { font-size: 12px; color: #64748b; font-weight: 600; }
        .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; margin-bottom: 16px; }
        .grid-2 { display: flex; justify-content: space-between; }
        table.data-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        table.data-table th { background: #1e293b; color: #fff; text-align: left; padding: 8px 10px; font-size: 11px; text-transform: uppercase; }
        table.data-table td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
        .text-right { text-align: right; }
        .font-mono { font-family: monospace; }
        .bold { font-weight: bold; }
        .totals-table { width: 300px; margin-left: auto; margin-top: 16px; border-collapse: collapse; }
        .totals-table td { padding: 4px 8px; font-size: 12px; }
        .grand-total { font-size: 16px; font-weight: bold; color: #059669; border-top: 2px solid #059669; border-bottom: 2px solid #059669; }
        .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; pt: 10px; font-size: 11px; color: #64748b; }
      </style>
    </head>
    <body>
      <table class="header-table">
        <tr>
          <td>
            <div class="title">${business.name}</div>
            <div>${business.address}</div>
            <div>Phone: ${business.phone} | ${business.state}</div>
            <div class="sub-title">${business.gstin}</div>
          </td>
          <td class="text-right" style="vertical-align: top;">
            <div style="font-size: 20px; font-weight: bold; color: #2563eb;">TAX INVOICE</div>
            <div class="font-mono"><strong>Invoice #:</strong> ${invoice.invoiceNumber}</div>
            <div class="font-mono"><strong>Date:</strong> ${invoice.invoiceDate}</div>
          </td>
        </tr>
      </table>

      <div class="meta-box grid-2">
        <div>
          <div style="font-[10px] text-transform: uppercase; color: #64748b; font-weight: bold;">Billed To (Customer):</div>
          <div style="font-size: 14px; font-weight: bold; color: #0f172a;">${invoice.partyName}</div>
          ${invoice.partyPhone ? `<div>Phone: ${invoice.partyPhone}</div>` : ''}
          ${invoice.partyGstin ? `<div>NTN / STRN / CNIC: ${invoice.partyGstin}</div>` : ''}
        </div>
        <div class="text-right">
          <div style="font-size: 11px; color: #64748b; font-weight: bold;">Payment Details:</div>
          <div>Status: <strong style="color: ${invoice.paymentStatus === 'PAID' ? '#059669' : '#d97706'};">${invoice.paymentStatus}</strong></div>
          <div>Method: <strong>${invoice.paymentMethod}</strong></div>
        </div>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 30px;">#</th>
            <th>Item & Description</th>
            <th>HSN / Code</th>
            <th class="text-right">Qty</th>
            <th class="text-right">Unit Rate (Rs)</th>
            <th class="text-right">Sales Tax</th>
            <th class="text-right">Tax (Rs)</th>
            <th class="text-right">Total Amount (Rs)</th>
          </tr>
        </thead>
        <tbody>
          ${invoice.items
            .map(
              (item, i) => `
            <tr>
              <td class="font-mono">${i + 1}</td>
              <td>
                <div class="bold">${item.itemName}</div>
                ${item.batchNumber ? `<div style="font-size: 10px; color: #64748b;">Batch: ${item.batchNumber} (Exp: ${item.expiryDate || 'N/A'})</div>` : ''}
              </td>
              <td class="font-mono">${item.hsnSacCode}</td>
              <td class="text-right font-mono">${item.quantity} ${item.unitType}</td>
              <td class="text-right font-mono">Rs ${item.unitPrice.toFixed(2)}</td>
              <td class="text-right font-mono">${item.cgstRate + item.sgstRate}%</td>
              <td class="text-right font-mono">Rs ${item.taxAmount.toFixed(2)}</td>
              <td class="text-right font-mono bold">Rs ${item.totalAmount.toFixed(2)}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>

      <table class="totals-table">
        <tr>
          <td>Subtotal:</td>
          <td class="text-right font-mono">Rs ${invoice.subtotal.toFixed(2)}</td>
        </tr>
        ${
          invoice.taxTotal > 0
            ? `
          <tr>
            <td>Sales Tax (GST):</td>
            <td class="text-right font-mono">Rs ${invoice.taxTotal.toFixed(2)}</td>
          </tr>
        `
            : ''
        }
        ${
          invoice.discountTotal > 0
            ? `
          <tr>
            <td>Discount:</td>
            <td class="text-right font-mono">-Rs ${invoice.discountTotal.toFixed(2)}</td>
          </tr>
        `
            : ''
        }
        <tr class="grand-total">
          <td>GRAND TOTAL:</td>
          <td class="text-right font-mono">Rs ${invoice.grandTotal.toFixed(2)}</td>
        </tr>
      </table>

      <div class="grid-2 footer">
        <div>
          <div><strong>Terms & Conditions:</strong></div>
          <div>1. Goods once sold will not be taken back without original receipt.</div>
          <div>2. Subject to local city jurisdiction.</div>
        </div>
        ${
          upiQrUrl
            ? `
          <div class="text-right">
            <div style="font-size: 10px; font-weight: bold; margin-bottom: 2px;">Scan to Pay Digital Account</div>
            <img src="${upiQrUrl}" alt="Payment QR" style="width: 90px; height: 90px; border: 1px solid #cbd5e1; padding: 2px;" />
          </div>
        `
            : ''
        }
      </div>

      <script>
        window.onload = function() {
          window.print();
        }
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}
