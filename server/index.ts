import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { bootstrapSequelize } from './db/sequelize.js';
import { syncRouter } from './routes/sync.js';
import { authRouter } from './routes/auth.js';
import { itemsRouter } from './routes/items.js';
import { partiesRouter } from './routes/parties.js';
import { invoicesRouter } from './routes/invoices.js';
import { ledgerRouter } from './routes/ledger.js';
import { purchasesRouter } from './routes/purchases.js';
import { companyRouter } from './routes/company.js';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// REST API v1 Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/sync', syncRouter);
app.use('/api/v1/company', companyRouter);
app.use('/api/v1/items', itemsRouter);
app.use('/api/v1/parties', partiesRouter);
app.use('/api/v1/invoices', invoicesRouter);
app.use('/api/v1/ledger', ledgerRouter);
app.use('/api/v1/purchases', purchasesRouter);

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
  console.log(`   - GET      http://localhost:${PORT}/api/v1/sync/health`);
  console.log(`=======================================================`);
  await bootstrapSequelize();
});
