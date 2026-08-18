import { Invoice, BusinessDetails } from '../types';

export interface TransporterDetails {
  transporterId: string;
  transporterName: string;
  vehicleNumber: string;
  distanceKm: number;
  mode: 'ROAD' | 'RAIL' | 'AIR' | 'SHIP';
}

/**
 * Computes a 64-character SHA-256 IRN (Invoice Reference Number) cryptographic hash.
 */
export async function generateIRNHash(invoice: Invoice, gstin: string): Promise<string> {
  const invNum = invoice?.invoiceNumber || 'INV-001';
  const invDate = invoice?.invoiceDate || new Date().toISOString().split('T')[0];
  const grandTotalStr = Number(invoice?.grandTotal || 0).toFixed(2);
  const rawData = `${gstin || 'GSTIN'}:${invNum}:${invDate}:${grandTotalStr}`;
  
  // Use Web Crypto API
  const msgUint8 = new TextEncoder().encode(rawData);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}

/**
 * Generates official NIC GST E-Invoice JSON payload for bulk portal upload.
 */
export function exportEInvoiceNICJSON(invoice: Invoice, business: BusinessDetails) {
  const safeBus = business || {};
  const invNum = invoice?.invoiceNumber || 'INV-001';
  const invDateStr = invoice?.invoiceDate ? String(invoice.invoiceDate) : new Date().toISOString().split('T')[0];
  const formattedDate = invDateStr.includes('-') ? invDateStr.split('-').reverse().join('/') : invDateStr;
  const itemsList = Array.isArray(invoice?.items) ? invoice.items : [];

  const payload = {
    Version: "1.1",
    TranDetails: {
      TaxSch: "GST",
      SupTyp: "B2B",
      RegRev: "N",
      EcmGstin: null,
      IgstOnIntra: "N"
    },
    DocDetails: {
      Typ: "INV",
      No: invNum,
      Dt: formattedDate
    },
    SellerDetails: {
      Gstin: safeBus.gstin || 'NTN: 7654321-0',
      LglName: safeBus.name || 'Company Name',
      TrdName: safeBus.name || 'Company Name',
      Addr1: safeBus.address || 'Address',
      Loc: safeBus.state || 'Punjab',
      Pin: 54000,
      Stcd: "PB"
    },
    BuyerDetails: {
      Gstin: invoice?.partyGstin || "URP", // Unregistered Person
      LglName: invoice?.partyName || "Walk-in Retail Customer",
      TrdName: invoice?.partyName || "Walk-in Retail Customer",
      Pos: "PB",
      Addr1: invoice?.partyPhone || "Local Customer",
      Loc: "Local City",
      Pin: 54000,
      Stcd: "PB"
    },
    ItemList: itemsList.map((item, idx) => {
      const qty = Number(item.quantity || 0);
      const unitPrice = Number(item.unitPrice || 0);
      const cgst = Number(item.cgstRate || 0);
      const sgst = Number(item.sgstRate || 0);
      const igst = Number(item.igstRate || 0);
      const effTaxRate = igst > 0 ? igst : (cgst + sgst);
      const lineSub = qty * unitPrice;
      const lineTax = (lineSub * effTaxRate) / 100;
      return {
        SlNo: (idx + 1).toString(),
        PrdDesc: item.itemName || 'Product',
        IsServc: "N",
        HsnCd: item.hsnSacCode || '1000',
        Qty: qty,
        Unit: item.unitType || 'PCS',
        UnitPrice: unitPrice,
        TotAmt: lineSub,
        Discount: 0,
        AssAmt: lineSub,
        GstRt: effTaxRate,
        CgstAmt: (lineSub * cgst) / 100,
        SgstAmt: (lineSub * sgst) / 100,
        TotItemVal: Number(item.totalAmount || (lineSub + lineTax))
      };
    }),
    ValDetails: {
      AssVal: Number(invoice?.subtotal || 0),
      CgstVal: Number(invoice?.cgstTotal || 0),
      SgstVal: Number(invoice?.sgstTotal || 0),
      IgstVal: Number(invoice?.igstTotal || 0),
      Discount: Number(invoice?.discountTotal || 0),
      TotInvVal: Number(invoice?.grandTotal || 0)
    }
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `NIC_EInvoice_${invNum}.json`;
  a.click();
}

/**
 * Generates official E-Way Bill JSON payload for inter-state goods transport consignment (> Rs 50,000).
 */
export function exportEWayBillJSON(invoice: Invoice, business: BusinessDetails, transporter?: TransporterDetails) {
  const safeBus = business || {};
  const safeTrans = transporter || {
    transporterId: 'TRANS-100',
    transporterName: 'Local Transport',
    vehicleNumber: 'AB-01-1234',
    distanceKm: 100,
    mode: 'ROAD'
  };
  const invNum = invoice?.invoiceNumber || 'INV-001';
  const invDateStr = invoice?.invoiceDate ? String(invoice.invoiceDate) : new Date().toISOString().split('T')[0];
  const formattedDate = invDateStr.includes('-') ? invDateStr.split('-').reverse().join('/') : invDateStr;
  const itemsList = Array.isArray(invoice?.items) ? invoice.items : [];

  const payload = {
    supplyType: "O",
    subSupplyType: "1",
    docType: "INV",
    docNo: invNum,
    docDate: formattedDate,
    fromGstin: safeBus.gstin || 'NTN: 7654321-0',
    fromTrdName: safeBus.name || 'Company Name',
    fromAddr1: safeBus.address || 'Address',
    fromPlace: safeBus.state || 'Punjab',
    fromPincode: 54000,
    actFromStateCode: "PB",
    fromStateCode: "PB",
    toGstin: invoice?.partyGstin || "URP",
    toTrdName: invoice?.partyName || "Walk-in Retail Customer",
    toAddr1: invoice?.partyPhone || "Customer",
    toPlace: "Local City",
    toPincode: 54000,
    actToStateCode: "PB",
    toStateCode: "PB",
    totalValue: Number(invoice?.subtotal || 0),
    cgstValue: Number(invoice?.cgstTotal || 0),
    sgstValue: Number(invoice?.sgstTotal || 0),
    igstValue: Number(invoice?.igstTotal || 0),
    totInvValue: Number(invoice?.grandTotal || 0),
    transporterId: safeTrans.transporterId || 'TRANS-100',
    transporterName: safeTrans.transporterName || 'Local Transport',
    transDocNo: `TD-${Date.now().toString().slice(-6)}`,
    transMode: safeTrans.mode === 'ROAD' ? "1" : "2",
    transDistance: (safeTrans.distanceKm || 100).toString(),
    vehicleNo: safeTrans.vehicleNumber || 'AB-01-1234',
    vehicleType: "R",
    itemList: itemsList.map(item => ({
      productName: item.itemName || 'Product',
      hsnCode: parseInt(item.hsnSacCode) || 1000,
      quantity: Number(item.quantity || 0),
      qtyUnit: item.unitType || 'PCS',
      taxableAmount: Number(item.quantity || 0) * Number(item.unitPrice || 0),
      cgstRate: Number(item.cgstRate || 0),
      sgstRate: Number(item.sgstRate || 0),
      igstRate: Number(item.igstRate || 0)
    }))
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `EWayBill_${invNum}.json`;
  a.click();
}

