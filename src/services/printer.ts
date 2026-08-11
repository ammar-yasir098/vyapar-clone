import { Invoice, BusinessDetails } from '../types';

export interface ESCPOSOptions {
  paperWidth: '58mm' | '80mm';
  showGstin: boolean;
  cutPaper: boolean;
}

/**
 * Builds raw ESC/POS byte array for direct transmission to USB / Serial / Bluetooth thermal receipt printers.
 */
export function buildThermalReceiptBytes(
  invoice: Invoice,
  business: BusinessDetails,
  options: ESCPOSOptions = { paperWidth: '80mm', showGstin: true, cutPaper: true }
): Uint8Array {
  const ESC = 0x1B;
  const GS = 0x1D;
  const bytes: number[] = [];

  const charWidth = options.paperWidth === '80mm' ? 48 : 32;

  const pushString = (str: string) => {
    for (let i = 0; i < str.length; i++) {
      bytes.push(str.charCodeAt(i));
    }
  };

  const centerText = (text: string) => {
    const pad = Math.max(0, Math.floor((charWidth - text.length) / 2));
    return ' '.repeat(pad) + text;
  };

  const lineSeparator = () => '-'.repeat(charWidth) + '\n';

  // 1. Reset printer & set alignment center
  bytes.push(ESC, 0x40); // Reset
  bytes.push(ESC, 0x61, 0x01); // Center align

  // 2. Header: Business Name (Double height & width bold)
  bytes.push(ESC, 0x21, 0x30);
  pushString(`${business.name}\n`);

  // 3. Normal text align center
  bytes.push(ESC, 0x21, 0x00);
  pushString(`${business.address}\n`);
  pushString(`Phone: ${business.phone}\n`);
  if (options.showGstin && business.gstin) {
    pushString(`${business.gstin}\n`);
  }
  pushString(`${business.tagline}\n\n`);

  // 4. Align left for bill meta
  bytes.push(ESC, 0x61, 0x00);
  pushString(lineSeparator());
  pushString(`Invoice #: ${invoice.invoiceNumber.padEnd(20)} Date: ${invoice.invoiceDate}\n`);
  pushString(`Customer : ${invoice.partyName}\n`);
  if (invoice.partyGstin) {
    pushString(`NTN / CNIC: ${invoice.partyGstin}\n`);
  }
  pushString(lineSeparator());

  // 5. Items Header
  if (options.paperWidth === '80mm') {
    pushString('Item Name               Qty   Rate    Tax    Total\n');
  } else {
    pushString('Item            Qty  Price  Total\n');
  }
  pushString(lineSeparator());

  // 6. Items List
  const itemsList = Array.isArray(invoice.items) ? invoice.items : [];
  itemsList.forEach(item => {
    const itemNameStr = item.itemName || 'Item';
    const quantityNum = Number(item.quantity || 0);
    const unitPriceNum = Number(item.unitPrice || 0);
    const taxAmountNum = Number(item.taxAmount || 0);
    const totalAmountNum = Number(item.totalAmount || 0);

    if (options.paperWidth === '80mm') {
      const name = itemNameStr.length > 22 ? itemNameStr.substring(0, 20) + '..' : itemNameStr.padEnd(22);
      const qty = quantityNum.toString().padStart(5);
      const rate = unitPriceNum.toFixed(2).padStart(7);
      const tax = taxAmountNum.toFixed(2).padStart(6);
      const total = totalAmountNum.toFixed(2).padStart(8);
      pushString(`${name} ${qty} ${rate} ${tax} ${total}\n`);
    } else {
      const name = itemNameStr.length > 15 ? itemNameStr.substring(0, 13) + '..' : itemNameStr.padEnd(15);
      const qty = quantityNum.toString().padStart(3);
      const price = unitPriceNum.toFixed(0).padStart(5);
      const total = totalAmountNum.toFixed(0).padStart(6);
      pushString(`${name} ${qty} ${price} ${total}\n`);
    }
  });

  pushString(lineSeparator());

  // 7. Totals Summary
  const subtotalNum = Number(invoice.subtotal || 0);
  const taxTotalNum = Number(invoice.taxTotal || 0);
  const discountTotalNum = Number(invoice.discountTotal || 0);
  const grandTotalNum = Number(invoice.grandTotal || 0);
  const dueAmountNum = Number(invoice.dueAmount || 0);

  bytes.push(ESC, 0x61, 0x02); // Align Right
  pushString(`Subtotal: Rs ${subtotalNum.toFixed(2)}\n`);
  if (taxTotalNum > 0) {
    pushString(`Sales Tax: Rs ${taxTotalNum.toFixed(2)}\n`);
  }
  if (discountTotalNum > 0) {
    pushString(`Discount: -Rs ${discountTotalNum.toFixed(2)}\n`);
  }

  // Grand Total Bold
  bytes.push(ESC, 0x21, 0x20); // Bold enlarged
  pushString(`GRAND TOTAL: Rs ${grandTotalNum.toFixed(2)}\n`);

  bytes.push(ESC, 0x21, 0x00); // Reset font
  pushString(`Payment Mode: ${invoice.paymentMethod || 'CASH'} (${invoice.paymentStatus || 'PAID'})\n`);
  if (dueAmountNum > 0) {
    pushString(`Balance Due: Rs ${dueAmountNum.toFixed(2)}\n`);
  }

  // 8. Footer
  bytes.push(ESC, 0x61, 0x01); // Center
  pushString('\nThank you for shopping with us!\n');
  pushString('*** Powered by Vyapar POS ***\n\n\n\n');

  // 9. Paper Cut Command
  if (options.cutPaper) {
    bytes.push(GS, 0x56, 0x41, 0x00);
  }

  return new Uint8Array(bytes);
}

/**
 * Downloads a raw thermal `.bin` file or opens browser print dialog formatted as a thermal slip.
 */
export function triggerThermalPrint(invoice: Invoice, business: BusinessDetails, paperWidth: '58mm' | '80mm' = '80mm') {
  const bytes = buildThermalReceiptBytes(invoice, business, { paperWidth, showGstin: true, cutPaper: true });

  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `thermal_receipt_${invoice.invoiceNumber}.bin`;
  
  const printWindow = window.open('', '_blank', 'width=400,height=600');
  if (!printWindow) return;

  const subtotalNum = Number(invoice.subtotal || 0);
  const taxTotalNum = Number(invoice.taxTotal || 0);
  const discountTotalNum = Number(invoice.discountTotal || 0);
  const grandTotalNum = Number(invoice.grandTotal || 0);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Receipt - ${invoice.invoiceNumber}</title>
      <style>
        @page { size: ${paperWidth === '80mm' ? '80mm auto' : '58mm auto'}; margin: 0; }
        body {
          font-family: 'Courier New', Courier, monospace;
          width: ${paperWidth === '80mm' ? '78mm' : '56mm'};
          margin: 0 auto;
          padding: 8px;
          font-size: 12px;
          color: #000;
          background: #fff;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .bold { font-weight: bold; }
        .title { font-size: 16px; font-weight: bold; }
        .divider { border-top: 1px dashed #000; margin: 6px 0; }
        table { width: 100%; border-collapse: collapse; margin: 4px 0; }
        th, td { font-size: 11px; padding: 2px 0; text-align: left; }
        th { border-bottom: 1px dashed #000; }
      </style>
    </head>
    <body>
      <div class="text-center">
        <div class="title">${business.name}</div>
        <div>${business.address}</div>
        <div>Ph: ${business.phone}</div>
        ${business.gstin ? `<div>${business.gstin}</div>` : ''}
      </div>

      <div class="divider"></div>
      <div><strong>Inv #:</strong> ${invoice.invoiceNumber}</div>
      <div><strong>Date:</strong> ${invoice.invoiceDate}</div>
      <div><strong>Cust:</strong> ${invoice.partyName}</div>

      <div class="divider"></div>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th class="text-right">Qty</th>
            <th class="text-right">Rate</th>
            <th class="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${(Array.isArray(invoice.items) ? invoice.items : []).map(i => `
            <tr>
              <td>${i.itemName || 'Item'}</td>
              <td class="text-right">${Number(i.quantity || 0)}</td>
              <td class="text-right">Rs ${Number(i.unitPrice || 0).toFixed(0)}</td>
              <td class="text-right">Rs ${Number(i.totalAmount || 0).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="divider"></div>
      <div class="text-right">Subtotal: Rs ${subtotalNum.toFixed(2)}</div>
      ${taxTotalNum > 0 ? `<div class="text-right">Sales Tax: Rs ${taxTotalNum.toFixed(2)}</div>` : ''}
      ${discountTotalNum > 0 ? `<div class="text-right">Discount: -Rs ${discountTotalNum.toFixed(2)}</div>` : ''}
      <div class="text-right bold title" style="margin-top: 4px;">TOTAL: Rs ${grandTotalNum.toFixed(2)}</div>
      <div class="text-right">Paid via ${invoice.paymentMethod || 'CASH'} (${invoice.paymentStatus || 'PAID'})</div>

      <div class="divider"></div>
      <div class="text-center" style="margin-top: 10px;">
        <div>Thank you for shopping!</div>
        <div style="font-size: 9px; margin-top: 4px;">*** Vyapar POS ***</div>
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
