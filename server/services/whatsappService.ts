import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type WhatsAppStatus = 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'CONNECTED';

let sock: WASocket | null = null;
let connectionStatus: WhatsAppStatus = 'DISCONNECTED';
let qrCodeDataUrl: string | null = null;
let connectedPhone: string | null = null;
let isInitializing = false;

const authFolder = path.join(__dirname, '..', 'whatsapp_auth');

export function getWhatsAppStatus() {
  return {
    status: connectionStatus,
    qrCodeDataUrl,
    connectedPhone
  };
}

export async function initWhatsAppService() {
  if (isInitializing || connectionStatus === 'CONNECTED') {
    return;
  }
  isInitializing = true;
  connectionStatus = 'CONNECTING';

  try {
    if (!fs.existsSync(authFolder)) {
      fs.mkdirSync(authFolder, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authFolder);

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      logger: pino({ level: 'silent' }) as any,
      browser: ['Vyapar POS Software', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        connectionStatus = 'QR_READY';
        try {
          qrCodeDataUrl = await QRCode.toDataURL(qr);
        } catch (qrErr) {
          console.error('Error generating QR code data URL:', qrErr);
        }
        console.log('📱 [WhatsApp Local Service] Scan QR Code in terminal or UI to link your WhatsApp account.');
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
        connectionStatus = 'DISCONNECTED';
        qrCodeDataUrl = null;
        connectedPhone = null;
        sock = null;
        isInitializing = false;

        console.log('⚠️ [WhatsApp Local Service] Connection closed.', shouldReconnect ? 'Reconnecting...' : 'Logged out.');
        if (shouldReconnect) {
          setTimeout(() => {
            initWhatsAppService().catch(console.error);
          }, 3000);
        }
      } else if (connection === 'open') {
        connectionStatus = 'CONNECTED';
        qrCodeDataUrl = null;
        isInitializing = false;

        const userJid = sock?.user?.id || '';
        connectedPhone = userJid.split(':')[0] || userJid.split('@')[0] || 'Connected';
        console.log(`✅ [WhatsApp Local Service] Connected successfully as ${connectedPhone}! Automated PDF delivery is ONLINE.`);
      }
    });
  } catch (error) {
    console.error('Failed to initialize WhatsApp Baileys service:', error);
    connectionStatus = 'DISCONNECTED';
    isInitializing = false;
  }
}

/**
 * Sends a PDF Document with caption text to a recipient phone number via linked WhatsApp account.
 */
export async function sendPdfDocument(
  recipientPhone: string,
  pdfBuffer: Buffer,
  filename: string,
  caption: string
): Promise<{ success: boolean; message: string }> {
  if (connectionStatus !== 'CONNECTED' || !sock) {
    return {
      success: false,
      message: 'WhatsApp Local Service is not connected. Please scan the QR code to link your WhatsApp account.'
    };
  }

  // Clean phone number (e.g. 03001234567 -> 923001234567)
  let cleaned = recipientPhone.replace(/[^\d]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '92' + cleaned.substring(1);
  }

  if (!cleaned || cleaned.length < 10) {
    return {
      success: false,
      message: `Invalid recipient phone number format: ${recipientPhone}`
    };
  }

  const jid = `${cleaned}@s.whatsapp.net`;

  try {
    await sock.sendMessage(jid, {
      document: pdfBuffer,
      mimetype: 'application/pdf',
      fileName: filename,
      caption: caption
    });

    return {
      success: true,
      message: `PDF invoice successfully sent to WhatsApp number +${cleaned}!`
    };
  } catch (err: any) {
    console.error('Error sending WhatsApp message via Baileys:', err);
    return {
      success: false,
      message: err?.message || 'Failed to send WhatsApp document.'
    };
  }
}
