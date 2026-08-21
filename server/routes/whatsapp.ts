import { Router, Request, Response } from 'express';
import { getWhatsAppStatus, initWhatsAppService, sendPdfDocument } from '../services/whatsappService.js';

export const whatsappRouter = Router();

// GET /api/v1/whatsapp/status - Returns WhatsApp connection state & QR code
whatsappRouter.get('/status', (req: Request, res: Response) => {
  try {
    const statusInfo = getWhatsAppStatus();
    return res.json({ success: true, ...statusInfo });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/whatsapp/connect - Trigger WhatsApp initialization
whatsappRouter.post('/connect', async (req: Request, res: Response) => {
  try {
    initWhatsAppService().catch(console.error);
    return res.json({ success: true, message: 'WhatsApp service initialization started.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/whatsapp/send-pdf - Send PDF document via linked WhatsApp account
whatsappRouter.post('/send-pdf', async (req: Request, res: Response) => {
  try {
    const { recipientPhone, messageText, pdfBase64, filename = 'Invoice.pdf' } = req.body;

    if (!recipientPhone || !pdfBase64) {
      return res.status(400).json({
        success: false,
        error: 'recipientPhone and pdfBase64 are required parameters.'
      });
    }

    // Convert Base64 PDF string to Buffer
    const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
    const pdfBuffer = Buffer.from(cleanBase64, 'base64');

    const result = await sendPdfDocument(recipientPhone, pdfBuffer, filename, messageText || '');
    return res.json(result);
  } catch (err: any) {
    console.error('Error in /api/v1/whatsapp/send-pdf route:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
