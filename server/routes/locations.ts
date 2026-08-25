import { Router, Request, Response } from 'express';
import { InventoryLocation, ItemLocationMapping, StockTransfer, isDbConnected } from '../db/sequelize.js';

export const locationsRouter = Router();

// GET /api/v1/locations — Fetch all locations for a tenant
locationsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = (req.query.tenantId as string) || (req as any).user?.tenantId || 'default-tenant';
    const locations = await InventoryLocation.findAll({
      where: { tenantId },
      order: [['id', 'ASC']]
    });
    return res.json({ success: true, data: locations });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/locations — Create or update location
locationsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = req.body.tenantId || (req as any).user?.tenantId || 'default-tenant';
    const { id, name, code, type, parentId, capacity, description } = req.body;

    let loc;
    if (id) {
      loc = await InventoryLocation.findByPk(id);
      if (loc) {
        await loc.update({ name, code, type, parentId, capacity, description });
      }
    }

    if (!loc) {
      loc = await InventoryLocation.create({
        tenantId,
        name,
        code,
        type: type || 'WAREHOUSE',
        parentId: parentId ? Number(parentId) : null,
        capacity: capacity ? Number(capacity) : 500,
        description
      });
    }

    return res.json({ success: true, data: loc });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/locations/:id — Delete a location
locationsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid location ID' });

    await InventoryLocation.destroy({ where: { parentId: id } });
    await InventoryLocation.destroy({ where: { id } });

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/locations/mappings — Fetch item location mappings for a tenant
locationsRouter.get('/mappings', async (req: Request, res: Response) => {
  try {
    const tenantId = (req.query.tenantId as string) || (req as any).user?.tenantId || 'default-tenant';
    const mappings = await ItemLocationMapping.findAll({
      where: { tenantId }
    });
    return res.json({ success: true, data: mappings });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/locations/mappings — Upsert item location mapping
locationsRouter.post('/mappings', async (req: Request, res: Response) => {
  try {
    const tenantId = req.body.tenantId || (req as any).user?.tenantId || 'default-tenant';
    const { itemId, locationId, quantity, maxCapacity } = req.body;
    const numItemId = Number(itemId);
    const numLocId = Number(locationId);

    let mapping = await ItemLocationMapping.findOne({
      where: { tenantId, itemId: numItemId, locationId: numLocId }
    });

    if (mapping) {
      await mapping.update({ quantity: Number(quantity) || 0, maxCapacity: Number(maxCapacity) || 100 });
    } else {
      mapping = await ItemLocationMapping.create({
        tenantId,
        itemId: numItemId,
        locationId: numLocId,
        quantity: Number(quantity) || 0,
        maxCapacity: Number(maxCapacity) || 100
      });
    }

    return res.json({ success: true, data: mapping });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/locations/transfers — Fetch stock transfers
locationsRouter.get('/transfers', async (req: Request, res: Response) => {
  try {
    const tenantId = (req.query.tenantId as string) || (req as any).user?.tenantId || 'default-tenant';
    const transfers = await StockTransfer.findAll({
      where: { tenantId },
      order: [['id', 'DESC']]
    });
    return res.json({ success: true, data: transfers });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/locations/transfers — Log stock transfer
locationsRouter.post('/transfers', async (req: Request, res: Response) => {
  try {
    const tenantId = req.body.tenantId || (req as any).user?.tenantId || 'default-tenant';
    const { transferNumber, sourceLocationId, destinationLocationId, itemId, quantity, transferDate, notes } = req.body;

    const trf = await StockTransfer.create({
      transferNumber: transferNumber || `TRF-${Date.now()}`,
      tenantId,
      sourceLocationId,
      destinationLocationId,
      itemId,
      quantity,
      transferDate: transferDate || new Date().toISOString().split('T')[0],
      notes
    });

    return res.json({ success: true, data: trf });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
