import { Router, Request, Response } from 'express';
import { cloudStore } from '../db/store.js';

export const syncRouter = Router();

// GET /api/v1/health
syncRouter.get('/health', (req: Request, res: Response) => {
  return res.json({
    status: 'ONLINE',
    service: 'Vyapar Cloud Sync Engine',
    serverVersion: cloudStore.getLatestVersion(),
    timestamp: new Date().toISOString()
  });
});

// POST /api/v1/sync/push
syncRouter.post('/push', (req: Request, res: Response) => {
  const { tenantId, mutations } = req.body;

  if (!tenantId || !Array.isArray(mutations)) {
    return res.status(400).json({ error: 'Invalid push payload' });
  }

  const result = cloudStore.pushMutations(tenantId, mutations);

  console.log(`[CLOUD SYNC PUSH] Processed ${result.syncedCount} delta mutations for tenant: ${tenantId}`);

  return res.json({
    success: true,
    syncedCount: result.syncedCount,
    serverVersion: result.serverVersion,
    timestamp: new Date().toISOString()
  });
});

// GET /api/v1/sync/pull
syncRouter.get('/pull', (req: Request, res: Response) => {
  const tenantId = (req.query.tenantId as string) || 'default-tenant';
  const sinceSeq = parseInt(req.query.since as string) || 0;

  const serverDeltas = cloudStore.getMutationsSince(tenantId, sinceSeq);

  return res.json({
    tenantId,
    sinceSeq,
    deltasCount: serverDeltas.length,
    latestServerVersion: cloudStore.getLatestVersion(),
    deltas: serverDeltas
  });
});
