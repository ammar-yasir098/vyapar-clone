import html2pdf from 'html2pdf.js';
import { Invoice, BusinessDetails, Party } from '../types';
import { db } from '../db';

export type InvoiceFormat = 'a4' | 'a5' | '80mm' | '58mm';

/**
 * Sanitizes phone numbers into international format (e.g., 03001234567 -> 923001234567).
 * Default country prefix applied is 92 (Pakistan) if leading 0 is present.
 */
export function sanitizePhoneNumber(phone?: string): string {
  if (!phone) return '';
  
  // Remove all non-digit characters except leading plus
  let cleaned = phone.trim().replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+')) {
    return cleaned.replace('+', '');
  }

  // If starts with 0 (e.g., 03001234567), convert to international 923001234567
  if (cleaned.startsWith('0')) {
    return '92' + cleaned.substring(1);
  }

  return cleaned;
}

/**
 * Converts a target DOM element (e.g. #printable-invoice) into a high-resolution PDF Blob
 * matching the selected paper format (A4, A5, 80mm thermal, 58mm thermal).
 * Includes automatic CSS oklch() color conversion for html2canvas compatibility.
 */
export async function generateInvoicePdfBlob(
  element: HTMLElement,
  filename: string,
  paperFormat: InvoiceFormat = 'a4'
): Promise<Blob> {
  let jsPDFConfig: { unit: string; format: string | [number, number]; orientation: 'portrait' | 'landscape' } = {
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait'
  };

  let marginTuple: [number, number, number, number] = [5, 5, 5, 5];

  if (paperFormat === 'a5') {
    jsPDFConfig = { unit: 'mm', format: 'a5', orientation: 'portrait' };
    marginTuple = [3, 3, 3, 3];
  } else if (paperFormat === '80mm') {
    // 80mm thermal roll format: 80mm width x 220mm length
    jsPDFConfig = { unit: 'mm', format: [80, 220], orientation: 'portrait' };
    marginTuple = [2, 2, 2, 2];
  } else if (paperFormat === '58mm') {
    // 58mm thermal roll format: 58mm width x 200mm length
    jsPDFConfig = { unit: 'mm', format: [58, 200], orientation: 'portrait' };
    marginTuple = [1, 1, 1, 1];
  }

  const options = {
    margin: marginTuple,
    filename: filename,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
      letterRendering: true,
      onclone: (clonedDoc: Document) => {
        // 1. Sanitize all <style> tags in cloned document to convert Tailwind 4 oklch() colors
        const styleTags = clonedDoc.querySelectorAll('style');
        styleTags.forEach((styleTag) => {
          if (styleTag.textContent && styleTag.textContent.includes('oklch')) {
            // Replace oklch(...) occurrences in CSS rules with standard hex/rgba fallback
            styleTag.textContent = styleTag.textContent.replace(/oklch\([^)]+\)/gi, '#334155');
          }
        });

        // 2. Convert element inline & computed oklch() styles to standard RGB/hex via Canvas 2D
        const container = clonedDoc.getElementById('printable-invoice') || clonedDoc.body;
        if (container) {
          const canvas = clonedDoc.createElement('canvas');
          const ctx = canvas.getContext('2d');

          const convertColorToHex = (colorStr: string): string => {
            if (!ctx) return '#334155';
            try {
              ctx.fillStyle = '#000000';
              ctx.fillStyle = colorStr;
              return ctx.fillStyle || '#334155';
            } catch {
              return '#334155';
            }
          };

          const elements = [container, ...Array.from(container.querySelectorAll('*'))];
          elements.forEach((el) => {
            if (!(el instanceof HTMLElement)) return;

            const inlineStyle = el.getAttribute('style') || '';
            if (inlineStyle.includes('oklch')) {
              el.setAttribute(
                'style',
                inlineStyle.replace(/oklch\([^)]+\)/gi, (match) => convertColorToHex(match))
              );
            }

            try {
              const computed = window.getComputedStyle(el);
              const props = [
                'color',
                'background-color',
                'border-color',
                'border-top-color',
                'border-bottom-color',
                'border-left-color',
                'border-right-color',
                'fill',
                'stroke'
              ];

              props.forEach((prop) => {
                const val = computed.getPropertyValue(prop);
                if (val && val.includes('oklch')) {
                  const converted = convertColorToHex(val);
                  el.style.setProperty(prop, converted, 'important');
                }
              });
            } catch {}
          });
        }
      }
    },
    jsPDF: jsPDFConfig
  };

  const worker = html2pdf().set(options).from(element);
  const pdfBlob: Blob = await worker.output('blob');
  return pdfBlob;
}

/**
 * Triggers an in-memory browser download for a PDF Blob without disk clutter.
 */
export function downloadPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

export interface ShareInvoiceParams {
  invoice: Invoice;
  business: BusinessDetails;
  targetElement: HTMLElement;
  paperFormat?: InvoiceFormat;
  customMessage?: string;
}

export interface ShareResult {
  success: boolean;
  mode: 'native_share' | 'whatsapp_link';
  message: string;
  whatsappUrl?: string;
}

/**
 * Smart Hybrid WhatsApp Share:
 * 1. Dynamically fetches the latest updated party phone from Dexie DB (handling string vs number IDs).
 * 2. Generates PDF Blob smoothly with oklch color sanitization.
 * 3. On Mobile, attempts native Web Share API with catch fallback.
 * 4. On Desktop / Fallback, downloads PDF Blob in-memory & opens WhatsApp Web without blank tab flickers.
 */
export async function shareInvoiceViaWhatsApp({
  invoice,
  business,
  targetElement,
  paperFormat = 'a4',
  customMessage
}: ShareInvoiceParams): Promise<ShareResult> {
  try {
    const invNumber = invoice.invoiceNumber || 'INV-000';
    const filename = `Invoice_${invNumber}_${paperFormat.toUpperCase()}.pdf`;

    // 1. Generate high-quality PDF Blob matching selected paper format
    const blob = await generateInvoicePdfBlob(targetElement, filename, paperFormat);
    const pdfFile = new File([blob], filename, { type: 'application/pdf' });

    // 2. Fetch fresh updated party phone number from Dexie DB (robust against string vs number ID types)
    let livePartyPhone = invoice.partyPhone;
    try {
      let partyRecord: Party | undefined;
      const numPartyId = invoice.partyId !== undefined && invoice.partyId !== null ? Number(invoice.partyId) : NaN;

      if (!isNaN(numPartyId)) {
        partyRecord = await db.parties.get(numPartyId);
      }

      if (!partyRecord && invoice.partyName) {
        const cleanName = invoice.partyName.trim().toLowerCase();
        const allParties = await db.parties.toArray();
        partyRecord = allParties.find(p => (p.name || '').trim().toLowerCase() === cleanName);
      }

      if (partyRecord && partyRecord.phone) {
        livePartyPhone = partyRecord.phone;
      }
    } catch (dbErr) {
      console.warn('Could not fetch live party phone from Dexie, using invoice partyPhone snapshot:', dbErr);
    }

    const targetPhone = sanitizePhoneNumber(livePartyPhone);

    // Standardized WhatsApp text message
    const businessName = business.name || 'Our Store';
    const customerName = invoice.partyName || 'Valued Customer';
    const grandTotalFormatted = Number(invoice.grandTotal || 0).toFixed(2);
    const dueAmountFormatted = Number(invoice.dueAmount ?? (invoice.grandTotal - (invoice.receivedAmount || 0))).toFixed(2);

    const defaultText = customMessage || 
      `Dear ${customerName},\n\nThank you for doing business with ${businessName}.\n\n*Invoice #${invNumber}* (${paperFormat.toUpperCase()})\nDate: ${invoice.invoiceDate || ''}\nTotal Amount: Rs ${grandTotalFormatted}\nBalance Due: Rs ${dueAmountFormatted}\n\nPlease find your tax invoice PDF attached.`;

    // 3. Mobile Native Web Share API Check
    const isMobileDevice = typeof navigator !== 'undefined' && 
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isMobileDevice && typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
      try {
        await navigator.share({
          title: `Invoice #${invNumber} - ${businessName}`,
          text: defaultText,
          files: [pdfFile]
        });

        return {
          success: true,
          mode: 'native_share',
          message: 'Invoice shared via Web Share API successfully.'
        };
      } catch (shareErr: any) {
        // If user cancelled share or browser gesture token expired, log & gracefully fallback to WhatsApp link flow
        console.warn('Native Web Share skipped/failed, executing WhatsApp link fallback:', shareErr);
      }
    }

    // 4. Desktop / Standard WhatsApp Link & Download Flow:
    // A) Trigger in-memory PDF download for the user to attach in WhatsApp
    downloadPdfBlob(blob, filename);

    // B) Construct WhatsApp API link
    const encodedText = encodeURIComponent(defaultText);
    const whatsappUrl = targetPhone 
      ? `https://wa.me/${targetPhone}?text=${encodedText}`
      : `https://wa.me/?text=${encodedText}`;

    // C) Open WhatsApp Web / Desktop application
    try {
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    } catch (winErr) {
      console.warn('Window open blocked, user can click direct link:', winErr);
    }

    return {
      success: true,
      mode: 'whatsapp_link',
      message: `PDF (${paperFormat.toUpperCase()}) downloaded & WhatsApp opening! Please attach the downloaded PDF in WhatsApp.`,
      whatsappUrl
    };
  } catch (error: any) {
    console.error('Error during WhatsApp invoice sharing:', error);
    return {
      success: false,
      mode: 'whatsapp_link',
      message: error?.message || 'Failed to process WhatsApp sharing.'
    };
  }
}
