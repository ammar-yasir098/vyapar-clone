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
      Gstin: business.gstin || 'NTN: 7654321-0',
      LglName: business.name || 'Company Name',
      TrdName: business.name || 'Company Name',
      Addr1: business.address || 'Address',
      Loc: business.state || 'State',
      Pin: 400001,
      Stcd: "27"
    },
    BuyerDetails: {
      Gstin: invoice?.partyGstin || "URP", // Unregistered Person
      LglName: invoice?.partyName || "Walk-in Retail Customer",
      TrdName: invoice?.partyName || "Walk-in Retail Customer",
      Pos: "27",
      Addr1: invoice?.partyPhone || "Local Customer",
      Loc: "Local City",
      Pin: 400001,
      Stcd: "27"
    },
    ItemList: itemsList.map((item, idx) => {
      const qty = Number(item.quantity || 0);
      const unitPrice = Number(item.unitPrice || 0);
      const cgst = Number(item.cgstRate || 0);
      const sgst = Number(item.sgstRate || 0);
      const lineSub = qty * unitPrice;
      const lineTax = (lineSub * (cgst + sgst)) / 100;
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
        GstRt: cgst + sgst,
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
 * Generates official E-Way Bill JSON payload for inter-state goods transport consignment (> ₹50,000).
 */
export function exportEWayBillJSON(invoice: Invoice, business: BusinessDetails, transporter: TransporterDetails) {
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
    fromGstin: business.gstin || 'NTN: 7654321-0',
    fromTrdName: business.name || 'Company Name',
    fromAddr1: business.address || 'Address',
    fromPlace: business.state || 'State',
    fromPincode: 400001,
    actFromStateCode: 27,
    fromStateCode: 27,
    toGstin: invoice?.partyGstin || "URP",
    toTrdName: invoice?.partyName || "Walk-in Retail Customer",
    toAddr1: invoice?.partyPhone || "Customer",
    toPlace: "Local City",
    toPincode: 400001,
    actToStateCode: 27,
    toStateCode: 27,
    totalValue: Number(invoice?.subtotal || 0),
    cgstValue: Number(invoice?.cgstTotal || 0),
    sgstValue: Number(invoice?.sgstTotal || 0),
    igstValue: Number(invoice?.igstTotal || 0),
    totInvValue: Number(invoice?.grandTotal || 0),
    transporterId: transporter.transporterId,
    transporterName: transporter.transporterName,
    transDocNo: `TD-${Date.now().toString().slice(-6)}`,
    transMode: transporter.mode === 'ROAD' ? "1" : "2",
    transDistance: (transporter.distanceKm || 100).toString(),
    vehicleNo: transporter.vehicleNumber || 'AB-01-1234',
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

