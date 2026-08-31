import React, { useState, useMemo, useCallback } from 'react';
import {
  Store,
  Building2,
  Package,
  AlertCircle,
  CheckCircle2,
  ArrowLeftRight,
  Search,
  Filter,
  Layers,
  MapPin,
  RefreshCw,
  X,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { Item, InventoryLocation, ItemLocationMapping, BusinessDetails } from '../../types';
import { db, getActiveTenantId } from '../../db';
import { ClientSyncManager } from '../../services/sync';
import { useLiveQuery } from 'dexie-react-hooks';
import { saveServerItemLocation, createServerStockTransfer } from '../../services/api';

interface StoreStockScreenProps {
  items: Item[];
  locations: InventoryLocation[];
  itemLocations: ItemLocationMapping[];
  business?: BusinessDetails;
}

export const StoreStockScreen: React.FC<StoreStockScreenProps> = ({
  items,
  locations,
  itemLocations,
  business
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'>('ALL');

  // Replenish Modal State
  const [replenishItem, setReplenishItem] = useState<Item | null>(null);
  const [sourceLocId, setSourceLocId] = useState<string>('');
  const [destLocId, setDestLocId] = useState<string>('');
  const [transferQty, setTransferQty] = useState<string>('10');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const tenantId = getActiveTenantId(business);

  const liveLocations = useLiveQuery(() => db.locations.toArray(), []) || [];
  const liveItemLocations = useLiveQuery(() => db.itemLocations.toArray(), []) || [];
  const activeLocations = liveLocations.length > 0 ? liveLocations : locations;
  const activeItemLocations = liveItemLocations.length > 0 ? liveItemLocations : itemLocations;

  // Auto-purge orphaned or invalid item location mappings from IndexedDB & Cloud Server
  React.useEffect(() => {
    if (activeLocations.length === 0 || activeItemLocations.length === 0) return;

    const validLocIds = new Set(activeLocations.map(l => String(l.id)));

    // Purge records that point to non-existent location IDs
    const invalidMappings = activeItemLocations.filter(il => 
      il.id && !validLocIds.has(String(il.locationId))
    );

    if (invalidMappings.length > 0) {
      console.log(`[Auto-Purge] Deleting ${invalidMappings.length} invalid mapping records from IndexedDB...`, invalidMappings);
      db.transaction('rw', db.itemLocations, async () => {
        for (const inv of invalidMappings) {
          if (inv.id) {
            await db.itemLocations.delete(inv.id);
            saveServerItemLocation({
              tenantId,
              itemId: String(inv.itemId) as any,
              skuCode: '',
              name: '',
              locationId: String(inv.locationId) as any,
              quantity: 0
            }).catch(() => {});
          }
        }
      }).catch(err => console.error('Error purging invalid mappings:', err));
    }
  }, [activeLocations.length, activeItemLocations.length, tenantId]);

  // Helper to match item location mapping to product (handles local ID, cloud ID, and SKU)
  const isItemMatch = (il: ItemLocationMapping, item: Item) => {
    if (String(il.itemId) === String(item.id)) return true;
    const cloudId = (item as any).cloudId;
    if (cloudId && String(il.itemId) === String(cloudId)) return true;
    const mapSku = (il as any).skuCode;
    if (item.skuCode && mapSku && item.skuCode.toLowerCase() === String(mapSku).toLowerCase()) return true;
    return false;
  };

  const liveStoreAccess = useLiveQuery(() => db.storeWarehouseAccess.toArray(), []);

  // Map of warehouse locations vs store locations (handles dedicated, central shared, and regional hubs)
  const { whLocationIds, storeLocations, warehouseLocations } = useMemo(() => {
    const accessWhSet = new Set<string>();
    if (liveStoreAccess && liveStoreAccess.length > 0) {
      liveStoreAccess.forEach(acc => {
        if (acc.storeId === tenantId) accessWhSet.add(String(acc.warehouseId));
      });
    }

    const whLocs = activeLocations.filter(l => {
      if (l.type !== 'WAREHOUSE') return false;
      if (l.tenantId === tenantId) return true;
      if (l.allowedTenantIds && l.allowedTenantIds.includes(tenantId)) return true;
      if (accessWhSet.has(String(l.id))) return true;
      return false;
    });
    const whIds = new Set<string | number>();
    whLocs.forEach(l => {
      whIds.add(l.id as any);
      whIds.add(String(l.id));
    });
    const storeLocs = activeLocations.filter(l => 
      (l.tenantId === tenantId || !l.tenantId) &&
      (l.isStoreFront || l.code === 'STORE-FRONT' || (l as any).type === 'STORE_FRONT' || (l as any).type === 'STORE')
    );
    return {
      whLocationIds: whIds,
      storeLocations: storeLocs,
      warehouseLocations: whLocs
    };
  }, [activeLocations, tenantId, liveStoreAccess]);

  // Main Store Front Location (default for POS retail floor)
  const storeFrontLocation = useMemo(() => {
    return storeLocations.find(l => (l.tenantId || 'default-tenant') === tenantId) || storeLocations[0] || activeLocations.find(l => l.isStoreFront || l.code === 'STORE-FRONT');
  }, [storeLocations, activeLocations, tenantId]);

  // Helper to resolve specific item location mappings (filtering out non-existent/deleted location IDs)
  const getItemLocationMappings = useCallback((item: Item) => {
    if (!item.id) return [];
    const validLocationIds = new Set(activeLocations.map(l => String(l.id)));

    const matches = activeItemLocations.filter(il => {
      if (!validLocationIds.has(String(il.locationId))) return false;

      if (String(il.itemId) === String(item.id)) return true;
      if ((item as any).cloudId && String(il.itemId) === String((item as any).cloudId)) return true;

      const mapSku = (il as any).skuCode;
      if (mapSku && item.skuCode && String(mapSku).toLowerCase() === item.skuCode.toLowerCase()) return true;

      return false;
    });

    // Deduplicate by locationId for this item
    const uniqueMap = new Map<string | number, ItemLocationMapping>();
    matches.forEach(m => {
      if (!uniqueMap.has(m.locationId)) {
        uniqueMap.set(m.locationId, { ...m });
      } else {
        const existing = uniqueMap.get(m.locationId)!;
        existing.quantity = Math.max(existing.quantity, m.quantity);
      }
    });

    return Array.from(uniqueMap.values()).filter(
      m => m.quantity > 0 && validLocationIds.has(String(m.locationId))
    );
  }, [activeItemLocations, activeLocations]);

  // Aggregate items with Store Front Stock vs Warehouse Stock
  const storeStockRows = useMemo(() => {
    const locMap = new Map<string, InventoryLocation>();
    activeLocations.forEach(l => { if (l.id) locMap.set(String(l.id), l); });

    return items.map(item => {
      const validMappings = getItemLocationMappings(item);

      // Store Front Stock = explicit stock transferred/allocated to active store front shelves
      const storeMaps = validMappings.filter(m => {
        const loc = locMap.get(String(m.locationId)) || activeLocations.find(l => String(l.id) === String(m.locationId));
        if (!loc || loc.type === 'WAREHOUSE') return false;
        const isStoreLoc = Boolean(loc.isStoreFront) || loc.code === 'STORE-FRONT' || loc.code?.includes('SF') || (loc as any).type === 'STORE' || (loc as any).type === 'STORE_FRONT';
        if (!isStoreLoc) return false;

        const locTenant = loc.tenantId || 'default-tenant';
        const mapTenant = m.tenantId || 'default-tenant';
        return locTenant === tenantId && mapTenant === tenantId;
      });
      // All store front allocations across all stores for this item
      const allStoreFrontsQty = validMappings
        .filter(m => {
          const loc = locMap.get(String(m.locationId)) || activeLocations.find(l => String(l.id) === String(m.locationId));
          if (!loc || loc.type === 'WAREHOUSE') return false;
          return Boolean(loc.isStoreFront) || loc.code === 'STORE-FRONT' || loc.code?.includes('SF') || (loc as any).type === 'STORE' || (loc as any).type === 'STORE_FRONT';
        })
        .reduce((sum: number, m: ItemLocationMapping) => sum + m.quantity, 0);

      const storeStock = storeMaps.reduce((sum: number, m: ItemLocationMapping) => sum + m.quantity, 0);

      // Warehouse Reserve Stock = Total item stock minus all stock transferred to all store floors
      const whStock = Math.max(0, item.currentStock - allStoreFrontsQty);
      const activeStoreTotalStock = whStock + storeStock;

      const alertMin = item.minStockAlert || 5;
      let status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' = 'IN_STOCK';
      if (storeStock === 0) {
        status = 'OUT_OF_STOCK';
      } else if (storeStock <= alertMin) {
        status = 'LOW_STOCK';
      }

      return {
        item,
        storeStock,
        whStock,
        unassignedStock: whStock,
        totalStock: activeStoreTotalStock,
        status,
        storeMaps,
        whMaps: validMappings.filter(m => !storeMaps.includes(m))
      };
    });
  }, [items, getItemLocationMappings, activeLocations]);

  // Filtered rows for display
  const filteredRows = useMemo(() => {
    return storeStockRows.filter(row => {
      const matchesSearch =
        !searchTerm ||
        (row.item?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (row.item?.skuCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (row.item?.barcode || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesFilter =
        filterStatus === 'ALL' ||
        row.status === filterStatus;

      return matchesSearch && matchesFilter;
    });
  }, [storeStockRows, searchTerm, filterStatus]);

  // Top Metrics
  const metrics = useMemo(() => {
    const totalStoreItems = storeStockRows.length;
    const totalStorePCS = storeStockRows.reduce((sum, r) => sum + r.storeStock, 0);
    const totalWarehousePCS = storeStockRows.reduce((sum, r) => sum + r.whStock, 0);
    const lowStockAlerts = storeStockRows.filter(r => r.status === 'LOW_STOCK' || r.status === 'OUT_OF_STOCK').length;
    const outOfStockAlerts = storeStockRows.filter(r => r.status === 'OUT_OF_STOCK').length;

    return {
      totalStoreItems,
      totalStorePCS,
      totalWarehousePCS,
      lowStockAlerts,
      outOfStockAlerts
    };
  }, [storeStockRows]);

  // Specific warehouse rack locations where currently selected replenishItem is located
  const activeProductAllocations = useMemo(() => {
    if (!replenishItem) return [];

    const validMappings = getItemLocationMappings(replenishItem);

    if (validMappings.length > 0) {
      return validMappings.map((m: ItemLocationMapping) => {
        const loc = locations.find(l => String(l.id) === String(m.locationId));
        const locCode = loc ? loc.code : `LOC-${m.locationId}`;
        const locName = loc ? loc.name : `Rack ${m.locationId}`;
        return {
          mapping: m,
          locationId: m.locationId,
          code: locCode,
          name: locName,
          availableQty: m.quantity
        };
      });
    }

    // Fallback: If product has unassigned stock or no specific rack mapping yet
    return [{
      mapping: null,
      locationId: locations[0]?.id || 1,
      code: 'GENERAL-STOCK',
      name: 'Unassigned (General Warehouse Reserve)',
      availableQty: replenishItem.currentStock
    }];
  }, [replenishItem, itemLocations, locations, items, getItemLocationMappings]);

  const getOrCreateStoreFrontLocationId = async (): Promise<string | number> => {
    let storeLoc = locations.find(l => 
      (l.tenantId || 'default-tenant') === tenantId && 
      (l.isStoreFront || l.code === 'STORE-FRONT' || l.name?.toLowerCase().includes('store front') || (l as any).type === 'STORE_FRONT')
    );

    if (storeLoc?.id) return storeLoc.id;

    const allTenantLocs = await db.locations.toArray();
    storeLoc = allTenantLocs.find(l => 
      (l.tenantId || 'default-tenant') === tenantId && 
      (l.isStoreFront || l.code === 'STORE-FRONT' || l.name?.toLowerCase().includes('store front') || (l as any).type === 'STORE_FRONT')
    );

    if (storeLoc?.id) return storeLoc.id;

    const newLocId = `sf-${tenantId}-${Date.now()}`;
    const newLocPayload = {
      id: newLocId,
      tenantId,
      name: `${business?.name || 'Store'} - Store Front / Sales Counter`,
      code: 'STORE-FRONT',
      type: 'SHELF' as const,
      isStoreFront: true,
      description: 'POS Ready Store Floor Display Stock',
      createdAt: new Date().toISOString()
    };
    await db.locations.put(newLocPayload);
    ClientSyncManager.logMutation('LOCATION', newLocId, 'INSERT', newLocPayload);

    return newLocId;
  };

  // Open Replenish Modal for an Item
  const handleOpenReplenishModal = async (item: Item) => {
    setReplenishItem(item);

    const validMappings = getItemLocationMappings(item);
    if (validMappings.length > 0) {
      setSourceLocId(String(validMappings[0].locationId));
    } else {
      setSourceLocId(String(locations[0]?.id || ''));
    }

    const sfId = await getOrCreateStoreFrontLocationId();
    setDestLocId(String(sfId));
    setTransferQty('10');
  };

  // Submit Stock Transfer from Warehouse to Store Front
  const handleConfirmTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replenishItem || !sourceLocId) {
      showToast('Please select valid source warehouse location', 'error');
      return;
    }

    const qty = parseInt(transferQty, 10);
    if (isNaN(qty) || qty <= 0) {
      showToast('Please enter a valid transfer quantity', 'error');
      return;
    }

    const srcLocNum = Number(sourceLocId);
    const targetDestLocId = destLocId ? destLocId : await getOrCreateStoreFrontLocationId();

    setIsSubmitting(true);
    try {
      // 1. Check available stock in source location
      const validMappings = getItemLocationMappings(replenishItem);
      const srcMapping = validMappings.find((m: ItemLocationMapping) => String(m.locationId) === String(sourceLocId)) ||
        await db.itemLocations
          .filter(il => (il.tenantId || 'default-tenant') === tenantId && String(il.itemId) === String(replenishItem.id) && String(il.locationId) === String(sourceLocId))
          .first();

      const availSrcQty = srcMapping ? srcMapping.quantity : replenishItem.currentStock;
      if (availSrcQty < qty) {
        showToast(`Insufficient stock in selected location (Available: ${availSrcQty} PCS)`, 'error');
        setIsSubmitting(false);
        return;
      }

      // 2. Deduct/release from source location
      const newSrcQty = Math.max(0, availSrcQty - qty);
      if (srcMapping && srcMapping.id) {
        await db.itemLocations.update(srcMapping.id, {
          quantity: newSrcQty,
          updatedAt: new Date().toISOString()
        });
        ClientSyncManager.logMutation('ITEM_LOCATION', String(srcMapping.id), 'UPDATE', { ...srcMapping, quantity: newSrcQty, updatedAt: new Date().toISOString() });
      }
      saveServerItemLocation({ tenantId, itemId: Number(replenishItem.id), skuCode: replenishItem.skuCode, name: replenishItem.name, locationId: sourceLocId as any, quantity: newSrcQty }).catch(() => {});

      // 3. Add to destination store front location
      const destMapping = await db.itemLocations
        .filter(il => (il.tenantId || 'default-tenant') === tenantId && String(il.itemId) === String(replenishItem.id) && String(il.locationId) === String(targetDestLocId))
        .first();

      const newDestQty = (destMapping ? destMapping.quantity : 0) + qty;
      if (destMapping && destMapping.id) {
        await db.itemLocations.update(destMapping.id, {
          quantity: newDestQty,
          updatedAt: new Date().toISOString()
        });
        ClientSyncManager.logMutation('ITEM_LOCATION', String(destMapping.id), 'UPDATE', { ...destMapping, quantity: newDestQty, updatedAt: new Date().toISOString() });
      } else {
        const destMapId = `map-${replenishItem.id}-${targetDestLocId}`;
        const mapPayload = {
          id: destMapId,
          tenantId,
          itemId: String(replenishItem.id),
          locationId: String(targetDestLocId),
          quantity: newDestQty,
          maxCapacity: 100,
          updatedAt: new Date().toISOString()
        };
        await db.itemLocations.put(mapPayload);
        ClientSyncManager.logMutation('ITEM_LOCATION', destMapId, 'INSERT', mapPayload);
      }
      saveServerItemLocation({ tenantId, itemId: Number(replenishItem.id), skuCode: replenishItem.skuCode, name: replenishItem.name, locationId: targetDestLocId as any, quantity: newDestQty }).catch(() => {});

      // 4. Record Stock Transfer Log
      const trfId = `trf-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const transferNo = `TRF-STORE-${Date.now().toString().slice(-6)}`;
      const srcLocObj = activeLocations.find(l => String(l.id) === String(sourceLocId));
      const destLocObj = activeLocations.find(l => String(l.id) === String(targetDestLocId));

      const srcLocName = srcLocObj ? `${srcLocObj.name} (${srcLocObj.code})` : 'Warehouse Reserve';
      const destLocName = destLocObj ? destLocObj.name : 'Store Front Floor / Display Counter';

      const transferPayload = {
        id: trfId,
        tenantId,
        transferNumber: transferNo,
        itemId: String(replenishItem.id),
        sourceLocationId: String(sourceLocId),
        destinationLocationId: String(targetDestLocId),
        quantity: qty,
        transferDate: new Date().toISOString().split('T')[0],
        notes: `Store Front Replenishment: Transferred ${qty} PCS of ${replenishItem.name} from ${srcLocName} to ${destLocName}`,
        createdAt: new Date().toISOString()
      };

      await db.stockTransfers.put(transferPayload);
      createServerStockTransfer(transferPayload).catch(() => {});
      ClientSyncManager.logMutation('STOCK_TRANSFER', trfId, 'INSERT', transferPayload);

      showToast(`Successfully transferred ${qty} PCS of "${replenishItem.name}" to Store Front!`, 'success');
      setReplenishItem(null);
    } catch (err: any) {
      showToast(`Transfer failed: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50/50 overflow-y-auto p-4 md:p-6 space-y-5">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg border text-xs font-extrabold flex items-center gap-2 animate-bounce ${
          toastMessage.type === 'success' ? 'bg-emerald-600 text-white border-emerald-700' :
          toastMessage.type === 'error' ? 'bg-red-600 text-white border-red-700' :
          'bg-slate-900 text-white border-slate-950'
        }`}>
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Store className="w-6 h-6 text-emerald-600" />
            Store Front Inventory & Replenishment
          </h1>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            Monitor on-shelf stock available for instant POS billing and replenish items directly from warehouse reserve
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="badge badge-green text-xs px-3 py-1 font-extrabold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            POS Ready Store Front
          </span>
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Store Items */}
        <div className="card bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>STORE FRONT ITEMS</span>
            <Package className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">{metrics.totalStoreItems}</div>
          <div className="text-[11px] text-slate-400 font-medium">Catalog items in active store</div>
        </div>

        {/* Metric 2: On-Shelf Available Stock */}
        <div className="card bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>ON-SHELF STORE STOCK</span>
            <Store className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-600 font-mono">{metrics.totalStorePCS} PCS</div>
          <div className="text-[11px] text-slate-400 font-medium">Available for instant POS billing</div>
        </div>

        {/* Metric 3: Warehouse Reserve Stock */}
        <div className="card bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>WAREHOUSE BACKROOM</span>
            <Building2 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-600 font-mono">{metrics.totalWarehousePCS} PCS</div>
          <div className="text-[11px] text-slate-400 font-medium">Reserve stock in backroom racks</div>
        </div>

        {/* Metric 4: Low Stock Alerts */}
        <div className="card bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>REPLENISHMENT ALERTS</span>
            <AlertCircle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-600 font-mono">{metrics.lowStockAlerts}</div>
          <div className="text-[11px] text-slate-400 font-medium">{metrics.outOfStockAlerts} Out of Store Stock</div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="card bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search Box */}
          <div className="md:col-span-8 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search store inventory by product name, SKU, or barcode..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          {/* Filter Dropdown */}
          <div className="md:col-span-4">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="ALL">All Store Stock Levels</option>
              <option value="IN_STOCK">In Store Stock (Healthy)</option>
              <option value="LOW_STOCK">Low Store Stock (Needs Transfer)</option>
              <option value="OUT_OF_STOCK">Out of Store Stock (0 PCS)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="vyapar-table">
            <thead>
              <tr>
                <th className="w-12 text-center">#</th>
                <th>Item Details</th>
                <th>SKU / Barcode</th>
                <th>Store Stock Status</th>
                <th className="text-right">Store Floor Stock (On-Shelf)</th>
                <th className="text-right">Warehouse Reserve</th>
                <th className="text-right">Total Stock</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-slate-400 text-xs">
                    No store front stock records found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, idx) => (
                  <tr key={row.item.id || idx}>
                    {/* Index */}
                    <td className="font-mono text-xs font-bold text-slate-400 text-center">{idx + 1}</td>

                    {/* Item Details */}
                    <td>
                      <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{row.item.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">Unit: {row.item.unitType}</div>
                    </td>

                    {/* SKU / Barcode */}
                    <td>
                      <div className="font-mono text-xs font-bold text-slate-700">{row.item.skuCode}</div>
                      <div className="font-mono text-[11px] text-slate-400">{row.item.barcode}</div>
                    </td>

                    {/* Store Stock Status Badge */}
                    <td>
                      {row.status === 'IN_STOCK' && (
                        <span className="badge badge-green">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          IN STORE STOCK
                        </span>
                      )}
                      {row.status === 'LOW_STOCK' && (
                        <span className="badge badge-amber">
                          <AlertCircle className="w-3 h-3 text-amber-600" />
                          LOW STORE STOCK
                        </span>
                      )}
                      {row.status === 'OUT_OF_STOCK' && (
                        <span className="badge badge-red">
                          <AlertCircle className="w-3 h-3 text-red-600" />
                          OUT OF STORE STOCK
                        </span>
                      )}
                    </td>

                    {/* Store Floor Stock */}
                    <td className="text-right font-mono text-xs font-black text-emerald-600">
                      {row.storeStock} {row.item.unitType}
                    </td>

                    {/* Warehouse Reserve Stock */}
                    <td className="text-right font-mono text-xs font-extrabold text-blue-600">
                      {row.whStock} {row.item.unitType}
                    </td>

                    {/* Total Combined Stock */}
                    <td className="text-right font-mono text-xs font-black text-slate-900">
                      {row.totalStock} {row.item.unitType}
                    </td>

                    {/* Actions */}
                    <td className="text-center">
                      <button
                        onClick={() => handleOpenReplenishModal(row.item)}
                        className={`px-3 py-1 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 mx-auto ${
                          row.status === 'OUT_OF_STOCK' || row.status === 'LOW_STOCK'
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                        }`}
                        title="Transfer stock from Warehouse backroom to Store Front shelf"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        <span>⇄ Replenish Store Stock</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Warehouse to Store Replenishment Modal */}
      {replenishItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <ArrowLeftRight className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">Replenish Store Front Stock</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Select product location to release stock and transfer to Store Front</p>
                </div>
              </div>
              <button
                onClick={() => setReplenishItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmTransfer} className="space-y-4">
              {/* Product Info Card */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                <div>
                  <div className="font-black text-slate-900">{replenishItem.name}</div>
                  <div className="font-mono text-slate-400 text-[11px]">SKU: {replenishItem.skuCode}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-extrabold text-slate-900">Total Stock: {replenishItem.currentStock} {replenishItem.unitType}</div>
                </div>
              </div>

              {/* Source Product Location Dropdown (Shows actual allocated locations with stock) */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Source Product Location (Release Stock From)</span>
                  <span className="text-[10px] text-blue-600 font-bold">Available Racks</span>
                </label>
                <select
                  value={sourceLocId}
                  onChange={e => setSourceLocId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                >
                  <option value="">Select Location Where Product is Stored...</option>
                  {activeProductAllocations.length > 0 ? (
                    activeProductAllocations.map((alloc: any) => (
                      <option key={alloc.locationId} value={alloc.locationId}>
                        📍 {alloc.name} ({alloc.code}) — {alloc.availableQty} PCS Available
                      </option>
                    ))
                  ) : warehouseLocations.length > 0 ? (
                    warehouseLocations.map(wh => (
                      <option key={wh.id} value={wh.id}>
                        🏢 {wh.name} ({wh.code}) — General Reserve (0 PCS Rack Allocation)
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>      
                      No warehouse created for this store branch yet
                    </option>
                  )}
                </select>
              </div>

              {/* Destination (Store Front Retail Floor / Display Counter) */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Destination (Store Front Sales Counter)</span>
                  <span className="text-[10px] text-emerald-600 font-bold">POS Ready Store</span>
                </label>
                <div className="w-full px-3.5 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-extrabold text-emerald-900 flex items-center justify-between shadow-2xs">
                  <div className="flex items-center gap-2">
                    <Store className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>🏪 Store Front Floor / Display Counter ({business?.name || 'Active Store'})</span>
                  </div>
                  <span className="badge badge-green font-mono font-bold text-[10px]">POS Ready</span>
                </div>
              </div>

              {/* Quantity to Transfer */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Transfer Quantity ({replenishItem.unitType})</label>
                <input
                  type="number"
                  value={transferQty}
                  onChange={e => setTransferQty(e.target.value)}
                  min="1"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                  required
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReplenishItem(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  <span>{isSubmitting ? 'Transferring...' : 'Confirm Replenishment'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
