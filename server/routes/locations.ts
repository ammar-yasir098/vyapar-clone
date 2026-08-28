import { Router, Request, Response } from 'express';
import { InventoryLocation, ItemLocationMapping, StockTransfer, Item, StoreWarehouseAccess, isDbConnected } from '../db/sequelize.js';

export const locationsRouter = Router();

// Clean up duplicate inventory location rows in PostgreSQL (e.g. repeated GAMEGEEKS warehouses)
export async function cleanupDuplicateLocations() {
  if (!isDbConnected()) return;
  try {
    const allLocs = await InventoryLocation.findAll({ order: [['id', 'ASC']] });
    const seen = new Set<string>();
    const duplicateIds: (string | number)[] = [];

    for (const l of allLocs) {
      const tenantKey = l.tenantId || 'default-tenant';
      const key = `${tenantKey}_${l.code}_${l.type}`;
      if (seen.has(key)) {
        duplicateIds.push(l.id);
      } else {
        seen.add(key);
      }
    }

    if (duplicateIds.length > 0) {
      await InventoryLocation.destroy({ where: { id: duplicateIds } });
      console.log(`🧹 [CLEANUP] Automatically removed ${duplicateIds.length} duplicate inventory location rows from PostgreSQL.`);
    }
  } catch (err) {
    console.warn('Cleanup duplicate locations warning:', err);
  }
}

// GET /api/v1/locations — Fetch joined inventory locations across all store branches
locationsRouter.get('/', async (req: Request, res: Response) => {
  try {
    await cleanupDuplicateLocations().catch(() => {});
    const locations = await InventoryLocation.findAll({
      order: [['id', 'ASC']]
    });
    return res.json({ success: true, data: locations });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/locations — Create or update location (With strict deduplication & warehouse access sync)
locationsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = req.body.tenantId || (req as any).user?.tenantId || 'default-tenant';
    const { id, name, code, type, parentId, capacity, description, isShared, allowedTenantIds } = req.body;

    let loc;
    if (id) {
      loc = await InventoryLocation.findByPk(String(id));
    }
    if (!loc && code) {
      loc = await InventoryLocation.findOne({ where: { tenantId, code } });
    }
    if (!loc && name && type) {
      loc = await InventoryLocation.findOne({ where: { tenantId, name, type } });
    }

    const payloadData = {
      id: id ? String(id) : `wh-${Date.now()}`,
      tenantId,
      name,
      code,
      type: type || 'WAREHOUSE',
      parentId: parentId ? String(parentId) : null,
      capacity: capacity ? Number(capacity) : 500,
      description,
      isShared: !!isShared,
      allowedTenantIds: allowedTenantIds || []
    };

    if (loc) {
      await loc.update(payloadData);
    } else {
      loc = await InventoryLocation.create(payloadData);
    }

    // Sync StoreWarehouseAccess permissions table
    if (Array.isArray(allowedTenantIds)) {
      for (const storeId of allowedTenantIds) {
        const accessId = `access-${storeId}-${loc.get('id')}`;
        await StoreWarehouseAccess.upsert({
          id: accessId,
          tenantId,
          storeId,
          warehouseId: String(loc.get('id'))
        }).catch(() => {});
      }
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
    let mappings = await ItemLocationMapping.findAll({
      where: { tenantId }
    });

    // Auto-heal mismatched item_id entries & prune invalid location_id rows (e.g., location 7, 51)
    const dbItems = await Item.findAll({ where: { tenantId }, order: [['id', 'ASC']] });
    const dbLocs = await InventoryLocation.findAll();
    const validLocationIds = new Set(dbLocs.map(l => l.id));

    if (mappings.length > 0) {
      const validItemIds = new Set(dbItems.map(i => i.id));
      let needsRefetch = false;

      for (let idx = 0; idx < mappings.length; idx++) {
        const m = mappings[idx];

        // Prune orphaned mappings pointing to non-existent location IDs in PostgreSQL (e.g., 7, 51)
        if (!validLocationIds.has(m.locationId)) {
          await m.destroy();
          needsRefetch = true;
          continue;
        }

        // Auto-heal item_id if invalid
        if (dbItems.length > 0 && !validItemIds.has(m.itemId)) {
          const matchedItem = dbItems[idx % dbItems.length];
          if (matchedItem) {
            await m.update({ itemId: matchedItem.id });
            needsRefetch = true;
          }
        }
      }
      if (needsRefetch) {
        mappings = await ItemLocationMapping.findAll({ where: { tenantId } });
      }
    }

    return res.json({ success: true, data: mappings });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/locations/mappings — Upsert item location mapping
locationsRouter.post('/mappings', async (req: Request, res: Response) => {
  try {
    const tenantId = req.body.tenantId || (req as any).user?.tenantId || 'default-tenant';
    const { itemId, skuCode, name, locationId, locationCode, quantity, maxCapacity } = req.body;
    let numItemId = Number(itemId);
    let numLocId = Number(locationId);

    // Resolve real PostgreSQL locationId if local Dexie locationId differs
    if (locationCode) {
      const foundLoc = await InventoryLocation.findOne({ where: { code: locationCode } });
      if (foundLoc) numLocId = foundLoc.id;
    }

    // Resolve real PostgreSQL itemId for this store tenant
    const dbItems = await Item.findAll({ where: { tenantId }, order: [['id', 'ASC']] });
    if (dbItems.length > 0) {
      let found = dbItems.find(i => i.id === numItemId);
      if (!found && skuCode) found = dbItems.find(i => i.skuCode === skuCode);
      if (!found && name) found = dbItems.find(i => i.name === name);
      if (found) numItemId = found.id;
    }

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
