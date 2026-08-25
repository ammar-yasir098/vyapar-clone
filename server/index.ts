import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { bootstrapSequelize } from './db/sequelize.js';
import { syncRouter } from './routes/sync.js';
import { authRouter } from './routes/auth.js';
import { itemsRouter } from './routes/items.js';
import { partiesRouter } from './routes/parties.js';
import { invoicesRouter } from './routes/invoices.js';
import { purchasesRouter } from './routes/purchases.js';
import { companyRouter } from './routes/company.js';
import { estimatesRouter } from './routes/estimates.js';
import { paymentsRouter } from './routes/payments.js';
import { purchaseOrdersRouter } from './routes/purchaseOrders.js';
import { expensesRouter } from './routes/expenses.js';
import { purchaseReturnsRouter } from './routes/purchaseReturns.js';
import { saleReturnsRouter } from './routes/saleReturns.js';
import { cashRouter } from './routes/cash.js';
import { locationsRouter } from './routes/locations.js';
import { whatsappRouter } from './routes/whatsapp.js';
import { initWhatsAppService } from './services/whatsappService.js';

import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

import { authenticateJwt } from './middleware/auth.js';

// REST API v1 Routes — Public
app.use('/api/v1/auth', authRouter);

// REST API v1 Routes — Protected Data & Sync Endpoints
app.use('/api/v1/sync', (req, res, next) => {
  if (req.path === '/health') return next();
  return authenticateJwt(req, res, next);
}, syncRouter);
app.use('/api/v1/company', authenticateJwt, companyRouter);
app.use('/api/v1/items', authenticateJwt, itemsRouter);
app.use('/api/v1/parties', authenticateJwt, partiesRouter);
app.use('/api/v1/invoices', authenticateJwt, invoicesRouter);
app.use('/api/v1/purchases', authenticateJwt, purchasesRouter);
app.use('/api/v1/estimates', authenticateJwt, estimatesRouter);
app.use('/api/v1/payments', authenticateJwt, paymentsRouter);
app.use('/api/v1/purchase-orders', authenticateJwt, purchaseOrdersRouter);
app.use('/api/v1/expenses', authenticateJwt, expensesRouter);
app.use('/api/v1/purchase-returns', authenticateJwt, purchaseReturnsRouter);
app.use('/api/v1/sale-returns', authenticateJwt, saleReturnsRouter);
app.use('/api/v1/cash', authenticateJwt, cashRouter);
app.use('/api/v1/locations', authenticateJwt, locationsRouter);

// WhatsApp Automated Service Routes (Public/Internal for local app)
app.use('/api/v1/whatsapp', whatsappRouter);

// Root Status
app.get('/', (req: Request, res: Response) => {
  res.json({
    app: 'Vyapar Cloud Enterprise API Server (Sequelize ORM)',
    status: 'ONLINE',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(`🚀 Vyapar Cloud Backend API Server running on port ${PORT}`);
  console.log(`📡 Sequelize ORM REST API endpoints:`);
  console.log(`   - GET/POST http://localhost:${PORT}/api/v1/company`);
  console.log(`   - GET/POST http://localhost:${PORT}/api/v1/items`);
  console.log(`   - GET/POST http://localhost:${PORT}/api/v1/parties`);
  console.log(`   - GET/POST http://localhost:${PORT}/api/v1/invoices`);
  console.log(`   - GET      http://localhost:${PORT}/api/v1/whatsapp/status`);
  console.log(`=======================================================`);
  await bootstrapSequelize();

  // Asynchronously initialize local WhatsApp Baileys service
  initWhatsAppService().catch((err) => {
    console.error('Error starting WhatsApp Baileys service:', err);
  });
});

