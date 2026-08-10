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
  const rawData = `${gstin}:${invoice.invoiceNumber}:${invoice.invoiceDate}:${invoice.grandTotal}`;
  
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
      No: invoice.invoiceNumber,
      Dt: invoice.invoiceDate.split('-').reverse().join('/')
    },
    SellerDetails: {
      Gstin: business.gstin,
      LglName: business.name,
      TrdName: business.name,
      Addr1: business.address,
      Loc: business.state,
      Pin: 400001,
      Stcd: "27"
    },
    BuyerDetails: {
      Gstin: invoice.partyGstin || "URP", // Unregistered Person
      LglName: invoice.partyName,
      TrdName: invoice.partyName,
      Pos: "27",
      Addr1: invoice.partyPhone || "Local Customer",
      Loc: "Mumbai",
      Pin: 400001,
      Stcd: "27"
    },
    ItemList: invoice.items.map((item, idx) => ({
      SlNo: (idx + 1).toString(),
      PrdDesc: item.itemName,
      IsServc: "N",
      HsnCd: item.hsnSacCode,
      Qty: item.quantity,
      Unit: item.unitType,
      UnitPrice: item.unitPrice,
      TotAmt: item.quantity * item.unitPrice,
      Discount: 0,
      AssAmt: item.quantity * item.unitPrice,
      GstRt: item.cgstRate + item.sgstRate,
      CgstAmt: (item.quantity * item.unitPrice * item.cgstRate) / 100,
      SgstAmt: (item.quantity * item.unitPrice * item.sgstRate) / 100,
      TotItemVal: item.totalAmount
    })),
    ValDetails: {
      AssVal: invoice.subtotal,
      CgstVal: invoice.cgstTotal,
      SgstVal: invoice.sgstTotal,
      IgstVal: invoice.igstTotal,
      Discount: invoice.discountTotal,
      TotInvVal: invoice.grandTotal
    }
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `NIC_EInvoice_${invoice.invoiceNumber}.json`;
  a.click();
}

/**
 * Generates official E-Way Bill JSON payload for inter-state goods transport consignment (> ₹50,000).
 */
export function exportEWayBillJSON(invoice: Invoice, business: BusinessDetails, transporter: TransporterDetails) {
  const payload = {
    supplyType: "O",
    subSupplyType: "1",
    docType: "INV",
    docNo: invoice.invoiceNumber,
    docDate: invoice.invoiceDate.split('-').reverse().join('/'),
    fromGstin: business.gstin,
    fromTrdName: business.name,
    fromAddr1: business.address,
    fromPlace: business.state,
    fromPincode: 400001,
    actFromStateCode: 27,
    fromStateCode: 27,
    toGstin: invoice.partyGstin || "URP",
    toTrdName: invoice.partyName,
    toAddr1: invoice.partyPhone || "Customer",
    toPlace: "Mumbai",
    toPincode: 400001,
    actToStateCode: 27,
    toStateCode: 27,
    totalValue: invoice.subtotal,
    cgstValue: invoice.cgstTotal,
    sgstValue: invoice.sgstTotal,
    igstValue: invoice.igstTotal,
    totInvValue: invoice.grandTotal,
    transporterId: transporter.transporterId,
    transporterName: transporter.transporterName,
    transDocNo: `TD-${Date.now().toString().slice(-6)}`,
    transMode: transporter.mode === 'ROAD' ? "1" : "2",
    transDistance: transporter.distanceKm.toString(),
    vehicleNo: transporter.vehicleNumber,
    vehicleType: "R",
    itemList: invoice.items.map(item => ({
      productName: item.itemName,
      hsnCode: parseInt(item.hsnSacCode) || 1000,
      quantity: item.quantity,
      qtyUnit: item.unitType,
      taxableAmount: item.quantity * item.unitPrice,
      cgstRate: item.cgstRate,
      sgstRate: item.sgstRate,
      igstRate: item.igstRate
    }))
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `EWayBill_${invoice.invoiceNumber}.json`;
  a.click();
}
