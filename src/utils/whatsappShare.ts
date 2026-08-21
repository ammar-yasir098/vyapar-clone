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
 * Converts a Blob to a Base64 string asynchronously without blocking the UI thread.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Converts Tailwind v4 oklch(...) color string to standard hex color.
 * Preserves light backgrounds (slate-50/100) vs dark headers/text (slate-800/900).
 */
export function convertOklchToHex(oklchStr: string): string {
  const match = oklchStr.match(/oklch\(\s*([\d.]+)\%?\s+([\d.]+)\s+([\d.]+)/i);
  if (match) {
    let l = parseFloat(match[1]);
    if (l > 1) l = l / 100;
    if (l >= 0.85) return '#f8fafc'; // light background
    if (l >= 0.70) return '#e2e8f0'; // light border
    if (l <= 0.35) return '#0f172a'; // dark header/text
    if (l <= 0.50) return '#1e293b'; // medium dark text
    return '#475569';
  }
  return '#f8fafc';
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
      scale: 2, // High resolution scale for crisp text rendering
      useCORS: true,
      logging: false,
      letterRendering: true,
      windowWidth: element.scrollWidth,
      onclone: (clonedDoc: Document) => {
        // 1. Sanitize all <style> tags in cloned document to convert Tailwind 4 oklch() colors cleanly
        const styleTags = clonedDoc.querySelectorAll('style');
        styleTags.forEach((styleTag) => {
          if (styleTag.textContent && styleTag.textContent.includes('oklch')) {
            styleTag.textContent = styleTag.textContent.replace(/oklch\([^)]+\)/gi, (match) => convertOklchToHex(match));
          }
        });

        // 2. Convert element inline & computed oklch() styles to standard RGB/hex via Canvas 2D
        const container = clonedDoc.getElementById('printable-invoice') || clonedDoc.body;
        if (container) {
          const canvas = clonedDoc.createElement('canvas');
          const ctx = canvas.getContext('2d');

          const resolveColorToHex = (colorStr: string): string => {
            if (!ctx) return convertOklchToHex(colorStr);
            try {
              ctx.fillStyle = '#000000';
              ctx.fillStyle = colorStr;
              const computedHex = ctx.fillStyle;
              if (computedHex && computedHex !== '#000000') return computedHex;
              return convertOklchToHex(colorStr);
            } catch {
              return convertOklchToHex(colorStr);
            }
          };

          const elements = [container, ...Array.from(container.querySelectorAll('*'))];
          elements.forEach((el) => {
            if (!(el instanceof HTMLElement)) return;

            const inlineStyle = el.getAttribute('style') || '';
            if (inlineStyle.includes('oklch')) {
              el.setAttribute(
                'style',
                inlineStyle.replace(/oklch\([^)]+\)/gi, (match) => resolveColorToHex(match))
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
                  const converted = resolveColorToHex(val);
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
  preferOpenApp?: boolean;
}

export interface ShareResult {
  success: boolean;
  mode: 'automated' | 'native_share' | 'whatsapp_link';
  message: string;
  whatsappUrl?: string;
  whatsappDesktopUrl?: string;
}

/**
 * Smart Automated & Interactive WhatsApp Share:
 * Supports 2 Modes:
 * 1. Interactive Open App Mode (preferOpenApp = true): Launches WhatsApp App/Web with recipient chat open & pre-filled message, downloads PDF for 1-click attachment!
 * 2. Automated Background Mode (preferOpenApp = false): Sends PDF directly in background via local Express Baileys engine.
 */
export async function shareInvoiceViaWhatsApp({
  invoice,
  business,
  targetElement,
  paperFormat = 'a4',
  customMessage,
  preferOpenApp = true
}: ShareInvoiceParams): Promise<ShareResult> {
  try {
    const invNumber = invoice.invoiceNumber || 'INV-000';
    const filename = `Invoice_${invNumber}_${paperFormat.toUpperCase()}.pdf`;

    // 1. Generate high-quality PDF Blob matching selected paper format
    const blob = await generateInvoicePdfBlob(targetElement, filename, paperFormat);
    const pdfFile = new File([blob], filename, { type: 'application/pdf' });

    // Yield thread to keep UI smooth and responsive
    await new Promise(resolve => setTimeout(resolve, 10));

    // 2. Fetch fresh updated party phone number from Dexie DB
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

    const encodedText = encodeURIComponent(defaultText);
    const whatsappUrl = targetPhone 
      ? `https://wa.me/${targetPhone}?text=${encodedText}`
      : `https://wa.me/?text=${encodedText}`;

    const whatsappDesktopUrl = targetPhone
      ? `whatsapp://send?phone=${targetPhone}&text=${encodedText}`
      : `whatsapp://send?text=${encodedText}`;

    // MODE A: INTERACTIVE OPEN APP MODE (Opens WhatsApp app/web, shows customer chat, user hits Enter to send!)
    if (preferOpenApp) {
      // 1. Download PDF Blob
      downloadPdfBlob(blob, filename);

      // 2. Launch WhatsApp Desktop App or Web
      try {
        window.location.href = whatsappDesktopUrl;
      } catch {
        window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      }

      return {
        success: true,
        mode: 'whatsapp_link',
        message: `📱 WhatsApp opened! Chat with +${targetPhone || 'customer'} loaded. PDF downloaded. Click 📎 or drag & drop PDF in WhatsApp!`,
        whatsappUrl,
        whatsappDesktopUrl
      };
    }

    // MODE B: AUTOMATED BACKGROUND DELIVERY (Sends PDF in background via Baileys engine)
    try {
      const pdfBase64 = await blobToBase64(blob);
      await new Promise(resolve => setTimeout(resolve, 10));

      const autoRes = await fetch('http://localhost:5000/api/v1/whatsapp/send-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientPhone: targetPhone,
          messageText: defaultText,
          pdfBase64: pdfBase64,
          filename: filename
        })
      });

      if (autoRes.ok) {
        const autoJson = await autoRes.json();
        if (autoJson.success) {
          return {
            success: true,
            mode: 'automated',
            message: `🎉 PDF Invoice sent automatically to WhatsApp (+${targetPhone}) with zero manual attachment!`
          };
        }
      }
    } catch (autoErr) {
      console.info('Local WhatsApp automated service not active, switching to interactive WhatsApp launch:', autoErr);
    }

    // Fallback: Launch WhatsApp app
    downloadPdfBlob(blob, filename);
    try {
      window.location.href = whatsappDesktopUrl;
    } catch {
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    }

    return {
      success: true,
      mode: 'whatsapp_link',
      message: `PDF downloaded! WhatsApp opened for +${targetPhone || 'customer'}.`,
      whatsappUrl,
      whatsappDesktopUrl
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
