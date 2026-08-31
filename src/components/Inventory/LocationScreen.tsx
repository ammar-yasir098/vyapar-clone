import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Building2,
  Layers,
  CheckCircle2,
  AlertCircle,
  PieChart,
  Plus,
  ArrowLeftRight,
  Search,
  Barcode,
  Filter,
  Edit2,
  MoveRight,
  Warehouse,
  FolderTree,
  Package,
  MapPin,
  X,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Wand2,
  Store,
  Check,
  Trash2,
  Maximize2,
  Lock,
  Unlock
} from 'lucide-react';
import {
  Item,
  BusinessDetails,
  InventoryLocation,
  ItemLocationMapping,
  StockTransfer,
  LocationType
} from '../../types';
import { db, getActiveTenantId } from '../../db';
import { ClientSyncManager } from '../../services/sync';
import { saveServerLocation, deleteServerLocation, saveServerItemLocation, createServerStockTransfer } from '../../services/api';
import { useToast } from '../Common/ToastContext';
import { seed100SampleItems } from '../../utils/sampleDataSeeder';

interface LocationScreenProps {
  items: Item[];
  locations: InventoryLocation[];
  itemLocations: ItemLocationMapping[];
  stockTransfers: StockTransfer[];
  business: BusinessDetails;
}

export const getAccessibleWarehouses = (
  storeTenantId: string,
  locations: InventoryLocation[]
): InventoryLocation[] => {
  const warehouses = locations.filter(l => l.type === 'WAREHOUSE');
  return warehouses.filter(w => {
    if (w.tenantId === storeTenantId) return true;
    if (w.allowedTenantIds && w.allowedTenantIds.includes(storeTenantId)) return true;
    return false;
  });
};

import { useLiveQuery } from 'dexie-react-hooks';

export const LocationScreen: React.FC<LocationScreenProps> = ({
  items,
  locations,
  itemLocations,
  stockTransfers,
  business
}) => {
  const { showToast, showConfirm } = useToast();

  const [activeViewTab, setActiveViewTab] = useState<'stock-table' | 'hierarchy-master' | 'transfer-history' | 'replenishment' | 'store-connections'>('stock-table');
  const [searchTerm, setSearchTerm] = useState('');
  const [barcodeSearch, setBarcodeSearch] = useState('');
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState<string>('ALL');
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false);
  const [primaryWarehouseId, setPrimaryWarehouseId] = useState<string | number | null>(null);
  const activeTenantId = getActiveTenantId(business);

  // Real-time Dexie Live Queries for Immediate Reactive UI Updating
  const liveAllItemLocations = useLiveQuery(() => db.itemLocations.toArray(), []);
  const liveAllItems = useLiveQuery(() => db.items.toArray(), []);
  const liveAllLocations = useLiveQuery(() => db.locations.toArray(), []);
  const liveStoreAccess = useLiveQuery(() => db.storeWarehouseAccess.toArray(), []);

  // Compute accessible warehouses for active store based strictly on ownership, allowedTenantIds, or storeWarehouseAccess table
  const accessibleWhIds = useMemo(() => {
    const set = new Set<string | number>();
    const accessWhSet = new Set<string>();
    if (liveStoreAccess && liveStoreAccess.length > 0) {
      liveStoreAccess.forEach(acc => {
        if (acc.storeId === activeTenantId) accessWhSet.add(String(acc.warehouseId));
      });
    }
    const rawLocs = liveAllLocations && liveAllLocations.length > 0 ? liveAllLocations : locations;
    rawLocs.forEach(loc => {
      if (loc.type === 'WAREHOUSE') {
        const locTenant = loc.tenantId || 'default-tenant';
        const locIdStr = String(loc.id);
        const isOwner = locTenant === activeTenantId;
        const isLinked = (loc.allowedTenantIds && Array.isArray(loc.allowedTenantIds) && loc.allowedTenantIds.includes(activeTenantId)) || accessWhSet.has(locIdStr);
        const isGlobalShared = loc.isShared === true;
        if (isOwner || isLinked || isGlobalShared) {
          set.add(loc.id as any);
          set.add(locIdStr);
          if (typeof loc.id === 'number') set.add(loc.id);
        }
      }
    });
    return set;
  }, [liveAllLocations, locations, liveStoreAccess, activeTenantId]);

  const accessibleLocationIds = useMemo(() => {
    const locIds = new Set<string | number>(accessibleWhIds);
    const rawLocs = liveAllLocations && liveAllLocations.length > 0 ? liveAllLocations : locations;

    // Include store-owned locations (like Store Front floor / sales counter)
    rawLocs.forEach(loc => {
      if (loc && loc.id !== undefined && loc.id !== null) {
        const locTenant = loc.tenantId || 'default-tenant';
        if (locTenant === activeTenantId || loc.isStoreFront || loc.code === 'STORE-FRONT') {
          locIds.add(loc.id as any);
          locIds.add(String(loc.id));
        }
      }
    });

    let addedChild = true;
    while (addedChild) {
      addedChild = false;
      for (const loc of rawLocs) {
        if (loc.parentId !== undefined && loc.parentId !== null && (locIds.has(loc.parentId as any) || locIds.has(String(loc.parentId))) && !locIds.has(loc.id as any)) {
          if (loc.id !== undefined && loc.id !== null) {
            locIds.add(loc.id as any);
            locIds.add(String(loc.id));
            addedChild = true;
          }
        }
      }
    }
    return locIds;
  }, [liveAllLocations, locations, accessibleWhIds, activeTenantId]);

  const activeLocations = useMemo(() => {
    const rawLocs = liveAllLocations && liveAllLocations.length > 0 ? liveAllLocations : locations;
    return rawLocs.filter(loc => {
      if (!loc) return false;
      if (loc.type === 'WAREHOUSE') {
        return accessibleWhIds.has(loc.id as any) || accessibleWhIds.has(String(loc.id));
      }
      return accessibleLocationIds.has(loc.id as any) || accessibleLocationIds.has(String(loc.id));
    });
  }, [liveAllLocations, locations, accessibleWhIds, accessibleLocationIds]);

  const tenantLocations = activeLocations;

  const allItemLocations = useMemo(() => {
    const rawMap = liveAllItemLocations && liveAllItemLocations.length > 0 ? liveAllItemLocations : itemLocations;
    return rawMap.filter(il => {
      if (!il) return false;
      const ilTenant = il.tenantId || 'default-tenant';
      const isOwner = ilTenant === activeTenantId;
      const isLocAccessible = accessibleLocationIds.has(il.locationId as any) || accessibleLocationIds.has(String(il.locationId));
      return isOwner || isLocAccessible;
    });
  }, [liveAllItemLocations, itemLocations, activeTenantId, accessibleLocationIds]);

  const allItems = useMemo(() => {
    const rawItems = liveAllItems && liveAllItems.length > 0 ? liveAllItems : items;
    return rawItems.filter(item => {
      if (!item) return false;
      const itemTenant = item.tenantId || 'default-tenant';
      const isOwner = itemTenant === activeTenantId;
      const isStoredInAccessibleLoc = allItemLocations.some((il: any) =>
        (String(il.itemId) === String(item.id) || Number(il.itemId) === Number(item.id)) &&
        (accessibleLocationIds.has(il.locationId as any) || accessibleLocationIds.has(String(il.locationId)))
      );
      return isOwner || isStoredInAccessibleLoc;
    });
  }, [liveAllItems, items, activeTenantId, allItemLocations, accessibleLocationIds]);

  const [storeProfiles, setStoreProfiles] = useState<Array<{ tenantId: string; name: string }>>([]);

  useEffect(() => {
    async function deduplicateLocalLocations() {
      try {
        const allLocs = await db.locations.toArray();
        const allMappings = await db.itemLocations.toArray();

        // Step 1: Deduplicate Warehouses per Tenant
        const warehouses = allLocs.filter(l => l.type === 'WAREHOUSE');
        const whKeyToKeptId = new Map<string, string | number>();
        const duplicateWhIdsToDelete: (string | number)[] = [];

        for (const wh of warehouses) {
          if (!wh.id) continue;
          const tenantKey = wh.tenantId || 'default-tenant';
          const key = `${tenantKey}_${(wh.code || wh.name || '').toLowerCase()}`;

          if (whKeyToKeptId.has(key)) {
            duplicateWhIdsToDelete.push(wh.id);
          } else {
            whKeyToKeptId.set(key, wh.id);
          }
        }

        if (duplicateWhIdsToDelete.length > 0) {
          const deleteWhSet = new Set(duplicateWhIdsToDelete);
          const childLocs = allLocs.filter(l => l.parentId && deleteWhSet.has(l.parentId));

          for (const child of childLocs) {
            const parentWh = warehouses.find(w => w.id === child.parentId);
            if (parentWh) {
              const tenantKey = parentWh.tenantId || 'default-tenant';
              const key = `${tenantKey}_${(parentWh.code || parentWh.name || '').toLowerCase()}`;
              const keptId = whKeyToKeptId.get(key);
              if (keptId && child.id) {
                await db.locations.update(child.id, { parentId: keptId });
                child.parentId = keptId;
              }
            }
          }
          await db.locations.bulkDelete(duplicateWhIdsToDelete as any[]);
        }

        // Fetch fresh locations after warehouse cleanup
        const freshLocs = await db.locations.toArray();

        // Step 2: Delete alien racks that don't belong to the parent warehouse tenant prefix
        const alienRackIdsToDelete: (string | number)[] = [];
        const whMap = new Map<string | number, InventoryLocation>();
        freshLocs.filter(l => l.type === 'WAREHOUSE').forEach(w => {
          if (w.id) {
            whMap.set(w.id, w);
            whMap.set(String(w.id), w);
          }
        });
        const zoneMap = new Map<string | number, InventoryLocation>();
        freshLocs.filter(l => l.type === 'ZONE').forEach(z => {
          if (z.id) {
            zoneMap.set(z.id, z);
            zoneMap.set(String(z.id), z);
          }
        });

        for (const loc of freshLocs) {
          if (loc.type === 'SHELF' && loc.id && loc.parentId) {
            const parentZone = zoneMap.get(loc.parentId);
            const parentWh = parentZone?.parentId ? whMap.get(parentZone.parentId) : null;
            if (parentWh) {
              const whCode = (parentWh.code || parentWh.name || '').toUpperCase();
              const locCode = (loc.code || '').toUpperCase();
              if (whCode.startsWith('GGS') && locCode.startsWith('SW-LHR')) {
                alienRackIdsToDelete.push(loc.id);
              } else if (whCode.startsWith('SW') && locCode.startsWith('GGS')) {
                alienRackIdsToDelete.push(loc.id);
              }
            }
          }
        }

        if (alienRackIdsToDelete.length > 0) {
          await db.locations.bulkDelete(alienRackIdsToDelete as any[]);
        }

        // Step 3: Deduplicate Zones within each Warehouse
        const currentLocs = await db.locations.toArray();
        const zones = currentLocs.filter(l => l.type === 'ZONE');
        const zoneKeyToKeptId = new Map<string, string | number>();
        const duplicateZoneIdsToDelete: (string | number)[] = [];

        for (const zone of zones) {
          if (!zone.id || !zone.parentId) continue;
          const key = `p${zone.parentId}_${(zone.code || zone.name || '').toLowerCase()}`;
          if (zoneKeyToKeptId.has(key)) {
            duplicateZoneIdsToDelete.push(zone.id);
          } else {
            zoneKeyToKeptId.set(key, zone.id);
          }
        }

        if (duplicateZoneIdsToDelete.length > 0) {
          const deleteZoneSet = new Set(duplicateZoneIdsToDelete);
          const childRacks = currentLocs.filter(l => l.parentId && deleteZoneSet.has(l.parentId));

          for (const rack of childRacks) {
            const parentZone = zones.find(z => z.id === rack.parentId);
            if (parentZone && parentZone.parentId) {
              const key = `p${parentZone.parentId}_${(parentZone.code || parentZone.name || '').toLowerCase()}`;
              const keptZoneId = zoneKeyToKeptId.get(key);
              if (keptZoneId && rack.id) {
                await db.locations.update(rack.id, { parentId: keptZoneId });
                rack.parentId = keptZoneId;
              }
            }
          }
          await db.locations.bulkDelete(duplicateZoneIdsToDelete as any[]);
        }

        // Step 4: Deduplicate Racks within each Zone & Merge Item Mappings
        const finalLocs = await db.locations.toArray();
        const racks = finalLocs.filter(l => l.type === 'SHELF');
        const rackKeyToKeptId = new Map<string, string | number>();
        const duplicateRackIdsToDelete: (string | number)[] = [];

        for (const rack of racks) {
          if (!rack.id || !rack.parentId) continue;
          const key = `z${rack.parentId}_${(rack.code || rack.name || '').toLowerCase()}`;
          if (rackKeyToKeptId.has(key)) {
            duplicateRackIdsToDelete.push(rack.id);
          } else {
            rackKeyToKeptId.set(key, rack.id);
          }
        }

        if (duplicateRackIdsToDelete.length > 0) {
          for (const dupRackId of duplicateRackIdsToDelete) {
            const dupRack = racks.find(r => r.id === dupRackId);
            if (dupRack && dupRack.parentId) {
              const key = `z${dupRack.parentId}_${(dupRack.code || dupRack.name || '').toLowerCase()}`;
              const keptRackId = rackKeyToKeptId.get(key);
              if (keptRackId) {
                const mapsToMove = allMappings.filter(m => String(m.locationId) === String(dupRackId));
                for (const m of mapsToMove) {
                  if (m.id) {
                    await db.itemLocations.update(m.id, { locationId: keptRackId });
                  }
                }
              }
            }
          }
          await db.locations.bulkDelete(duplicateRackIdsToDelete as any[]);
          console.log(`🧹 [DEXIE CLEANUP] Merged & deleted ${duplicateRackIdsToDelete.length} duplicate rack rows from IndexedDB.`);
        }

        // Step 5: Purge direct warehouse shelves that already exist inside proper Zones
        const postRacksLocs = await db.locations.toArray();
        const zoneRackCodes = new Set(postRacksLocs.filter(l => l.type === 'SHELF' && zoneMap.has(l.parentId!)).map(l => (l.code || '').toLowerCase()));
        const directShelfIdsToDelete: (string | number)[] = [];

        for (const loc of postRacksLocs) {
          if (loc.type === 'SHELF' && loc.id && loc.parentId && whMap.has(loc.parentId)) {
            const locCode = (loc.code || '').toLowerCase();
            if (zoneRackCodes.has(locCode)) {
              directShelfIdsToDelete.push(loc.id);
            }
          }
        }

        if (directShelfIdsToDelete.length > 0) {
          await db.locations.bulkDelete(directShelfIdsToDelete as any[]);
          console.log(`🧹 [DEXIE CLEANUP] Purged ${directShelfIdsToDelete.length} direct warehouse shelves.`);
        }
      } catch (err) {
        console.warn('Dexie location deduplication warning:', err);
      }
    }

    async function loadCompanyProfiles() {
      await deduplicateLocalLocations();
      let userSessionId: string | null = business?.userId || null;
      if (!userSessionId) {
        try {
          const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('vyapar_user_session') : null;
          if (raw) {
            const parsed = JSON.parse(raw);
            userSessionId = parsed.userId || null;
          }
        } catch { }
      }

      const allProfiles = await db.companyProfiles.toArray();
      const filteredProfiles = userSessionId
        ? allProfiles.filter(p => p.userId === userSessionId || p.tenantId === activeTenantId)
        : allProfiles.filter(p => p.tenantId !== 'default-tenant' || p.tenantId === activeTenantId);

      const list: Array<{ tenantId: string; name: string }> = [];
      const seenTenants = new Set<string>();

      filteredProfiles.forEach(p => {
        const tId = p.tenantId || 'default-tenant';
        if (tId === 'default-tenant' && activeTenantId !== 'default-tenant') return;
        if (!seenTenants.has(tId)) {
          seenTenants.add(tId);
          list.push({
            tenantId: tId,
            name: p.name || (p as any).companyName || tId
          });
        }
      });

      if (activeTenantId && !seenTenants.has(activeTenantId)) {
        list.push({ tenantId: activeTenantId, name: business?.name || 'Active Store' });
      }

      setStoreProfiles(list);
    }
    loadCompanyProfiles();
  }, [activeTenantId, business?.tenantId, business?.name, business?.userId]);

  useEffect(() => {
    db.companyProfiles.toArray().then(profiles => {
      const activeComp = profiles.find(p => p.tenantId === activeTenantId);
      if (activeComp && activeComp.primaryWarehouseId) {
        setPrimaryWarehouseId(activeComp.primaryWarehouseId);
      } else {
        const firstWh = locations.find(l => l.type === 'WAREHOUSE');
        if (firstWh?.id) setPrimaryWarehouseId(firstWh.id);
        else setPrimaryWarehouseId(null);
      }
    });
  }, [locations, activeTenantId]);

  const handleSetPrimaryWarehouse = async (whId: number) => {
    setPrimaryWarehouseId(whId);
    try {
      const profiles = await db.companyProfiles.toArray();
      const activeComp = profiles.find(p => p.tenantId === activeTenantId);
      if (activeComp && activeComp.id) {
        await db.companyProfiles.update(activeComp.id, { primaryWarehouseId: whId });
      } else {
        await db.companyProfiles.add({
          tenantId: activeTenantId,
          name: business.name || 'My Store',
          primaryWarehouseId: whId
        });
      }
      showToast('Primary Store Warehouse Hub linked successfully!', 'success');
    } catch (e) {
      console.error(e);
    }
  };

  // Helper to Batch Restock All Low Store Items from Central Warehouse
  const handleBatchRestockAllLowItems = async () => {
    const whLocs = locations.filter(l => l.type === 'WAREHOUSE');
    const storeLocs = locations.filter(l => l.type !== 'WAREHOUSE');

    const lowStockItems = items.map(item => {
      const itemMaps = itemLocations.filter(il => Number(il.itemId) === Number(item.id));
      const whStock = itemMaps.filter(il => whLocs.some(w => Number(w.id) === Number(il.locationId))).reduce((sum, il) => sum + il.quantity, 0);
      const storeStock = itemMaps.filter(il => !whLocs.some(w => Number(w.id) === Number(il.locationId))).reduce((sum, il) => sum + il.quantity, 0);
      const whMapping = itemMaps.find(il => whLocs.some(w => Number(w.id) === Number(il.locationId)));
      const storeMapping = itemMaps.find(il => !whLocs.some(w => Number(w.id) === Number(il.locationId)));

      return { item, whStock, storeStock, whMapping, storeMapping };
    }).filter(r => r.whStock > 0 && r.storeStock <= 5);

    if (lowStockItems.length === 0) {
      showToast('No low store front items need restock!', 'info');
      return;
    }

    showConfirm({
      title: 'Batch Replenish Store Front',
      message: `Are you sure you want to automatically transfer reserve stock for ${lowStockItems.length} low store items from Central Warehouse to Store Front Shelves?`,
      onConfirm: async () => {
        try {
          const tenantId = business.tenantId || 'tenant-1';
          let count = 0;

          for (const row of lowStockItems) {
            const srcLocId = row.whMapping ? Number(row.whMapping.locationId) : primaryWarehouseId ? Number(primaryWarehouseId) : null;
            let destLocId = row.storeMapping ? Number(row.storeMapping.locationId) : null;

            if (!destLocId && storeLocs.length > 0) {
              destLocId = Number(storeLocs[0].id);
            }

            if (!srcLocId || !destLocId) continue;

            const transferQty = Math.min(row.whStock, 20);

            if (row.whMapping && row.whMapping.id) {
              const newWhQty = Math.max(0, row.whMapping.quantity - transferQty);
              await db.itemLocations.update(row.whMapping.id, { quantity: newWhQty, updatedAt: new Date().toISOString() });
            }

            if (row.storeMapping && row.storeMapping.id) {
              const newStoreQty = (row.storeMapping.quantity || 0) + transferQty;
              await db.itemLocations.update(row.storeMapping.id, { quantity: newStoreQty, updatedAt: new Date().toISOString() });
              ClientSyncManager.logMutation('ITEM_LOCATION', String(row.storeMapping.id), 'UPDATE', { ...row.storeMapping, quantity: newStoreQty, updatedAt: new Date().toISOString() });
            } else {
              const newMapId = `map-${row.item.id}-${destLocId}`;
              const mapPayload = {
                id: newMapId,
                tenantId,
                itemId: String(row.item.id!),
                locationId: String(destLocId),
                quantity: transferQty,
                updatedAt: new Date().toISOString()
              };
              await db.itemLocations.put(mapPayload);
              ClientSyncManager.logMutation('ITEM_LOCATION', newMapId, 'INSERT', mapPayload);
            }

            const trfId = `trf-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
            const trfNum = `TRF-${Date.now().toString().slice(-6)}-${count + 1}`;
            const trfPayload = {
              id: trfId,
              transferNumber: trfNum,
              tenantId,
              sourceLocationId: String(srcLocId),
              destinationLocationId: String(destLocId),
              itemId: String(row.item.id!),
              quantity: transferQty,
              transferDate: new Date().toISOString().split('T')[0],
              notes: 'Batch automated store replenishment from Central Warehouse',
              createdAt: new Date().toISOString()
            };
            await db.stockTransfers.put(trfPayload);
            ClientSyncManager.logMutation('STOCK_TRANSFER', trfId, 'INSERT', trfPayload);

            count++;
          }

          showToast(`Successfully restocked ${count} items from Central Warehouse to Store Front Shelves!`, 'success');
        } catch (e: any) {
          showToast(`Batch restock failed: ${e.message}`, 'error');
        }
      }
    });
  };

  // Modals state
  const [isAddLocationOpen, setIsAddLocationOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [relocateItem, setRelocateItem] = useState<{ item: Item; currentMapping?: ItemLocationMapping } | null>(null);

  // Location Form
  const [locName, setLocName] = useState('');
  const [locCode, setLocCode] = useState('');
  const [locType, setLocType] = useState<LocationType>('WAREHOUSE');
  const [locParentId, setLocParentId] = useState<string>('');
  const [locCapacity, setLocCapacity] = useState<string>('500');
  const [locDescription, setLocDescription] = useState('');

  // Transfer Form
  const [transferItemId, setTransferItemId] = useState<string>('');
  const [transferSourceLocId, setTransferSourceLocId] = useState<string>('');
  const [transferDestLocId, setTransferDestLocId] = useState<string>('');
  const [transferQty, setTransferQty] = useState<string>('1');
  const [transferNotes, setTransferNotes] = useState<string>('');
  const [itemSearchQuery, setItemSearchQuery] = useState<string>('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState<boolean>(false);
  const [expandedItemIds, setExpandedItemIds] = useState<Set<number>>(new Set());

  // Relocate Form
  const [relocateDestLocId, setRelocateDestLocId] = useState<string>('');
  const [relocateWhId, setRelocateWhId] = useState<string>('');
  const [relocateZoneId, setRelocateZoneId] = useState<string>('');
  const [relocateRackId, setRelocateRackId] = useState<string>('');
  const [relocateQty, setRelocateQty] = useState<string>('1');
  const [relocateMaxCap, setRelocateMaxCap] = useState<string>('100');

  // Store Layout Generator Form
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [presetTemplate, setPresetTemplate] = useState<'RETAIL' | 'SUPERMARKET' | 'BOUTIQUE' | 'CUSTOM'>('RETAIL');
  const [whName, setWhName] = useState('Main Retail Store');
  const [whCode, setWhCode] = useState('MRS');
  const [whCapacity, setWhCapacity] = useState<number>(600);
  const [zoneCount, setZoneCount] = useState<number>(3);
  const [zoneCapacity, setZoneCapacity] = useState<number>(180);
  const [racksPerZone, setRacksPerZone] = useState<number>(3);
  const [rackCapacity, setRackCapacity] = useState<number>(50);

  // Enlarged Product Preview Modal State
  const [previewItemDetail, setPreviewItemDetail] = useState<{
    item: Item;
    quantity: number;
    mapping?: ItemLocationMapping;
    locationId?: string | number;
  } | null>(null);

  // Auto-purge orphaned item location mappings from IndexedDB
  React.useEffect(() => {
    if (locations.length === 0 || itemLocations.length === 0) return;

    const validLocIds = new Set(locations.map(l => String(l.id)));

    // Purge records that point to non-existent location IDs
    const invalidMappings = itemLocations.filter(il =>
      il.id && !validLocIds.has(String(il.locationId))
    );

    if (invalidMappings.length > 0) {
      console.log(`[Auto-Purge] Deleting ${invalidMappings.length} invalid mapping records from IndexedDB...`);
      db.transaction('rw', db.itemLocations, async () => {
        for (const inv of invalidMappings) {
          if (inv.id) {
            await db.itemLocations.delete(inv.id);
          }
        }
      }).catch(err => console.error('Error purging invalid mappings:', err));
    }
  }, [locations.length, itemLocations.length]);

  const handleSelectPreset = (preset: 'RETAIL' | 'SUPERMARKET' | 'BOUTIQUE' | 'CUSTOM') => {
    setPresetTemplate(preset);
    if (preset === 'RETAIL') {
      setWhName('Main Retail Store');
      setWhCode('MRS');
      setWhCapacity(600);
      setZoneCount(3);
      setZoneCapacity(180);
      setRacksPerZone(3);
      setRackCapacity(50);
    } else if (preset === 'SUPERMARKET') {
      setWhName('Supermarket Godown');
      setWhCode('SMG');
      setWhCapacity(1200);
      setZoneCount(4);
      setZoneCapacity(250);
      setRacksPerZone(4);
      setRackCapacity(50);
    } else if (preset === 'BOUTIQUE') {
      setWhName('Boutique Store');
      setWhCode('BTS');
      setWhCapacity(300);
      setZoneCount(2);
      setZoneCapacity(120);
      setRacksPerZone(2);
      setRackCapacity(50);
    }
  };

  const totalZoneCapAllocated = zoneCount * zoneCapacity;
  const isZoneCapExceeded = totalZoneCapAllocated > whCapacity;
  const totalRackCapAllocatedPerZone = racksPerZone * rackCapacity;
  const isRackCapExceeded = totalRackCapAllocatedPerZone > zoneCapacity;
  const totalLocationsToGenerate = 1 + zoneCount + (zoneCount * racksPerZone);

  const handleGenerateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whName.trim() || !whCode.trim()) {
      showToast('Please enter Warehouse Name and Code', 'error');
      return;
    }

    if (isZoneCapExceeded) {
      showToast(`Total zones capacity (${totalZoneCapAllocated} units) cannot exceed Warehouse capacity (${whCapacity} units).`, 'error');
      return;
    }

    if (isRackCapExceeded) {
      showToast(`Total racks capacity per zone (${totalRackCapAllocatedPerZone} units) cannot exceed Zone capacity (${zoneCapacity} units).`, 'error');
      return;
    }

    const codeUpper = whCode.trim().toUpperCase();
    const existingCode = locations.find(l => l.code === codeUpper && l.tenantId === tenantId);
    if (existingCode) {
      showToast(`Warehouse Code "${codeUpper}" already exists! Please use a unique code.`, 'error');
      return;
    }

    try {
      const timestamp = new Date().toISOString();

      // 1. Create Main Warehouse
      const whId = `wh-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const whPayload = {
        id: whId,
        tenantId,
        name: whName.trim(),
        code: codeUpper,
        type: 'WAREHOUSE' as LocationType,
        parentId: null,
        capacity: whCapacity,
        description: `${presetTemplate} generated warehouse layout`,
        isShared: true,
        createdAt: timestamp
      };
      await db.locations.put(whPayload);
      saveServerLocation(whPayload).catch(() => { });
      ClientSyncManager.logMutation('LOCATION', whId, 'INSERT', whPayload);

      // 2. Create Zones and Racks
      const zoneLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
      for (let z = 0; z < zoneCount; z++) {
        const letter = zoneLetters[z % zoneLetters.length] || `Z${z + 1}`;
        const zoneName = `Zone ${letter}`;
        const zoneCode = `${codeUpper}-Z${letter}`;
        const zoneId = `zone-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const zonePayload = {
          id: zoneId,
          tenantId,
          name: zoneName,
          code: zoneCode,
          type: 'ZONE' as LocationType,
          parentId: whId,
          capacity: zoneCapacity,
          description: `Zone ${letter} in ${whName}`,
          createdAt: timestamp
        };
        await db.locations.put(zonePayload);
        saveServerLocation(zonePayload).catch(() => { });
        ClientSyncManager.logMutation('LOCATION', zoneId, 'INSERT', zonePayload);

        for (let r = 1; r <= racksPerZone; r++) {
          const rackName = `Rack ${letter}-${r}`;
          const rackCode = `${zoneCode}-R${r}`;
          const rackId = `rack-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
          const rackPayload = {
            id: rackId,
            tenantId,
            name: rackName,
            code: rackCode,
            type: 'SHELF' as LocationType,
            parentId: zoneId,
            capacity: rackCapacity,
            description: `Rack ${r} in ${zoneName}`,
            createdAt: timestamp
          };
          await db.locations.put(rackPayload);
          saveServerLocation(rackPayload).catch(() => { });
          ClientSyncManager.logMutation('LOCATION', rackId, 'INSERT', rackPayload);
        }
      }

      showToast(`🎉 Generated "${whName}" layout! Added 1 Warehouse, ${zoneCount} Zones, and ${zoneCount * racksPerZone} Racks.`, 'success');
      setIsTemplateModalOpen(false);
    } catch (err: any) {
      showToast(`Failed to generate store layout: ${err.message}`, 'error');
    }
  };

  // Auto-allocate unassigned godown stock into available warehouse racks
  const handleAutoAllocateStock = async (targetItem?: Item) => {
    const itemsToAllocate = targetItem ? [targetItem] : activeTenantItems;
    let ownWh = activeLocations.find(l => l.type === 'WAREHOUSE' && l.code !== 'WH-MAIN' && (l.tenantId || 'default-tenant') === activeTenantId);
    if (!ownWh) {
      ownWh = activeLocations.find(l => l.type === 'WAREHOUSE' && (l.tenantId || 'default-tenant') === activeTenantId) || activeLocations.find(l => l.type === 'WAREHOUSE');
    }

    if (!ownWh) {
      showToast('Please create a warehouse first before allocating stock to racks.', 'error');
      return;
    }

    // Find all shelves/racks inside this warehouse or across active locations
    let availableRacks = activeLocations.filter(l => l.type === 'SHELF' && l.id);
    if (ownWh) {
      const childZones = activeLocations.filter(l => l.type === 'ZONE' && (String(l.parentId) === String(ownWh.id) || (ownWh.code && l.code.startsWith(ownWh.code + '-'))));
      const zoneIds = new Set(childZones.map(z => String(z.id)));
      const whRacks = availableRacks.filter(l => zoneIds.has(String(l.parentId)) || String(l.parentId) === String(ownWh.id) || (ownWh.code && l.code.startsWith(ownWh.code + '-')));
      if (whRacks.length > 0) {
        availableRacks = whRacks;
      }
    }

    if (availableRacks.length === 0) {
      showToast(`No racks defined in "${ownWh.name}". Use "+ Store Layout Generator" to create racks first.`, 'error');
      return;
    }

    let allocatedTotalCount = 0;

    await db.transaction('rw', [db.itemLocations], async () => {
      for (const item of itemsToAllocate) {
        if (!item.id || item.currentStock <= 0) continue;

        // Check existing assigned qty in SHELF / RACK locations only
        const existingMaps = await db.itemLocations.filter(il => (il.tenantId || 'default-tenant') === activeTenantId && (String(il.itemId) === String(item.id) || (item.skuCode && (il as any).skuCode && String((il as any).skuCode).toLowerCase() === item.skuCode.toLowerCase()))).toArray();
        const alreadyAssignedToRacks = existingMaps
          .filter(m => {
            const loc = activeLocations.find(l => String(l.id) === String(m.locationId));
            return loc && loc.type === 'SHELF';
          })
          .reduce((sum, m) => sum + m.quantity, 0);

        let unassignedToPlace = Math.max(0, item.currentStock - alreadyAssignedToRacks);

        if (unassignedToPlace <= 0) continue;

        // Place into available racks
        for (const rack of availableRacks) {
          if (unassignedToPlace <= 0) break;
          const rackCap = rack.capacity || 100;
          const currentOccupancy = allItemLocations.filter(il => String(il.locationId) === String(rack.id)).reduce((sum, il) => sum + il.quantity, 0);
          const spaceAvailable = Math.max(0, rackCap - currentOccupancy);

          if (spaceAvailable > 0) {
            const placeQty = Math.min(unassignedToPlace, spaceAvailable);
            const existingRackMap = existingMaps.find(m => String(m.locationId) === String(rack.id));

            if (existingRackMap && existingRackMap.id) {
              const newQty = existingRackMap.quantity + placeQty;
              await db.itemLocations.update(existingRackMap.id, {
                quantity: newQty,
                updatedAt: new Date().toISOString()
              });
              ClientSyncManager.logMutation('ITEM_LOCATION', String(existingRackMap.id), 'UPDATE', { ...existingRackMap, quantity: newQty, updatedAt: new Date().toISOString() });
              saveServerItemLocation({ tenantId: activeTenantId, itemId: item.id, skuCode: item.skuCode, name: item.name, locationId: rack.id!, locationCode: rack.code, quantity: newQty, maxCapacity: rackCap }).catch(() => { });
            } else {
              const mapId = `map-${item.id}-${rack.id}`;
              const mapPayload = {
                id: mapId,
                tenantId: activeTenantId,
                itemId: String(item.id!),
                locationId: String(rack.id!),
                quantity: placeQty,
                maxCapacity: rackCap,
                updatedAt: new Date().toISOString()
              };
              await db.itemLocations.put(mapPayload);
              ClientSyncManager.logMutation('ITEM_LOCATION', mapId, 'INSERT', mapPayload);
              saveServerItemLocation({ tenantId: activeTenantId, itemId: item.id, skuCode: item.skuCode, name: item.name, locationId: rack.id!, locationCode: rack.code, quantity: placeQty, maxCapacity: rackCap }).catch(() => { });
            }

            unassignedToPlace -= placeQty;
            allocatedTotalCount += placeQty;
          }
        }
      }
    });

    if (allocatedTotalCount > 0) {
      showToast(`🎉 Successfully auto-allocated ${allocatedTotalCount} PCS into "${ownWh.name}" racks!`, 'success');
    } else {
      showToast('All available racks in the warehouse are currently full or stock is already allocated.', 'info');
    }
  };

  // Delete Location Handler (Cascade deletes sub-locations with stock safety guards)
  const handleDeleteLocation = (loc: InventoryLocation) => {
    if (!loc.id) return;

    const locIdStr = String(loc.id);
    const childLocIds = new Set<string>([locIdStr]);

    if (loc.type === 'WAREHOUSE') {
      activeLocations.filter(l => String(l.parentId) === locIdStr).forEach(z => {
        childLocIds.add(String(z.id));
        activeLocations.filter(l => String(l.parentId) === String(z.id)).forEach(r => childLocIds.add(String(r.id)));
      });
      activeLocations.filter(l => l.type === 'SHELF' && String(l.parentId) === locIdStr).forEach(r => childLocIds.add(String(r.id)));
    } else if (loc.type === 'ZONE') {
      activeLocations.filter(l => String(l.parentId) === locIdStr).forEach(r => childLocIds.add(String(r.id)));
    }

    const assignedStock = itemLocations
      .filter(il => childLocIds.has(String(il.locationId)))
      .reduce((sum, il) => sum + (il.quantity || 0), 0);

    let message = `Are you sure you want to delete "${loc.name}" (${loc.code})?`;
    if (loc.type === 'WAREHOUSE') {
      message = assignedStock > 0
        ? `Warehouse "${loc.name}" contains ${assignedStock} PCS linked product stock. Are you sure you want to delete this warehouse? Confirming will delete all zones/racks inside it and un-link location mappings.`
        : `Are you sure you want to delete Warehouse "${loc.name}"? This will also delete ALL zones and racks inside it!`;
    } else if (loc.type === 'ZONE') {
      message = `Are you sure you want to delete Zone "${loc.name}"? This will also delete ALL racks inside it!`;
    }

    showConfirm({
      title: `Delete ${loc.type === 'WAREHOUSE' ? 'Warehouse' : loc.type === 'ZONE' ? 'Zone' : 'Shelf'}`,
      message,
      type: 'danger',
      confirmText: 'Delete Location',
      onConfirm: async () => {
        try {
          const idsToDelete: string[] = Array.from(childLocIds);

          // Purge all item location mappings linked to deleted location IDs
          const mappingsToDelete = itemLocations.filter(il => idsToDelete.includes(String(il.locationId)));
          for (const m of mappingsToDelete) {
            if (m.id) await db.itemLocations.delete(m.id);
          }

          // Delete locations from IndexedDB
          for (const idToDel of idsToDelete) {
            await db.locations.delete(idToDel);
            await deleteServerLocation(idToDel);
            await ClientSyncManager.logMutation('LOCATION', idToDel, 'DELETE', { id: idToDel, tenantId: activeTenantId });
          }

          showToast(`Location "${loc.name}" and linked sub-spaces deleted successfully!`, 'info');
        } catch (err: any) {
          showToast(`Error deleting location: ${err.message}`, 'error');
        }
      }
    });
  };

  // Toggle Global Shared Warehouse Status (Case 2: 1 Central Warehouse for All Stores)
  const handleToggleGlobalShared = async (whId: string | number, currentSharedState: boolean) => {
    try {
      const newSharedState = !currentSharedState;
      await db.locations.update(whId, { isShared: newSharedState });
      const targetWh = locations.find(l => String(l.id) === String(whId));
      if (targetWh) {
        saveServerLocation({ ...targetWh, isShared: newSharedState }).catch(() => { });
      }
      showToast(`Warehouse updated! Global Shared status set to ${newSharedState ? 'ENABLED (All Stores Linked)' : 'DISABLED (Dedicated Linkage)'}`, 'success');
    } catch (e: any) {
      showToast(`Failed to update shared state: ${e.message}`, 'error');
    }
  };

  // Toggle Specific Store Linkage (Case 3: Regional Hubs)
  const handleToggleStoreLink = async (whId: string | number, storeTenantId: string) => {
    try {
      const targetWh = locations.find(l => String(l.id) === String(whId));
      if (!targetWh) return;

      const currentLinks = targetWh.allowedTenantIds || [];
      let updatedLinks: string[];
      if (currentLinks.includes(storeTenantId)) {
        updatedLinks = currentLinks.filter(id => id !== storeTenantId);
      } else {
        updatedLinks = [...currentLinks, storeTenantId];
      }

      await db.locations.update(whId, { allowedTenantIds: updatedLinks });
      saveServerLocation({ ...targetWh, allowedTenantIds: updatedLinks }).catch(() => { });
      showToast('Store & Warehouse linkage updated successfully!', 'success');
    } catch (e: any) {
      showToast(`Failed to update store link: ${e.message}`, 'error');
    }
  };

  const tenantId = activeTenantId;
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Click outside & Escape key handler to close search autocomplete dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSearchDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Auto-cleanup duplicate itemLocation mapping records in Dexie IndexedDB
  useEffect(() => {
    const cleanupDuplicates = async () => {
      const allMappings = await db.itemLocations.toArray();
      const seen = new Set<string>();
      const idsToDelete: (string | number)[] = [];

      for (const m of allMappings) {
        if (!m.id) continue;
        const tenantKey = m.tenantId || 'default-tenant';
        const key = `${tenantKey}_${m.itemId}_${m.locationId}`;
        if (seen.has(key)) {
          idsToDelete.push(m.id);
        } else {
          seen.add(key);
        }
      }

      if (idsToDelete.length > 0) {
        await db.itemLocations.bulkDelete(idsToDelete as any[]);
      }
    };
    cleanupDuplicates().catch(() => { });
  }, [itemLocations]);

  // Detailed capacity stats for the currently selected parent location
  const parentCapacityStats = useMemo(() => {
    if (!locParentId) return null;
    const parent = locations.find(l => String(l.id) === String(locParentId));
    if (!parent) return null;

    const parentCap = parent.capacity ?? 0;
    const existingChildren = locations.filter(l => String(l.parentId) === String(parent.id));
    const usedCap = existingChildren.reduce((sum, child) => sum + (child.capacity || 0), 0);
    const availableCap = Math.max(0, parentCap - usedCap);

    return {
      parent,
      parentCap,
      usedCap,
      availableCap,
      childCount: existingChildren.length
    };
  }, [locations, locParentId]);

  // Filtered items list for transfer modal search
  const filteredTransferItems = useMemo(() => {
    if (!itemSearchQuery.trim()) return items;
    const q = itemSearchQuery.toLowerCase();
    return items.filter(i =>
      (i.name || '').toLowerCase().includes(q) ||
      (i.skuCode || '').toLowerCase().includes(q) ||
      (i.barcode || '').toLowerCase().includes(q)
    );
  }, [items, itemSearchQuery]);

  // Handle selecting an item from search dropdown
  const handleChooseItemFromSearch = (item: Item) => {
    if (!item.id) return;
    setTransferItemId(String(item.id));
    setItemSearchQuery(item.name);
    setIsSearchDropdownOpen(false);

    // Auto-fetch source location with stock > 0
    const itemMappings = itemLocations.filter(il => Number(il.itemId) === Number(item.id) && il.quantity > 0);
    if (itemMappings.length > 0) {
      itemMappings.sort((a, b) => b.quantity - a.quantity);
      setTransferSourceLocId(String(itemMappings[0].locationId));
    } else {
      setTransferSourceLocId('');
    }
  };

  // Open Transfer Modal for specific row
  const handleOpenTransferForRow = (item: Item, mapping?: ItemLocationMapping) => {
    setIsTransferModalOpen(true);
    setItemSearchQuery(item.name);
    setTransferItemId(String(item.id));
    setIsSearchDropdownOpen(false);
    if (mapping && mapping.locationId) {
      setTransferSourceLocId(String(mapping.locationId));
    } else {
      const itemMappings = itemLocations.filter(il => Number(il.itemId) === Number(item.id) && il.quantity > 0);
      if (itemMappings.length > 0) {
        setTransferSourceLocId(String(itemMappings[0].locationId));
      } else {
        setTransferSourceLocId('');
      }
    }
  };


  // Helper maps for location names & paths
  const locationMap = useMemo(() => {
    const map = new Map<string | number, InventoryLocation>();
    activeLocations.forEach(l => {
      if (l.id !== undefined && l.id !== null) {
        map.set(l.id, l);
        map.set(String(l.id), l);
      }
    });
    return map;
  }, [activeLocations]);

  const getTrueWarehouseName = (locId?: string | number): string => {
    // 1. Strictly find warehouse CREATED by the active store profile
    const ownWhLoc = activeLocations.find(l => l.type === 'WAREHOUSE' && (l.tenantId || 'default-tenant') === activeTenantId);

    // 2. If locId is provided, resolve its true parent warehouse
    if (locId !== undefined && locId !== null && locationMap.has(locId)) {
      let curr = locationMap.get(locId)!;
      while (curr) {
        if (curr.type === 'WAREHOUSE') {
          // If active store profile has its own warehouse (e.g. Sapphire-LHR) and location parent belongs to legacy tenant (GAMEGEEKS), override with own store warehouse!
          if (ownWhLoc && (curr.tenantId || 'default-tenant') !== activeTenantId) {
            return ownWhLoc.name;
          }
          return curr.name;
        }
        if (curr.parentId !== undefined && curr.parentId !== null && locationMap.has(curr.parentId)) {
          curr = locationMap.get(curr.parentId)!;
        } else {
          break;
        }
      }
    }

    // 3. Fallback for unallocated store stock: return store's own warehouse if created, or N/A
    return ownWhLoc ? ownWhLoc.name : 'N/A (No Linked Warehouse)';
  };

  const getLocationFullPath = (locId?: string | number): { warehouse: string; shelf: string; fullPath: string } => {
    const warehouseName = getTrueWarehouseName(locId);
    if (locId === undefined || locId === null) {
      return { warehouse: warehouseName, shelf: 'Unassigned', fullPath: 'Unassigned' };
    }

    const targetLoc = locationMap.get(locId) || locationMap.get(String(locId));
    if (!targetLoc) {
      return { warehouse: warehouseName, shelf: 'Unassigned', fullPath: 'Unassigned' };
    }

    let curr = targetLoc;
    const pathNames: string[] = [curr.name];

    while (curr.parentId !== undefined && curr.parentId !== null) {
      const parent = locationMap.get(curr.parentId) || locationMap.get(String(curr.parentId));
      if (!parent) break;
      curr = parent;
      if (curr.type === 'WAREHOUSE') {
        const trueWhName = getTrueWarehouseName(curr.id);
        pathNames.unshift(trueWhName);
      } else {
        pathNames.unshift(curr.name);
      }
    }

    const shelfDisplay = targetLoc.type === 'WAREHOUSE' ? targetLoc.code : `${targetLoc.name} (${targetLoc.code})`;
    const fullPath = pathNames.join(' → ');

    return {
      warehouse: warehouseName,
      shelf: shelfDisplay,
      fullPath
    };
  };

  // Top Metrics Calculation (Scoped to Store Profile & Warehouse Permissions)
  const displayWarehouses = useMemo(() => {
    const whs = activeLocations.filter(l => l.type === 'WAREHOUSE');
    const customWhs = whs.filter(w => w.code !== 'WH-MAIN');
    if (customWhs.length > 0) {
      return customWhs;
    }
    return whs;
  }, [activeLocations]);

  const activeWarehouses = useMemo(() => {
    return displayWarehouses.length;
  }, [displayWarehouses]);

  const definedShelves = useMemo(() => {
    return activeLocations.filter(l => l.type === 'SHELF' || l.type === 'ZONE').length;
  }, [activeLocations]);

  const activeTenantItems = useMemo(() => {
    const accessibleWhIds = new Set<string | number>();
    activeLocations.filter(l => l.type === 'WAREHOUSE').forEach(l => {
      if (l.id !== undefined && l.id !== null) {
        accessibleWhIds.add(l.id as any);
        accessibleWhIds.add(String(l.id));
      }
    });
    const accessibleLocIds = new Set<string | number>(accessibleWhIds);
    let added = true;
    while (added) {
      added = false;
      for (const loc of activeLocations) {
        if (loc.parentId !== undefined && loc.parentId !== null && (accessibleLocIds.has(loc.parentId as any) || accessibleLocIds.has(String(loc.parentId))) && !accessibleLocIds.has(loc.id as any)) {
          if (loc.id !== undefined && loc.id !== null) {
            accessibleLocIds.add(loc.id as any);
            accessibleLocIds.add(String(loc.id));
            added = true;
          }
        }
      }
    }

    return allItems.filter(i => {
      if (!i) return false;
      const itemTenant = i.tenantId || 'default-tenant';
      const isOwner = itemTenant === activeTenantId;
      const itemMaps = allItemLocations.filter(il => String(il.itemId) === String(i.id) || Number(il.itemId) === Number(i.id));
      const isStoredInAccessibleLoc = itemMaps.some(il => accessibleLocIds.has(il.locationId as any) || accessibleLocIds.has(String(il.locationId)));
      return isOwner || isStoredInAccessibleLoc;
    });
  }, [allItems, activeTenantId, activeLocations, allItemLocations]);

  const itemLocationMapByItemId = useMemo(() => {
    const map = new Map<string | number, ItemLocationMapping[]>();
    const tenantLocIds = new Set<string | number>();
    activeLocations.forEach(l => {
      if (l.id !== undefined && l.id !== null) {
        tenantLocIds.add(l.id as any);
        tenantLocIds.add(String(l.id));
      }
    });

    const itemByServerId = new Map<string | number, Item>();
    activeTenantItems.forEach(item => {
      if (item.id) {
        map.set(item.id, []);
        map.set(String(item.id), []);
        itemByServerId.set(item.id, item);
        itemByServerId.set(String(item.id), item);
      }
      if ((item as any).cloudId) {
        itemByServerId.set((item as any).cloudId, item);
        itemByServerId.set(String((item as any).cloudId), item);
      }
    });

    activeTenantItems.forEach((item) => {
      if (!item.id) return;
      const itemIdStr = String(item.id);
      const cloudIdStr = (item as any).cloudId ? String((item as any).cloudId) : null;
      const skuLower = item.skuCode ? item.skuCode.trim().toLowerCase() : null;

      const matches = allItemLocations.filter(il => {
        if (!tenantLocIds.has(il.locationId as any) && !tenantLocIds.has(String(il.locationId))) {
          const locMatch = activeLocations.find(l => String(l.id) === String(il.locationId));
          if (!locMatch) return false;
        }

        const ilItemIdStr = String(il.itemId);
        if (ilItemIdStr === itemIdStr) return true;
        if (cloudIdStr && ilItemIdStr === cloudIdStr) return true;
        if (skuLower && (il as any).skuCode && String((il as any).skuCode).trim().toLowerCase() === skuLower) return true;

        const targetItem = itemByServerId.get(ilItemIdStr) || itemByServerId.get(Number(il.itemId));
        if (targetItem && (String(targetItem.id) === itemIdStr || targetItem.skuCode === item.skuCode)) return true;

        return false;
      });

      map.set(item.id, matches);
      map.set(itemIdStr, matches);
    });

    return map;
  }, [allItemLocations, activeTenantItems, tenantLocations, activeLocations]);

  // Helper to accurately compute unallocated remaining stock for an item
  const getItemUnallocatedStock = (item?: Item | null, excludeMappingId?: string | number) => {
    if (!item || !item.id) return 0;
    const rawMappings = itemLocationMapByItemId.get(item.id) || itemLocationMapByItemId.get(String(item.id)) || (item.id ? itemLocationMapByItemId.get(Number(item.id)) : []) || [];

    // Deduplicate mappings by locationId for this item
    const uniqueMappingMap = new Map<string | number, ItemLocationMapping>();
    rawMappings.forEach(m => {
      if (excludeMappingId && (String(m.id) === String(excludeMappingId) || m.id === excludeMappingId)) {
        return;
      }
      if (!uniqueMappingMap.has(m.locationId)) {
        uniqueMappingMap.set(m.locationId, m);
      } else {
        const existing = uniqueMappingMap.get(m.locationId)!;
        existing.quantity = Math.max(existing.quantity, m.quantity);
      }
    });

    const validAllocations = Array.from(uniqueMappingMap.values()).filter(m => {
      if (m.quantity <= 0) return false;
      const locIdStr = String(m.locationId);
      const locObj = locationMap.get(m.locationId) || locationMap.get(locIdStr) || activeLocations.find(l => String(l.id) === locIdStr);
      if (!locObj) return false;
      return locObj.type !== 'WAREHOUSE';
    });

    const totalAssigned = validAllocations.reduce((sum, m) => sum + m.quantity, 0);
    return Math.max(0, (item.currentStock || 0) - totalAssigned);
  };

  // Helper to dynamically calculate capacity utilization & remaining space for a location (including child shelves/racks for zones & warehouses)
  const getLocCapacityInfo = (loc: InventoryLocation) => {
    if (!loc.id) return { used: 0, max: 100, remaining: 100, isFull: false };
    const max = loc.capacity || 100;

    const targetLocIds = new Set<string>();
    targetLocIds.add(String(loc.id));

    if (loc.type === 'WAREHOUSE') {
      locations.forEach(l => {
        if (l.id && String(l.parentId) === String(loc.id)) {
          targetLocIds.add(String(l.id));
          locations.filter(r => String(r.parentId) === String(l.id)).forEach(r => {
            if (r.id) targetLocIds.add(String(r.id));
          });
        }
      });
    } else if (loc.type === 'ZONE') {
      locations.forEach(l => {
        if (l.type === 'SHELF' && l.id && String(l.parentId) === String(loc.id)) {
          targetLocIds.add(String(l.id));
        }
      });
    }

    let rootWh = loc;
    if (loc.type !== 'WAREHOUSE' && loc.parentId) {
      const parent = locations.find(l => String(l.id) === String(loc.parentId));
      if (parent) {
        rootWh = parent.type === 'WAREHOUSE' ? parent : (locations.find(l => String(l.id) === String(parent.parentId)) || parent);
      }
    }

    const isSharedWh = !!rootWh.isShared;
    const allowedTenants = new Set<string>([rootWh.tenantId || 'default-tenant']);
    if (rootWh.allowedTenantIds && Array.isArray(rootWh.allowedTenantIds)) {
      rootWh.allowedTenantIds.forEach(id => allowedTenants.add(id));
    }

    const mapsToUse = allItemLocations.filter(il => {
      if (isSharedWh) return true;
      const ilTenant = il.tenantId || 'default-tenant';
      return allowedTenants.has(ilTenant);
    });

    const totalAssignedAtLoc = mapsToUse
      .filter(il => targetLocIds.has(String(il.locationId)))
      .reduce((sum, il) => sum + (il.quantity || 0), 0);

    let currentMappingQty = 0;
    if (relocateItem && relocateItem.currentMapping && targetLocIds.has(String(relocateItem.currentMapping.locationId))) {
      currentMappingQty = relocateItem.currentMapping.quantity || 0;
    }

    const effectiveUsed = Math.max(0, totalAssignedAtLoc - currentMappingQty);
    const remaining = Math.max(0, max - effectiveUsed);
    const isFull = remaining <= 0;

    return { used: effectiveUsed, max, remaining, isFull };
  };

  // Helper to dynamically update Available Capacity & Quantity when picking a target location
  const updateCapacityDefaults = (targetLocId: string) => {
    if (!targetLocId) return;
    const targetLoc = locationMap.get(targetLocId) || locationMap.get(String(targetLocId)) || locations.find(l => String(l.id) === String(targetLocId));
    if (targetLoc) {
      const capInfo = getLocCapacityInfo(targetLoc);
      setRelocateMaxCap(String(capInfo.remaining));

      if (relocateItem) {
        if (relocateItem.currentMapping && String(relocateItem.currentMapping.locationId) === String(targetLoc.id)) {
          setRelocateQty(String(relocateItem.currentMapping.quantity));
        } else {
          const unallocatedStock = getItemUnallocatedStock(relocateItem.item, relocateItem.currentMapping?.id);
          const defaultQty = Math.min(unallocatedStock, capInfo.remaining);
          setRelocateQty(String(defaultQty));
        }
      }
    }
  };

  // Open Relocate Modal for specific row
  const handleOpenRelocateModal = (item: Item, mapping?: ItemLocationMapping) => {
    setRelocateItem({ item, currentMapping: mapping });
    const unallocatedStock = getItemUnallocatedStock(item, mapping?.id);
    const initialQty = mapping ? mapping.quantity : unallocatedStock;
    setRelocateQty(String(initialQty));
    setRelocateMaxCap(String(mapping ? mapping.maxCapacity : 100));

    if (mapping && mapping.locationId) {
      const locId = mapping.locationId;
      setRelocateDestLocId(String(locId));
      const curr = locationMap.get(locId);

      if (curr) {
        if (curr.type === 'WAREHOUSE') {
          setRelocateWhId(String(curr.id));
          setRelocateZoneId('');
          setRelocateRackId('');
        } else if (curr.type === 'ZONE') {
          const parentWh = locations.find(l => l.type === 'WAREHOUSE' && (String(l.id) === String(curr.parentId) || (l.code && curr.code.startsWith(l.code + '-'))));
          setRelocateWhId(parentWh ? String(parentWh.id) : String(curr.parentId || ''));
          setRelocateZoneId(String(curr.id));
          setRelocateRackId('');
        } else if (curr.type === 'SHELF') {
          const parentZone = locations.find(l => l.type === 'ZONE' && (String(l.id) === String(curr.parentId) || (l.code && curr.code.startsWith(l.code + '-'))));
          if (parentZone) {
            const parentWh = locations.find(l => l.type === 'WAREHOUSE' && (String(l.id) === String(parentZone.parentId) || (l.code && parentZone.code.startsWith(l.code + '-'))));
            setRelocateWhId(parentWh ? String(parentWh.id) : String(parentZone.parentId || ''));
            setRelocateZoneId(String(parentZone.id));
            setRelocateRackId(String(curr.id));
          } else {
            const parentWh = locations.find(l => l.type === 'WAREHOUSE' && (String(l.id) === String(curr.parentId) || (l.code && curr.code.startsWith(l.code + '-'))));
            setRelocateWhId(parentWh ? String(parentWh.id) : String(curr.parentId || ''));
            setRelocateZoneId('');
            setRelocateRackId(String(curr.id));
          }
        }
        const capInfo = getLocCapacityInfo(curr);
        setRelocateMaxCap(String(capInfo.remaining));
      } else {
        setRelocateWhId('');
        setRelocateZoneId('');
        setRelocateRackId('');
      }
    } else {
      setRelocateDestLocId('');
      setRelocateWhId('');
      setRelocateZoneId('');
      setRelocateRackId('');
    }
  };

  const { assignedCount, unassignedCount } = useMemo(() => {
    let assigned = 0;
    let unassigned = 0;
    activeTenantItems.forEach(item => {
      if (item.id) {
        const rawMappings = itemLocationMapByItemId.get(item.id) || itemLocationMapByItemId.get(String(item.id)) || [];
        const validMappings = rawMappings.filter(m => m.quantity > 0 && (locationMap.has(m.locationId as any) || locationMap.has(String(m.locationId))));
        const totalAssignedQty = validMappings.reduce((sum, m) => sum + m.quantity, 0);
        const unassignedQty = Math.max(0, (item.currentStock || 0) - totalAssignedQty);

        if (totalAssignedQty > 0) assigned++;
        if ((item.currentStock || 0) > 0 && unassignedQty > 0) unassigned++;
      }
    });
    return { assignedCount: assigned, unassignedCount: unassigned };
  }, [activeTenantItems, itemLocationMapByItemId, locationMap]);

  const capacityUtilization = useMemo(() => {
    let totalCap = 0;
    tenantLocations.forEach(l => { totalCap += (l.capacity || 0); });
    let usedCap = 0;
    const tenantLocIds = new Set<string | number>();
    tenantLocations.forEach(l => {
      if (l.id !== undefined && l.id !== null) {
        tenantLocIds.add(l.id as any);
        tenantLocIds.add(String(l.id));
      }
    });
    allItemLocations.filter(il => tenantLocIds.has(il.locationId as any) || tenantLocIds.has(String(il.locationId))).forEach(il => { usedCap += il.quantity; });
    if (totalCap === 0) return 0;
    return Math.min(100, Math.round((usedCap / totalCap) * 100));
  }, [tenantLocations, allItemLocations]);

  const defaultWarehouseName = useMemo(() => {
    const mainWh = tenantLocations.find(l => l.type === 'WAREHOUSE');
    return mainWh ? mainWh.name : (business?.name || 'Main Warehouse');
  }, [tenantLocations, business]);

  // Grouped Rows for Stock by Location Table (1 Row per Product)
  const groupedStockRows = useMemo(() => {
    const rows: Array<{
      item: Item;
      primaryWarehouseName: string;
      totalStock: number;
      totalAssignedQty: number;
      unassignedQty: number;
      allocatedMappings: Array<{
        mapping?: ItemLocationMapping;
        warehouseName: string;
        shelfCode: string;
        fullPath: string;
        availableQty: number;
        capacityLimit: number;
        isUnassigned: boolean;
        isStoreFront?: boolean;
      }>;
      hasAllocations: boolean;
    }> = [];

    // Deduplicate activeTenantItems by SKU code or ID to ensure 1 row per product
    const uniqueItems: Item[] = [];
    const seenSkus = new Set<string>();

    activeTenantItems.forEach(item => {
      if (!item.id) return;
      const skuKey = item.skuCode ? item.skuCode.trim().toLowerCase() : `id_${item.id}`;
      if (!seenSkus.has(skuKey)) {
        seenSkus.add(skuKey);
        uniqueItems.push(item);
      }
    });

    uniqueItems.forEach(item => {
      if (!item.id) return;
      const rawMappings = itemLocationMapByItemId.get(item.id) || itemLocationMapByItemId.get(String(item.id)) || (item.id ? itemLocationMapByItemId.get(Number(item.id)) : []) || [];

      // Deduplicate mappings by locationId for this item
      const uniqueMappingMap = new Map<string | number, ItemLocationMapping>();
      rawMappings.forEach(m => {
        if (!uniqueMappingMap.has(m.locationId)) {
          uniqueMappingMap.set(m.locationId, m);
        } else {
          const existing = uniqueMappingMap.get(m.locationId)!;
          existing.quantity = Math.max(existing.quantity, m.quantity);
        }
      });

      const validMappings = Array.from(uniqueMappingMap.values()).filter(m => {
        if (m.quantity <= 0) return false;
        const locIdStr = String(m.locationId);
        const locObj = locationMap.get(m.locationId) || locationMap.get(locIdStr) || activeLocations.find(l => String(l.id) === locIdStr);
        if (!locObj) return false;
        return locObj.type !== 'WAREHOUSE';
      });

      const allocatedMappings: Array<{
        mapping?: ItemLocationMapping;
        warehouseName: string;
        shelfCode: string;
        fullPath: string;
        availableQty: number;
        capacityLimit: number;
        isUnassigned: boolean;
        isStoreFront?: boolean;
      }> = validMappings.map(m => {
        const locObj = locationMap.get(m.locationId) || locationMap.get(String(m.locationId)) || activeLocations.find(l => String(l.id) === String(m.locationId));
        const isStoreFront = locObj ? (Boolean(locObj.isStoreFront) || locObj.code === 'STORE-FRONT' || locObj.name?.toLowerCase().includes('store front') || (locObj as any).type === 'STORE_FRONT') : false;
        const locInfo = getLocationFullPath(m.locationId);
        return {
          mapping: m,
          warehouseName: isStoreFront ? (business?.name || 'Active Store') : locInfo.warehouse,
          shelfCode: isStoreFront ? '🏪 Store Front Sales Floor' : locInfo.shelf,
          fullPath: isStoreFront ? `Store Front / POS Sales Floor (${business?.name || 'Active Store'})` : locInfo.fullPath,
          availableQty: m.quantity,
          capacityLimit: isStoreFront ? 0 : (m.maxCapacity || locObj?.capacity || 100),
          isUnassigned: false,
          isStoreFront
        };
      });

      const totalAssignedQty = validMappings.reduce((sum, m) => sum + m.quantity, 0);
      const unassignedQty = Math.max(0, item.currentStock - totalAssignedQty);

      if (unassignedQty > 0) {
        allocatedMappings.push({
          warehouseName: getTrueWarehouseName(),
          shelfCode: '📦 Unallocated Warehouse Stock',
          fullPath: 'Warehouse Reserve & Storage (Unallocated Stock)',
          availableQty: unassignedQty,
          capacityLimit: 0,
          isUnassigned: true,
          isStoreFront: false
        });
      }

      // Determine primary warehouse name (e.g. Sapphire-LHR)
      const primaryWh = getTrueWarehouseName(validMappings[0]?.locationId);

      rows.push({
        item,
        primaryWarehouseName: primaryWh,
        totalStock: item.currentStock,
        totalAssignedQty,
        unassignedQty,
        allocatedMappings,
        hasAllocations: validMappings.length > 0
      });
    });

    return rows;
  }, [items, itemLocationMapByItemId, locationMap, defaultWarehouseName]);

  // Filtered Grouped Stock Rows
  const filteredGroupedStockRows = useMemo(() => {
    return groupedStockRows.filter(row => {
      // Search term filter
      const matchesSearch =
        !searchTerm ||
        (row.item?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (row.item?.skuCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (row.item?.barcode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.allocatedMappings.some(m =>
          (m.shelfCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (m.fullPath || '').toLowerCase().includes(searchTerm.toLowerCase())
        );

      // Barcode quick search filter
      const matchesBarcode =
        !barcodeSearch ||
        ((row.item?.barcode || '').toLowerCase() === barcodeSearch.trim().toLowerCase()) ||
        ((row.item?.skuCode || '').toLowerCase() === barcodeSearch.trim().toLowerCase());

      // Warehouse filter
      const matchesWh =
        selectedWarehouseFilter === 'ALL' ||
        row.primaryWarehouseName === selectedWarehouseFilter ||
        row.allocatedMappings.some(m => m.warehouseName === selectedWarehouseFilter);

      // Unassigned filter
      const matchesUnassigned = !showUnassignedOnly || (row.totalStock > 0 && row.unassignedQty > 0);

      return matchesSearch && matchesBarcode && matchesWh && matchesUnassigned;
    });
  }, [groupedStockRows, searchTerm, barcodeSearch, selectedWarehouseFilter, showUnassignedOnly]);

  const toggleRowExpanded = (itemId: number) => {
    setExpandedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  // Unique Warehouse list for filter
  const warehouseOptions = useMemo(() => {
    const set = new Set<string>();
    locations.filter(l => l.type === 'WAREHOUSE').forEach(w => set.add(w.name));
    return Array.from(set);
  }, [locations]);

  // Create Location Handler
  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locName.trim() || !locCode.trim()) {
      showToast('Please enter Location Name and Code', 'error');
      return;
    }

    if (locType !== 'WAREHOUSE') {
      if (!locParentId) {
        showToast(`Please select a Parent Location for ${locType === 'ZONE' ? 'Zone / Aisle' : 'Rack / Shelf / Bin'}.`, 'error');
        return;
      }

      if (parentCapacityStats) {
        const { parent, parentCap, usedCap, availableCap, childCount } = parentCapacityStats;
        const enteredCap = Number(locCapacity) || 0;
        const childTypeName = locType === 'ZONE' ? 'zones' : 'racks';

        if (enteredCap > availableCap) {
          showToast(
            `Capacity (${enteredCap} units) exceeds available space in ${parent.name}. Only ${availableCap} units space left out of ${parentCap} units (${usedCap} units used by ${childCount} existing ${childTypeName}).`,
            'error'
          );
          return;
        }
      }
    }

    const codeUpper = locCode.trim().toUpperCase();
    const existingCode = locations.find(l => l.code === codeUpper && l.tenantId === tenantId);
    if (existingCode) {
      showToast(`Location Code "${codeUpper}" already exists! Please use a unique code.`, 'error');
      return;
    }

    const locId = `loc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const payload = {
      id: locId,
      tenantId,
      name: locName.trim(),
      code: codeUpper,
      type: locType,
      parentId: locParentId ? String(locParentId) : null,
      capacity: Number(locCapacity) || 0,
      description: locDescription.trim(),
      isShared: locType === 'WAREHOUSE',
      createdAt: new Date().toISOString()
    };

    try {
      await db.locations.put(payload);
      saveServerLocation(payload).catch(() => { });
      ClientSyncManager.logMutation('LOCATION', locId, 'INSERT', payload);

      showToast(`Location "${locName}" created successfully!`, 'success');
      setIsAddLocationOpen(false);
      setLocName('');
      setLocCode('');
      setLocType('WAREHOUSE');
      setLocParentId('');
      setLocCapacity('500');
      setLocDescription('');
    } catch (err: any) {
      showToast(`Failed to create location: ${err.message}`, 'error');
    }
  };

  // Inter-Location Transfer Handler
  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(transferQty);

    if (!transferItemId || !transferSourceLocId || !transferDestLocId || isNaN(qty) || qty <= 0) {
      showToast('Please fill all transfer details with a valid quantity.', 'error');
      return;
    }

    if (String(transferSourceLocId) === String(transferDestLocId)) {
      showToast('Source and Destination locations must be different.', 'error');
      return;
    }

    try {
      const tenantId = activeTenantId;

      // 1. Deduct from Source Location Mapping
      let srcMapping = await db.itemLocations
        .filter(il => (il.tenantId || 'default-tenant') === tenantId && String(il.itemId) === String(transferItemId) && String(il.locationId) === String(transferSourceLocId))
        .first();

      const itemObj = items.find(i => String(i.id) === String(transferItemId));

      // Auto-fallback: If item has stock in store but no explicit source mapping record yet
      if (!srcMapping && itemObj && itemObj.currentStock >= qty) {
        const newSrcId = `map-${transferItemId}-${transferSourceLocId}`;
        const newMapPayload = {
          id: newSrcId,
          tenantId,
          itemId: String(transferItemId),
          locationId: String(transferSourceLocId),
          quantity: itemObj.currentStock,
          maxCapacity: 500,
          updatedAt: new Date().toISOString()
        };
        await db.itemLocations.put(newMapPayload);
        ClientSyncManager.logMutation('ITEM_LOCATION', newSrcId, 'INSERT', newMapPayload);
        srcMapping = await db.itemLocations.get(newSrcId);
      }

      if (!srcMapping || srcMapping.quantity < qty) {
        showToast(`Insufficient quantity in source location (Available: ${srcMapping ? srcMapping.quantity : 0})`, 'error');
        return;
      }

      const updatedSrcQty = srcMapping.quantity - qty;
      await db.itemLocations.update(srcMapping.id!, {
        quantity: updatedSrcQty,
        updatedAt: new Date().toISOString()
      });
      ClientSyncManager.logMutation('ITEM_LOCATION', String(srcMapping.id), 'UPDATE', { ...srcMapping, quantity: updatedSrcQty, updatedAt: new Date().toISOString() });
      saveServerItemLocation({ tenantId, itemId: Number(transferItemId) || 0, skuCode: itemObj?.skuCode, name: itemObj?.name, locationId: Number(transferSourceLocId) || 0, quantity: updatedSrcQty }).catch(() => { });

      // 2. Add to Destination Location Mapping
      const destMapping = await db.itemLocations
        .filter(il => (il.tenantId || 'default-tenant') === tenantId && String(il.itemId) === String(transferItemId) && String(il.locationId) === String(transferDestLocId))
        .first();

      const updatedDestQty = (destMapping ? destMapping.quantity : 0) + qty;
      if (destMapping) {
        await db.itemLocations.update(destMapping.id!, {
          quantity: updatedDestQty,
          updatedAt: new Date().toISOString()
        });
        ClientSyncManager.logMutation('ITEM_LOCATION', String(destMapping.id), 'UPDATE', { ...destMapping, quantity: updatedDestQty, updatedAt: new Date().toISOString() });
      } else {
        const newDestMapId = `map-${transferItemId}-${transferDestLocId}`;
        const destMapPayload = {
          id: newDestMapId,
          tenantId,
          itemId: String(transferItemId),
          locationId: String(transferDestLocId),
          quantity: qty,
          maxCapacity: 200,
          updatedAt: new Date().toISOString()
        };
        await db.itemLocations.put(destMapPayload);
        ClientSyncManager.logMutation('ITEM_LOCATION', newDestMapId, 'INSERT', destMapPayload);
      }
      saveServerItemLocation({ tenantId, itemId: Number(transferItemId) || 0, skuCode: itemObj?.skuCode, name: itemObj?.name, locationId: Number(transferDestLocId) || 0, quantity: updatedDestQty }).catch(() => { });

      // 3. Log Stock Transfer History
      const trfId = `trf-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const trfNum = `TRF-${Date.now().toString().slice(-6)}`;
      const transferPayload = {
        id: trfId,
        transferNumber: trfNum,
        tenantId,
        sourceLocationId: String(transferSourceLocId),
        destinationLocationId: String(transferDestLocId),
        itemId: String(transferItemId),
        quantity: qty,
        transferDate: new Date().toISOString().split('T')[0],
        notes: transferNotes || 'Internal inter-location stock transfer',
        createdAt: new Date().toISOString()
      };
      await db.stockTransfers.put(transferPayload);
      createServerStockTransfer(transferPayload).catch(() => { });
      ClientSyncManager.logMutation('STOCK_TRANSFER', trfId, 'INSERT', transferPayload);

      const selectedItem = items.find(i => String(i.id) === String(transferItemId));
      const srcLoc = locations.find(l => String(l.id) === String(transferSourceLocId));
      const destLoc = locations.find(l => String(l.id) === String(transferDestLocId));

      showToast(
        `Transferred ${qty} PCS of ${selectedItem?.name || 'Item'} from ${srcLoc?.name || 'Source Location'} to ${destLoc?.name || 'Destination Location'}.`,
        'success'
      );

      setIsTransferModalOpen(false);
      setTransferItemId('');
      setTransferSourceLocId('');
      setTransferDestLocId('');
      setTransferQty('1');
      setTransferNotes('');
    } catch (err: any) {
      showToast(`Transfer failed: ${err.message}`, 'error');
    }
  };

  // Relocate Item Handler
  const handleSaveRelocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!relocateItem || !relocateDestLocId) {
      showToast('Please select a destination shelf location', 'error');
      return;
    }

    const item = relocateItem.item;
    const destLocId = relocateDestLocId;
    const qty = Number(relocateQty);
    const cap = Number(relocateMaxCap);

    if (isNaN(qty) || qty <= 0) {
      showToast('Quantity must be a valid positive number', 'error');
      return;
    }

    const selectedDestLoc = locationMap.get(destLocId) || locationMap.get(String(destLocId));
    if (selectedDestLoc) {
      const capInfo = getLocCapacityInfo(selectedDestLoc);
      if (qty > capInfo.remaining) {
        showToast(
          `⛔ Cannot assign ${qty} PCS! Location "${selectedDestLoc.name}" has only ${capInfo.remaining} PCS available space remaining (Max: ${capInfo.max} PCS, Used: ${capInfo.used} PCS).`,
          'error'
        );
        return;
      }
    }

    const availableUnallocatedStock = getItemUnallocatedStock(item, relocateItem.currentMapping?.id);
    const maxAllowedStock = relocateItem.currentMapping ? (relocateItem.currentMapping.quantity + availableUnallocatedStock) : availableUnallocatedStock;
    if (qty > maxAllowedStock) {
      showToast(
        `⛔ Cannot assign ${qty} PCS! Only ${maxAllowedStock} PCS available unallocated stock for "${item.name}".`,
        'error'
      );
      return;
    }

    try {
      // Find if a mapping already exists at the destination locationId for this active tenant
      const existingDestMapping = await db.itemLocations
        .filter(il => (il.tenantId || 'default-tenant') === tenantId && (String(il.itemId) === String(item.id) || Number(il.itemId) === Number(item.id)) && String(il.locationId) === String(destLocId))
        .first();

      if (relocateItem.currentMapping && relocateItem.currentMapping.id) {
        const oldLocId = String(relocateItem.currentMapping.locationId);
        if (oldLocId !== String(destLocId)) {
          // Moving from old location to new destination location
          if (existingDestMapping && existingDestMapping.id) {
            await db.itemLocations.update(existingDestMapping.id, {
              tenantId,
              quantity: qty,
              maxCapacity: cap,
              updatedAt: new Date().toISOString()
            });
            // Delete old source location mapping so no orphan records remain
            await db.itemLocations.delete(relocateItem.currentMapping.id);
          } else {
            await db.itemLocations.update(relocateItem.currentMapping.id, {
              tenantId,
              locationId: destLocId,
              quantity: qty,
              maxCapacity: cap,
              updatedAt: new Date().toISOString()
            });
          }
        } else {
          // Updating quantity at the exact same location
          await db.itemLocations.update(relocateItem.currentMapping.id, {
            tenantId,
            quantity: qty,
            maxCapacity: cap,
            updatedAt: new Date().toISOString()
          });
        }
      } else {
        // Creating a new placement for unassigned item
        if (existingDestMapping && existingDestMapping.id) {
          await db.itemLocations.update(existingDestMapping.id, {
            tenantId,
            quantity: qty,
            maxCapacity: cap,
            updatedAt: new Date().toISOString()
          });
          ClientSyncManager.logMutation('ITEM_LOCATION', String(existingDestMapping.id), 'UPDATE', { ...existingDestMapping, quantity: qty, maxCapacity: cap, updatedAt: new Date().toISOString() });
        } else {
          const mapId = `map-${item.id}-${destLocId}`;
          const mapPayload = {
            id: mapId,
            tenantId,
            itemId: String(item.id!),
            locationId: String(destLocId),
            quantity: qty,
            maxCapacity: cap,
            updatedAt: new Date().toISOString()
          };
          await db.itemLocations.put(mapPayload);
          ClientSyncManager.logMutation('ITEM_LOCATION', mapId, 'INSERT', mapPayload);
        }

        // Deduct from any root warehouse reserve mappings if placing unassigned stock into a rack
        const selectedDestObj = locationMap.get(destLocId) || locationMap.get(String(destLocId));
        if (selectedDestObj && selectedDestObj.type !== 'WAREHOUSE') {
          const whLocIds = new Set(locations.filter(l => l.type === 'WAREHOUSE').map(l => String(l.id)));
          const rootWhMappings = await db.itemLocations
            .filter(il => (il.tenantId || 'default-tenant') === tenantId && (String(il.itemId) === String(item.id) || Number(il.itemId) === Number(item.id)) && whLocIds.has(String(il.locationId)))
            .toArray();

          for (const rootMap of rootWhMappings) {
            if (!rootMap.id) continue;
            const newRootQty = Math.max(0, rootMap.quantity - qty);
            if (newRootQty <= 0) {
              await db.itemLocations.delete(rootMap.id);
            } else {
              await db.itemLocations.update(rootMap.id, { quantity: newRootQty, updatedAt: new Date().toISOString() });
            }
          }
        }
      }

      const destLoc = locationMap.get(destLocId) || locationMap.get(String(destLocId));
      saveServerItemLocation({ tenantId, itemId: item.id!, skuCode: item.skuCode, name: item.name, locationId: destLocId, locationCode: destLoc?.code, quantity: qty, maxCapacity: cap }).catch(() => { });
      showToast(`Item "${item.name}" assigned to "${destLoc?.name || 'Location'}" successfully!`, 'success');
      setRelocateItem(null);
    } catch (err: any) {
      showToast(`Relocation failed: ${err.message}`, 'error');
    }
  };

  const handleSeed100Items = async () => {
    showToast('Seeding 100 sample inventory items...', 'info');
    const count = await seed100SampleItems(tenantId);
    showToast(`Successfully added ${count} new sample inventory items!`, 'success');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8fafc] overflow-hidden select-none">
      {/* ── Top Header & Quick Actions Bar ─────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-200">
              <MapPin className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                Inventory Location & Warehouse Manager
              </h1>
              <p className="text-xs font-semibold text-slate-500">
                Multi-level space hierarchy, shelf mapping, and inter-location stock transfers
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSeed100Items}
            className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-extrabold text-xs border border-emerald-200 shadow-sm transition flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>+ Seed 100 Sample Items</span>
          </button>

          <button
            onClick={() => setIsTransferModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-extrabold text-xs border border-purple-200 shadow-sm transition flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeftRight className="w-4 h-4 stroke-[2.5]" />
            <span>⇄ Transfer Stock</span>
          </button>

          <button
            onClick={() => setIsTemplateModalOpen(true)}
            className="px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 font-extrabold text-xs border border-amber-200 shadow-sm transition flex items-center gap-2 cursor-pointer"
          >
            <Wand2 className="w-4 h-4 text-amber-600 stroke-[2.5]" />
            <span>⚡ Store Layout Generator</span>
          </button>

          <button
            onClick={() => setIsAddLocationOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs shadow-md shadow-purple-200 transition flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>+ Add Location</span>
          </button>
        </div>
      </div>

      {/* ── Scrollable View Body ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* ── Top 4 Metric Cards ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Card 1: Active Warehouses */}
          <div className="card p-5 bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Warehouses</span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Warehouse className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-800">{activeWarehouses}</span>
              <span className="text-xs font-semibold text-slate-400">Store Branches</span>
            </div>
          </div>

          {/* Card 2: Defined Shelves & Bins */}
          <div className="card p-5 bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Defined Shelves / Bins</span>
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-800">{definedShelves}</span>
              <span className="text-xs font-semibold text-slate-400">Zones & Shelves</span>
            </div>
          </div>

          {/* Card 3: Assigned vs Unassigned Items */}
          <div className="card p-5 bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Assigned vs Unassigned</span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div>
                <span className="text-xl font-black text-emerald-600">{assignedCount}</span>
                <span className="text-[11px] font-bold text-slate-400 ml-1">Assigned</span>
              </div>
              <span className="text-slate-300">|</span>
              <div>
                <span className="text-xl font-black text-amber-600">{unassignedCount}</span>
                <span className="text-[11px] font-bold text-slate-400 ml-1">Unassigned</span>
              </div>
            </div>
          </div>

          {/* Card 4: Capacity Utilization % */}
          <div className="card p-5 bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Capacity Utilization</span>
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <PieChart className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-2xl font-black text-slate-800">{capacityUtilization}%</span>
                <span className="text-xs font-bold text-indigo-600">Allocated</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${capacityUtilization}%` }}
                />
              </div>
            </div>
          </div>

        </div>

        {/* ── Section Views Header & Filters ─────────────────────────────── */}
        <div className="card p-5 bg-white border border-slate-200/80 rounded-2xl shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">

            {/* View Switcher Tabs */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setActiveViewTab('stock-table')}
                className={`px-4 py-2 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center gap-2 ${activeViewTab === 'stock-table'
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                <Package className="w-4 h-4" />
                <span>Stock by Location</span>
              </button>

              <button
                onClick={() => setActiveViewTab('hierarchy-master')}
                className={`px-4 py-2 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center gap-2 ${activeViewTab === 'hierarchy-master'
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                <FolderTree className="w-4 h-4" />
                <span>Location Hierarchy Master</span>
              </button>

              <button
                onClick={() => setActiveViewTab('store-connections')}
                className={`px-4 py-2 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center gap-2 ${activeViewTab === 'store-connections'
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                <Building2 className="w-4 h-4" />
                <span>🏬 Store & Warehouse Connections</span>
              </button>

              {(() => {
                const tenantTransfersCount = (stockTransfers || []).filter(st => (st.tenantId || 'default-tenant') === activeTenantId || !st.tenantId).length;
                return (
                  <button
                    onClick={() => setActiveViewTab('transfer-history')}
                    className={`px-4 py-2 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center gap-2 ${activeViewTab === 'transfer-history'
                        ? 'bg-white text-purple-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                      }`}
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                    <span>Stock Transfer Logs ({tenantTransfersCount})</span>
                  </button>
                );
              })()}

              {(() => {
                const whLocs = locations.filter(l => l.type === 'WAREHOUSE');
                const lowStoreCount = items.filter(item => {
                  const itemMaps = itemLocations.filter(il => Number(il.itemId) === Number(item.id));
                  const whStock = itemMaps.filter(il => whLocs.some(w => Number(w.id) === Number(il.locationId))).reduce((sum, il) => sum + il.quantity, 0);
                  const storeStock = itemMaps.filter(il => !whLocs.some(w => Number(w.id) === Number(il.locationId))).reduce((sum, il) => sum + il.quantity, 0);
                  return whStock > 0 && storeStock <= 5;
                }).length;

                return (
                  <button
                    onClick={() => setActiveViewTab('replenishment')}
                    className={`px-4 py-2 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center gap-2 ${activeViewTab === 'replenishment'
                        ? 'bg-purple-600 text-white shadow-md shadow-purple-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                      }`}
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>⚡ Store Replenishment ({lowStoreCount} Alerts)</span>
                  </button>
                );
              })()}
            </div>

            {/* Filter Toggle & Auto-Allocate Action for Unassigned Items */}
            {activeViewTab === 'stock-table' && (
              <div className="flex items-center gap-3">
                {unassignedCount > 0 && (
                  <button
                    onClick={() => handleAutoAllocateStock()}
                    className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 font-extrabold text-xs text-amber-900 shadow-2xs transition cursor-pointer flex items-center gap-1.5"
                    title="Automatically place unassigned godown stock into open warehouse racks"
                  >
                    <Wand2 className="w-4 h-4 text-amber-600 stroke-[2.5]" />
                    <span>⚡ Auto-Allocate All Unassigned Stock</span>
                  </button>
                )}

                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showUnassignedOnly}
                    onChange={e => setShowUnassignedOnly(e.target.checked)}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                  <span className={showUnassignedOnly ? 'text-amber-600 font-extrabold' : ''}>
                    Show Unassigned Items Only ({unassignedCount})
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Search Controls */}
          {activeViewTab === 'stock-table' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Main Text Search */}
              <div className="md:col-span-5 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search by Product Name, SKU, Barcode, Shelf Code..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>

              {/* Warehouse Filter Dropdown */}
              <div className="md:col-span-3">
                <select
                  value={selectedWarehouseFilter}
                  onChange={e => setSelectedWarehouseFilter(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none"
                >
                  <option value="ALL">All Warehouses & Stores</option>
                  {warehouseOptions.map(wh => (
                    <option key={wh} value={wh}>{wh}</option>
                  ))}
                </select>
              </div>

              {/* Barcode Quick Search */}
              <div className="md:col-span-4 relative">
                <Barcode className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={barcodeSearch}
                  onChange={e => setBarcodeSearch(e.target.value)}
                  placeholder="Scan Barcode to locate shelf..."
                  className="w-full pl-10 pr-4 py-2.5 bg-purple-50/50 border border-purple-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── View 1: Stock by Location Table ───────────────────────────── */}
        {activeViewTab === 'stock-table' && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="vyapar-table">
                <thead>
                  <tr>
                    <th className="w-10 text-center"></th>
                    <th>Item Details</th>
                    <th>SKU / Barcode</th>
                    <th>Warehouse / Branch</th>
                    <th>Shelf & Rack Allocation</th>
                    <th className="text-right">Total Available Qty</th>
                    <th className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGroupedStockRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-400 font-medium">
                        No inventory stock mapping found matching your search.
                      </td>
                    </tr>
                  ) : (
                    filteredGroupedStockRows.map(group => {
                      const isExpanded = expandedItemIds.has(group.item.id!);
                      const validAllocations = group.allocatedMappings.filter(m => !m.isUnassigned);

                      return (
                        <React.Fragment key={group.item.id}>
                          {/* Primary Product Row */}
                          <tr
                            onClick={() => toggleRowExpanded(group.item.id!)}
                            className={`cursor-pointer transition-colors hover:bg-slate-50 ${isExpanded ? 'bg-purple-50/60 font-semibold' : ''
                              }`}
                          >
                            {/* Expand Toggle Chevron */}
                            <td className="text-center py-3">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleRowExpanded(group.item.id!);
                                }}
                                className="p-1 rounded text-slate-400 hover:text-purple-700 hover:bg-purple-100 transition cursor-pointer"
                              >
                                <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-purple-700 font-bold' : ''}`} />
                              </button>
                            </td>

                            {/* Item Details */}
                            <td>
                              <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                                <Package className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                <span>{group.item.name}</span>
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono">Unit: {group.item.unitType}</div>
                            </td>

                            {/* SKU / Barcode */}
                            <td>
                              <div className="font-mono text-xs font-bold text-slate-700">{group.item.skuCode}</div>
                              <div className="font-mono text-[11px] text-slate-400">{group.item.barcode}</div>
                            </td>

                            {/* Warehouse / Branch */}
                            <td>
                              {group.primaryWarehouseName && group.primaryWarehouseName !== 'N/A (No Linked Warehouse)' ? (
                                <span className="badge badge-blue">
                                  <Building2 className="w-3 h-3 text-blue-600" />
                                  {group.primaryWarehouseName}
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-full bg-slate-100/90 text-slate-400 font-extrabold text-[10.5px] border border-slate-200/90 inline-flex items-center gap-1">
                                  <Building2 className="w-3 h-3 text-slate-400" />
                                  <span>N/A (No Linked Warehouse)</span>
                                </span>
                              )}
                            </td>

                            {/* Shelf & Rack Allocation Summary Badge */}
                            <td>
                              {validAllocations.length > 0 && group.unassignedQty <= 0 ? (
                                <span className="badge badge-purple cursor-pointer" onClick={() => toggleRowExpanded(group.item.id!)}>
                                  <MapPin className="w-3 h-3 text-purple-600" />
                                  {validAllocations.length} Racks Allocated ({group.totalAssignedQty} {group.item.unitType})
                                </span>
                              ) : validAllocations.length > 0 && group.unassignedQty > 0 ? (
                                <span className="badge badge-amber cursor-pointer" onClick={() => toggleRowExpanded(group.item.id!)}>
                                  <MapPin className="w-3 h-3 text-amber-600" />
                                  {validAllocations.length} Racks ({group.totalAssignedQty} {group.item.unitType}) + 📦 {group.unassignedQty} Unallocated
                                </span>
                              ) : group.totalStock > 0 ? (
                                <span className="px-2.5 py-1 rounded-full bg-amber-50/90 text-amber-800 font-extrabold text-[10.5px] border border-amber-200 inline-flex items-center gap-1 cursor-pointer hover:bg-amber-100 transition" onClick={() => handleAutoAllocateStock(group.item)} title="Click to auto-allocate into available warehouse racks">
                                  <Package className="w-3 h-3 text-amber-600" />
                                  <span>Unallocated Warehouse Stock ({group.totalStock} {group.item.unitType})</span>
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-full bg-slate-100/90 text-slate-500 font-extrabold text-[10.5px] border border-slate-200 inline-flex items-center gap-1">
                                  <Package className="w-3 h-3 text-slate-400" />
                                  <span>Out of Stock (0 {group.item.unitType})</span>
                                </span>
                              )}
                            </td>

                            {/* Total Available Qty */}
                            <td className="text-right font-mono text-xs font-black text-slate-900">
                              {group.totalStock} {group.item.unitType}
                            </td>

                            {/* Actions */}
                            <td className="text-center" onClick={e => e.stopPropagation()}>
                              <div className="inline-flex items-center gap-1.5">
                                {group.unassignedQty > 0 && group.totalStock > 0 && (
                                  <button
                                    onClick={() => handleAutoAllocateStock(group.item)}
                                    className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 text-[11px] font-extrabold transition cursor-pointer flex items-center gap-1 border border-amber-300 shadow-2xs"
                                    title="Auto-fill unassigned stock into open warehouse racks"
                                  >
                                    <Wand2 className="w-3.5 h-3.5 text-amber-600 stroke-[2.5]" />
                                    <span>Auto-Rack</span>
                                  </button>
                                )}

                                <button
                                  onClick={() => handleOpenTransferForRow(group.item)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold transition cursor-pointer flex items-center gap-1 border border-emerald-200"
                                  title="Transfer stock between locations"
                                >
                                  <ArrowLeftRight className="w-3.5 h-3.5" />
                                  <span>⇄ Transfer</span>
                                </button>

                                <button
                                  onClick={() => handleOpenRelocateModal(group.item)}
                                  className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-[11px] font-bold transition cursor-pointer flex items-center gap-1 border border-purple-200"
                                  title="Relocate or assign to shelf"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                  <span>Relocate</span>
                                </button>

                                <button
                                  onClick={() => toggleRowExpanded(group.item.id!)}
                                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer border ${isExpanded
                                      ? 'bg-purple-600 text-white border-purple-600'
                                      : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                                    }`}
                                >
                                  {isExpanded ? 'Hide' : 'Locations'}
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expandable Embedded Sub-Table Drawer */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={7} className="p-0 bg-slate-50/80 border-b border-purple-100">
                                <div className="p-3.5 space-y-2.5 bg-purple-50/40 border-l-4 border-purple-600 rounded-r-xl my-1 mx-2">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="font-extrabold text-purple-900 flex items-center gap-1.5">
                                      <FolderTree className="w-4 h-4 text-purple-600" />
                                      Storage Allocation Breakdown for "{group.item.name}"
                                    </span>
                                    <span className="text-[11px] text-slate-500 font-mono">
                                      {group.totalAssignedQty} PCS Allocated across {validAllocations.length} Racks
                                    </span>
                                  </div>

                                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
                                    <table className="vyapar-table text-xs">
                                      <thead>
                                        <tr>
                                          <th>Rack / Bin Code</th>
                                          <th>Hierarchy Path</th>
                                          <th className="text-right">Available Qty</th>
                                          <th className="text-right">Rack Capacity</th>
                                          <th className="text-center">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {group.allocatedMappings.map((m, mIdx) => {
                                          const pct = m.capacityLimit > 0 ? Math.min(100, Math.round((m.availableQty / m.capacityLimit) * 100)) : 0;

                                          return (
                                            <tr key={mIdx}>
                                              <td>
                                                <div className={`font-bold flex items-center gap-1.5 ${m.isStoreFront ? 'text-emerald-700 font-extrabold' : m.isUnassigned ? 'text-amber-800 font-extrabold' : 'text-slate-800'}`}>
                                                  {m.isStoreFront ? (
                                                    <Store className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                                  ) : m.isUnassigned ? (
                                                    <Package className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                                  ) : (
                                                    <MapPin className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                                  )}
                                                  <span>{m.isStoreFront ? '🛒 Store Front Stock' : m.shelfCode}</span>
                                                </div>
                                              </td>
                                              <td className={`font-mono text-[11px] ${m.isStoreFront ? 'text-emerald-600 font-bold' : 'text-slate-500'}`}>
                                                {m.fullPath}
                                              </td>
                                              <td className="text-right font-black text-slate-900 font-mono">
                                                {m.availableQty} {group.item.unitType}
                                              </td>
                                              <td className="text-right">
                                                {m.capacityLimit > 0 ? (
                                                  <div className="flex items-center justify-end gap-2">
                                                    <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                      <div
                                                        className={`h-full ${pct >= 100 ? 'bg-red-500' : pct > 50 ? 'bg-purple-600' : 'bg-emerald-500'}`}
                                                        style={{ width: `${pct}%` }}
                                                      />
                                                    </div>
                                                    <span className="font-mono text-[10.5px] font-bold text-slate-600">
                                                      {pct}% ({m.capacityLimit} Max)
                                                    </span>
                                                  </div>
                                                ) : (
                                                  <span className="font-mono text-[11px] text-slate-400">N/A</span>
                                                )}
                                              </td>
                                              <td className="text-center">
                                                <div className="inline-flex items-center gap-1">
                                                  <button
                                                    onClick={() => handleOpenTransferForRow(group.item, m.mapping)}
                                                    className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10.5px] font-bold transition cursor-pointer border border-emerald-200 flex items-center gap-1"
                                                    title="Transfer from this specific rack"
                                                  >
                                                    <ArrowLeftRight className="w-3 h-3" />
                                                    <span>Transfer</span>
                                                  </button>
                                                  <button
                                                    onClick={() => handleOpenRelocateModal(group.item, m.mapping)}
                                                    className="px-2 py-1 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 text-[10.5px] font-bold transition cursor-pointer border border-purple-200 flex items-center gap-1"
                                                    title="Relocate from this rack"
                                                  >
                                                    <Edit2 className="w-3 h-3" />
                                                    <span>Relocate</span>
                                                  </button>
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── View 2: Location Hierarchy Master ─────────────────────────── */}
        {activeViewTab === 'hierarchy-master' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {displayWarehouses.map(wh => {
                const zones = locations.filter(l =>
                  l.type === 'ZONE' &&
                  (String(l.parentId) === String(wh.id) || (wh.code && l.code.startsWith(wh.code + '-')))
                );

                const directShelves = locations.filter(l =>
                  l.type === 'SHELF' &&
                  (String(l.parentId) === String(wh.id) || (wh.code && l.code.startsWith(wh.code + '-') && !zones.some(z => z.code && l.code.startsWith(z.code + '-'))))
                );

                const hasChildren = zones.length > 0 || directShelves.length > 0;

                return (
                  <div key={wh.id} className="card bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm hover:shadow-md transition">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                          <Warehouse className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-extrabold text-sm text-slate-800">{wh.name}</h3>
                          <span className="text-[11px] font-mono text-slate-400">{wh.code}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="badge badge-blue">Warehouse ({wh.capacity || 0} Cap)</span>
                        <button
                          onClick={() => handleDeleteLocation(wh)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                          title="Delete Warehouse"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500">{wh.description || 'Main warehouse facility'}</p>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                          Zones & Racks Hierarchy ({zones.length} Zones)
                        </span>
                      </div>

                      {!hasChildren ? (
                        <div className="text-xs text-slate-400 italic py-2">No zones or shelves created in this warehouse yet.</div>
                      ) : (
                        <div className="space-y-3">
                          {zones.map(zone => {
                            const shelves = locations.filter(l =>
                              l.type === 'SHELF' &&
                              (String(l.parentId) === String(zone.id) || (zone.code && l.code.startsWith(zone.code + '-')))
                            );

                            return (
                              <div key={zone.id} className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 space-y-2.5">
                                <div className="flex items-center justify-between text-xs font-bold text-slate-700 border-b border-slate-200/50 pb-2">
                                  <span className="flex items-center gap-1.5 text-purple-900 font-extrabold">
                                    <Layers className="w-4 h-4 text-purple-600" />
                                    {zone.name} <span className="text-[11px] text-purple-600/80 font-mono">({zone.code})</span>
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md font-extrabold uppercase">
                                      Zone ({zone.capacity || 0} Cap) • {shelves.length} Racks
                                    </span>
                                    <button
                                      onClick={() => handleDeleteLocation(zone)}
                                      className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-100 transition cursor-pointer"
                                      title="Delete Zone"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-1">
                                  {shelves.length === 0 && (() => {
                                    const directMaps = itemLocations.filter(il => String(il.locationId) === String(zone.id) && il.quantity > 0);
                                    return directMaps.length === 0;
                                  })() ? (
                                    <div className="text-[10.5px] text-slate-400 italic py-0.5 col-span-2">No racks in this zone yet.</div>
                                  ) : (
                                    shelves.map(sh => {
                                      const isSharedWh = !!wh.isShared;
                                      const allowedTenants = new Set<string>([wh.tenantId || 'default-tenant']);
                                      if (wh.allowedTenantIds && Array.isArray(wh.allowedTenantIds)) {
                                        wh.allowedTenantIds.forEach(id => allowedTenants.add(id));
                                      }
                                      const mapsToUse = allItemLocations.filter(il => {
                                        if (isSharedWh || allowedTenants.has(activeTenantId)) return true;
                                        const ilTenant = il.tenantId || 'default-tenant';
                                        return allowedTenants.has(ilTenant);
                                      });
                                      const rackMappings = mapsToUse.filter(il => String(il.locationId) === String(sh.id) && il.quantity > 0);
                                      const uniqueMappedProductsMap = new Map<string, { item?: Item; quantity: number; isOtherStore: boolean; mapping: ItemLocationMapping }>();

                                      rackMappings.forEach(il => {
                                        const ilTenant = il.tenantId || 'default-tenant';
                                        let matchedItem = allItems.find(i => String(i.id) === String(il.itemId) || ((i as any).cloudId && String((i as any).cloudId) === String(il.itemId)));
                                        if (!matchedItem && (il as any).skuCode) {
                                          const skuLower = String((il as any).skuCode).toLowerCase();
                                          matchedItem = allItems.find(i => i.skuCode && i.skuCode.toLowerCase() === skuLower);
                                        }
                                        const isOtherStore = ilTenant !== activeTenantId;
                                        const productKey = matchedItem ? (matchedItem.skuCode || `id_${matchedItem.id}`) : `item_${il.itemId}`;
                                        if (!uniqueMappedProductsMap.has(productKey)) {
                                          uniqueMappedProductsMap.set(productKey, { item: matchedItem, quantity: il.quantity, isOtherStore, mapping: il });
                                        } else {
                                          const existing = uniqueMappedProductsMap.get(productKey)!;
                                          existing.quantity = Math.max(existing.quantity, il.quantity);
                                        }
                                      });

                                      const mappedProducts = Array.from(uniqueMappedProductsMap.values()).filter(m => m.item);
                                      const totalUsedQty = mappedProducts.reduce((sum, m) => sum + m.quantity, 0);
                                      const maxCap = sh.capacity || 100;
                                      const fillPct = Math.min(100, Math.round((totalUsedQty / maxCap) * 100));

                                      return (
                                        <div key={sh.id} className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
                                          <div className="flex items-center justify-between text-[11px] text-slate-600">
                                            <span className="font-extrabold flex items-center gap-1 text-slate-800">
                                              <ChevronRight className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                              {sh.name} <span className="text-[9.5px] text-slate-400 font-mono">({sh.code})</span>
                                            </span>
                                            <div className="flex items-center gap-1">
                                              <span className={`font-mono text-[9.5px] font-bold px-1.5 py-0.5 rounded ${fillPct >= 100 ? 'bg-red-100 text-red-700' : fillPct > 0 ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-500'
                                                }`}>
                                                {totalUsedQty}/{maxCap} PCS {fillPct >= 100 ? '• FULL' : ''}
                                              </span>
                                              <button
                                                onClick={() => handleDeleteLocation(sh)}
                                                className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                                                title="Delete Shelf / Rack"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                          </div>

                                          {/* Mini Progress Bar */}
                                          <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                              className={`h-full transition-all duration-300 ${fillPct >= 100 ? 'bg-red-500' : fillPct > 0 ? 'bg-purple-600' : 'bg-slate-200'
                                                }`}
                                              style={{ width: `${fillPct}%` }}
                                            />
                                          </div>

                                          {/* Products List in this Rack */}
                                          {mappedProducts.length === 0 ? (
                                            <div className="text-[10px] text-slate-400 italic py-0.5 font-normal">📦 Empty Rack</div>
                                          ) : (
                                            <div className="space-y-1 pt-1.5 border-t border-slate-100">
                                              {mappedProducts.map(({ item, quantity, isOtherStore, mapping }, pIdx) => {
                                                return (
                                                  <div
                                                    key={pIdx}
                                                    onClick={() => setPreviewItemDetail({ item: item!, quantity, mapping, locationId: sh.id })}
                                                    className="flex items-center justify-between text-[10.5px] bg-purple-50/70 hover:bg-purple-100/90 px-2 py-1.5 rounded-lg border border-purple-200/80 hover:border-purple-300 transition cursor-pointer shadow-2xs group"
                                                    title="Click to enlarge & view full item details"
                                                  >
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                      <Package className="w-3.5 h-3.5 text-purple-600 shrink-0 group-hover:scale-110 transition" />
                                                      <span className="font-extrabold text-slate-800 truncate">{item!.name}</span>
                                                      <span className="text-[9.5px] text-slate-400 font-mono">({item!.skuCode})</span>
                                                      {isOtherStore && (
                                                        <span className="text-[9px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded ml-1 border border-purple-200 shrink-0" title="Item owned by linked store sharing this warehouse">
                                                          Shared Store
                                                        </span>
                                                      )}
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                      <span className="font-extrabold text-purple-900 bg-white px-2 py-0.5 rounded-md shadow-2xs text-[10.5px]">
                                                        {quantity} {item!.unitType || 'PCS'}
                                                      </span>
                                                      <Maximize2 className="w-3 h-3 text-purple-500 opacity-0 group-hover:opacity-100 transition" />
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              </div>
                            );
                          })}

                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Standalone / Unassigned Locations fallback */}
            {(() => {
              const warehouseIds = new Set(locations.filter(l => l.type === 'WAREHOUSE').map(l => String(l.id)));
              const warehouseCodes = new Set(locations.filter(l => l.type === 'WAREHOUSE').map(l => l.code));
              const zoneIds = new Set(locations.filter(l => l.type === 'ZONE').map(l => String(l.id)));
              const zoneCodes = new Set(locations.filter(l => l.type === 'ZONE').map(l => l.code));

              const standaloneZones = locations.filter(l => {
                if (l.type !== 'ZONE') return false;
                const matchesWhId = l.parentId && warehouseIds.has(String(l.parentId));
                const matchesWhCode = Array.from(warehouseCodes).some(wc => l.code.startsWith(wc + '-'));
                return !matchesWhId && !matchesWhCode;
              });

              const standaloneShelves = locations.filter(l => {
                if (l.type !== 'SHELF') return false;
                const matchesParentId = l.parentId && (warehouseIds.has(String(l.parentId)) || zoneIds.has(String(l.parentId)));
                const matchesCode = Array.from(warehouseCodes).some(wc => l.code.startsWith(wc + '-')) || Array.from(zoneCodes).some(zc => l.code.startsWith(zc + '-'));
                return !matchesParentId && !matchesCode;
              });

              if (standaloneZones.length === 0 && standaloneShelves.length === 0) return null;

              return (
                <div className="card bg-amber-50/60 border border-amber-200 rounded-2xl p-5 space-y-3 shadow-sm">
                  <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs uppercase tracking-wider">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span>Unassigned / Standalone Locations ({standaloneZones.length + standaloneShelves.length})</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {standaloneZones.map(z => (
                      <div key={z.id} className="bg-white p-3 rounded-xl border border-amber-200 text-xs font-bold flex justify-between items-center">
                        <span>{z.name} ({z.code})</span>
                        <div className="flex items-center gap-1.5">
                          <span className="badge badge-purple">Zone</span>
                          <button
                            onClick={() => handleDeleteLocation(z)}
                            className="p-1 text-slate-400 hover:text-red-600 transition cursor-pointer"
                            title="Delete Location"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {standaloneShelves.map(s => (
                      <div key={s.id} className="bg-white p-3 rounded-xl border border-amber-200 text-xs font-bold flex justify-between items-center">
                        <span>{s.name} ({s.code})</span>
                        <div className="flex items-center gap-1.5">
                          <span className="badge badge-blue">Shelf / Rack</span>
                          <button
                            onClick={() => handleDeleteLocation(s)}
                            className="p-1 text-slate-400 hover:text-red-600 transition cursor-pointer"
                            title="Delete Location"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── View 3: Stock Transfer Logs ───────────────────────────────── */}
        {activeViewTab === 'transfer-history' && (
          <div className="card bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="vyapar-table">
                <thead>
                  <tr>
                    <th className="w-12 text-center">#</th>
                    <th>Ref #</th>
                    <th>Transfer Date</th>
                    <th>Item Name</th>
                    <th>Source Location</th>
                    <th>Destination Location</th>
                    <th className="text-right">Transferred Qty</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const tenantTransfers = (stockTransfers || []).filter(st => (st.tenantId || 'default-tenant') === activeTenantId || !st.tenantId);
                    if (tenantTransfers.length === 0) {
                      return (
                        <tr>
                          <td colSpan={8} className="text-center py-12 text-slate-400 font-medium">
                            No inter-location stock transfers recorded yet.
                          </td>
                        </tr>
                      );
                    }
                    return tenantTransfers.map((trf, idx) => {
                      const item = items.find(i => Number(i.id) === Number(trf.itemId));
                      const srcLoc = locationMap.get(Number(trf.sourceLocationId));
                      const destLoc = locationMap.get(Number(trf.destinationLocationId));

                      const srcLocInfo = getLocationFullPath(trf.sourceLocationId);
                      const destLocInfo = getLocationFullPath(trf.destinationLocationId);

                      const srcName = srcLoc ? `${srcLoc.name} (${srcLoc.code})` : (srcLocInfo.shelf !== 'Unassigned' ? srcLocInfo.shelf : '📦 Unallocated Warehouse Reserve');
                      const destName = destLoc ? (destLoc.isStoreFront || destLoc.code?.includes('SF') || destLoc.name?.toLowerCase().includes('store front') ? '🛒 Store Front Stock' : destLoc.name) : (destLocInfo.shelf !== 'Unassigned' ? destLocInfo.shelf : '🛒 Store Front Stock');

                      return (
                        <tr key={trf.id || idx}>
                          <td className="font-mono text-xs font-bold text-slate-400 text-center">{idx + 1}</td>
                          <td className="font-mono text-xs font-bold text-slate-800">{trf.transferNumber}</td>
                          <td className="text-xs text-slate-600">{trf.transferDate}</td>
                          <td className="font-bold text-slate-800">{item?.name || `Item #${trf.itemId}`}</td>
                          <td>
                            <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-extrabold font-mono">{srcName}</span>
                          </td>
                          <td>
                            <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-extrabold font-mono">{destName}</span>
                          </td>
                          <td className="text-right font-black text-purple-700 text-xs font-mono">
                            {trf.quantity} PCS
                          </td>
                          <td className="text-xs text-slate-500">{trf.notes || '-'}</td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── View 4: Store Replenishment Manager ─────────────────────── */}
        {activeViewTab === 'replenishment' && (() => {
          const whLocs = locations.filter(l => l.type === 'WAREHOUSE');

          const replenishmentRows = items.map(item => {
            const itemMaps = itemLocations.filter(il => (il.tenantId || 'default-tenant') === tenantId && Number(il.itemId) === Number(item.id));
            const whStock = itemMaps.filter(il => whLocs.some(w => Number(w.id) === Number(il.locationId))).reduce((sum, il) => sum + il.quantity, 0);
            const storeStock = itemMaps.filter(il => !whLocs.some(w => Number(w.id) === Number(il.locationId))).reduce((sum, il) => sum + il.quantity, 0);
            const whMapping = itemMaps.find(il => whLocs.some(w => Number(w.id) === Number(il.locationId)));
            const storeMapping = itemMaps.find(il => !whLocs.some(w => Number(w.id) === Number(il.locationId)));

            return {
              item,
              whStock,
              storeStock,
              whMapping,
              storeMapping,
              needsRestock: whStock > 0 && storeStock <= 5
            };
          }).filter(r => r.needsRestock || r.whStock > 0);

          return (
            <div className="card bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-extrabold">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-800">Warehouse → Store Front Replenishment Dashboard</h3>
                    <p className="text-xs text-slate-500 font-medium">Detect store front low stock and restock shelves directly from Central Warehouse bulk reserves</p>
                  </div>
                </div>

                {/* Linked Central Warehouse Hub & Batch Restock */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleBatchRestockAllLowItems}
                    className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 font-extrabold text-xs text-white shadow-md shadow-purple-200 cursor-pointer flex items-center gap-1.5"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Batch Restock All Low Store Items</span>
                  </button>

                  <div className="flex items-center gap-2 bg-purple-50 p-2 rounded-xl border border-purple-200 text-xs">
                    <span className="font-bold text-slate-600">Linked Supply Hub:</span>
                    <select
                      value={primaryWarehouseId || ''}
                      onChange={e => handleSetPrimaryWarehouse(Number(e.target.value))}
                      className="bg-white border border-purple-300 rounded-lg px-2 py-1 font-bold text-purple-900 outline-none"
                    >
                      <option value="">Select Primary Warehouse...</option>
                      {whLocs.map(w => (
                        <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="vyapar-table">
                  <thead>
                    <tr>
                      <th className="w-12 text-center">#</th>
                      <th>Product / SKU</th>
                      <th className="text-center">Store Front Stock</th>
                      <th className="text-center">Central Warehouse Reserve</th>
                      <th className="text-center">Restock Status</th>
                      <th className="text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {replenishmentRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-10 text-slate-400 font-medium">
                          🎉 All store front shelves are fully stocked! No replenishment needed at this time.
                        </td>
                      </tr>
                    ) : (
                      replenishmentRows.map((row, idx) => (
                        <tr key={row.item.id}>
                          <td className="font-mono text-xs font-bold text-slate-400 text-center">{idx + 1}</td>
                          <td>
                            <div className="font-bold text-slate-800">{row.item.name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">SKU: {row.item.skuCode}</div>
                          </td>
                          <td className="text-center">
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-black ${row.storeStock <= 0 ? 'bg-red-100 text-red-700' : row.storeStock <= 5 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                              }`}>
                              {row.storeStock} {row.item.unitType}
                            </span>
                          </td>
                          <td className="text-center">
                            <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-800 text-xs font-black border border-purple-200">
                              {row.whStock} {row.item.unitType} Available
                            </span>
                          </td>
                          <td className="text-center">
                            {row.storeStock <= 0 ? (
                              <span className="badge badge-red font-black">🛑 OUT OF STORE STOCK</span>
                            ) : row.storeStock <= 5 ? (
                              <span className="badge badge-amber font-black">⚠️ LOW STORE STOCK</span>
                            ) : (
                              <span className="badge badge-emerald font-black">✓ SUFFICIENT</span>
                            )}
                          </td>
                          <td className="text-center">
                            <button
                              onClick={() => {
                                const srcLocId = row.whMapping ? String(row.whMapping.locationId) : primaryWarehouseId ? String(primaryWarehouseId) : '';
                                const destLocId = row.storeMapping ? String(row.storeMapping.locationId) : '';
                                setTransferItemId(String(row.item.id));
                                setTransferSourceLocId(srcLocId);
                                setTransferDestLocId(destLocId);
                                setTransferQty(String(Math.min(row.whStock, 20)));
                                setIsTransferModalOpen(true);
                              }}
                              disabled={row.whStock <= 0}
                              className={`px-3 py-1.5 rounded-xl font-extrabold text-xs transition flex items-center justify-center gap-1.5 mx-auto ${row.whStock > 0
                                  ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm cursor-pointer'
                                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                                }`}
                            >
                              <ArrowLeftRight className="w-3.5 h-3.5" />
                              <span>Restock Store Front</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* ── View 5: Store Branch & Warehouse Access Manager ─────────────── */}
        {activeViewTab === 'store-connections' && (
          <div className="space-y-6">
            <div className="card bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-extrabold shadow-sm">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900">🏬 Store Branch & Warehouse Access Manager</h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Configure which store branches have access to replenish from each warehouse. Only the store branch that created the warehouse can manage access permissions.
                    </p>
                  </div>
                </div>
              </div>

              {/* Warehouses Linkage Configuration Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-extrabold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Warehouse Name & Code</th>
                      <th className="py-3 px-4">Creator / Owner Store</th>
                      <th className="py-3 px-4">Global Access (All Stores)</th>
                      <th className="py-3 px-4">Store Branches with Access</th>
                      <th className="py-3 px-4 text-center">Permission Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {tenantLocations.filter(l => l.type === 'WAREHOUSE').length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-slate-400 text-xs">
                          No warehouses created yet for this store workspace. Click "+ Add Location" to create your first warehouse.
                        </td>
                      </tr>
                    ) : (
                      tenantLocations.filter(l => l.type === 'WAREHOUSE').map(wh => {
                        const isOwner = (wh.tenantId || 'default-tenant') === activeTenantId;
                        const isGlobalShared = !!wh.isShared;
                        const linkedTenantIds = wh.allowedTenantIds || [];
                        const ownerProfile = storeProfiles.find(p => p.tenantId === wh.tenantId);
                        const ownerStoreName = ownerProfile?.name || wh.tenantId || 'Primary Store';

                        return (
                          <tr key={wh.id} className="hover:bg-slate-50/80 transition">
                            {/* Warehouse Details */}
                            <td className="py-3.5 px-4">
                              <div className="font-extrabold text-slate-900 flex items-center gap-2">
                                <Warehouse className="w-4 h-4 text-blue-600 shrink-0" />
                                <span>{wh.name}</span>
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                CODE: {wh.code} | Cap: {wh.capacity || 0} PCS
                              </div>
                            </td>

                            {/* Creator / Owner Store */}
                            <td className="py-3.5 px-4">
                              {isOwner ? (
                                <span className="text-purple-700 font-extrabold bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200/80 inline-flex items-center gap-1.5 text-xs">
                                  <span>★ Active Store ({business?.name || 'Current Store'})</span>
                                </span>
                              ) : (
                                <span className="text-slate-700 font-bold bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 inline-flex items-center gap-1.5 text-xs">
                                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                                  <span>{ownerStoreName}</span>
                                </span>
                              )}
                            </td>

                            {/* Global Shared Toggle Switch */}
                            <td className="py-3.5 px-4">
                              <button
                                disabled={!isOwner}
                                onClick={() => isOwner && handleToggleGlobalShared(wh.id!, isGlobalShared)}
                                className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold transition border flex items-center gap-1.5 ${!isOwner
                                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                    : isGlobalShared
                                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs cursor-pointer'
                                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50 cursor-pointer'
                                  }`}
                                title={!isOwner ? `Only the creator store (${ownerStoreName}) can change global access` : 'Toggle global sharing across all stores'}
                              >
                                {isGlobalShared ? '✓ Global Access (All Stores)' : '○ Restrict to Specific Stores'}
                              </button>
                            </td>

                            {/* Linked Store Branches Access Checkboxes */}
                            <td className="py-3.5 px-4">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {storeProfiles.map(profile => {
                                  const isCreator = profile.tenantId === wh.tenantId;
                                  const isGranted = isCreator || isGlobalShared || linkedTenantIds.includes(profile.tenantId);

                                  return (
                                    <button
                                      key={profile.tenantId}
                                      disabled={!isOwner || isCreator}
                                      onClick={() => isOwner && !isCreator && handleToggleStoreLink(wh.id!, profile.tenantId)}
                                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition flex items-center gap-1 ${!isOwner || isCreator
                                          ? 'cursor-not-allowed opacity-90'
                                          : 'cursor-pointer'
                                        } ${isGranted
                                          ? 'bg-purple-50 text-purple-700 border-purple-200 font-extrabold'
                                          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                        }`}
                                      title={!isOwner ? `Only the creator store (${ownerStoreName}) can grant or revoke store access` : `Toggle access for ${profile.name}`}
                                    >
                                      <span>{isGranted ? '☑' : '☐'}</span>
                                      <span>{profile.name}</span>
                                      {isCreator && <span className="text-[10px] text-purple-500 font-normal">(Owner)</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            </td>

                            {/* Permission Status */}
                            <td className="py-3.5 px-4 text-center">
                              {isOwner ? (
                                <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 text-xs font-extrabold inline-flex items-center gap-1">
                                  <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Full Control (Owner)</span>
                                </span>
                              ) : (
                                <span className="text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold inline-flex items-center gap-1" title={`Access permissions managed by owner store (${ownerStoreName})`}>
                                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                                  <span>Read-Only Access</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── Modal 1: Add Location Master Modal ────────────────────────────── */}
      {isAddLocationOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Plus className="w-5 h-5 text-purple-600 stroke-[2.5]" />
                Create Location Master
              </h2>
              <button onClick={() => setIsAddLocationOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLocation} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Location Type *</label>
                <select
                  value={locType}
                  onChange={e => {
                    const newType = e.target.value as LocationType;
                    setLocType(newType);
                    setLocParentId('');
                    if (newType === 'WAREHOUSE') {
                      setLocCapacity('500');
                    } else {
                      setLocCapacity('');
                    }
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-bold text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                >
                  <option value="WAREHOUSE">Warehouse / Branch</option>
                  <option value="ZONE">Zone / Aisle</option>
                  <option value="SHELF">Rack / Shelf / Bin</option>
                </select>
              </div>

              {locType !== 'WAREHOUSE' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Parent Location *</label>
                  <select
                    required
                    value={locParentId}
                    onChange={e => setLocParentId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-bold text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                  >
                    <option value="">Select Parent Location...</option>
                    {tenantLocations
                      .filter(l => locType === 'ZONE' ? l.type === 'WAREHOUSE' : l.type === 'ZONE')
                      .map(l => (
                        <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
                      ))}
                    {tenantLocations.filter(l => locType === 'ZONE' ? l.type === 'WAREHOUSE' : l.type === 'ZONE').length === 0 && (
                      <option value="" disabled>
                        {locType === 'ZONE'
                          ? 'No parent warehouses created yet for this store profile. Please create a Warehouse first.'
                          : 'No parent zones created yet for this store profile. Please create a Zone first.'}
                      </option>
                    )}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Location Name *</label>
                  <input
                    required
                    type="text"
                    value={locName}
                    onChange={e => setLocName(e.target.value)}
                    placeholder="e.g. Godown A"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-bold text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Location Code *</label>
                  <input
                    required
                    type="text"
                    value={locCode}
                    onChange={e => setLocCode(e.target.value)}
                    placeholder="e.g. GD-A"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-bold text-xs focus:ring-2 focus:ring-purple-500 outline-none uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Storage Capacity (Units)</label>
                {(() => {
                  const enteredCap = Number(locCapacity) || 0;
                  const availableCap = parentCapacityStats?.availableCap ?? 0;
                  const isExceeded = parentCapacityStats ? enteredCap > availableCap : false;

                  return (
                    <>
                      <input
                        type="number"
                        value={locCapacity}
                        onChange={e => setLocCapacity(e.target.value)}
                        placeholder={locType === 'WAREHOUSE' ? '500' : 'Enter capacity...'}
                        className={`w-full px-3 py-2.5 rounded-xl border font-bold text-xs focus:ring-2 outline-none ${parentCapacityStats && isExceeded
                            ? 'border-red-500 text-red-700 focus:ring-red-500 bg-red-50/30'
                            : 'border-slate-300 focus:ring-purple-500'
                          }`}
                      />
                      {locType === 'WAREHOUSE' && (
                        <p className="text-[11px] text-slate-400 font-medium mt-1">
                          Standard Warehouse capacity: 500 units
                        </p>
                      )}
                      {locType !== 'WAREHOUSE' && parentCapacityStats && (() => {
                        const { parent, parentCap, usedCap, availableCap, childCount } = parentCapacityStats;
                        const childTypeLabel = locType === 'ZONE' ? 'zone' : 'rack';
                        const childTypePlural = locType === 'ZONE' ? 'zones' : 'racks';
                        const usedPercent = parentCap > 0 ? Math.min(100, Math.round((usedCap / parentCap) * 100)) : 0;

                        return (
                          <div className={`mt-2 p-2.5 rounded-xl border text-xs space-y-1.5 transition-all ${isExceeded
                              ? 'bg-red-50/80 border-red-200 text-red-700'
                              : 'bg-purple-50/50 border-purple-100 text-slate-700'
                            }`}>
                            <div className="flex items-center justify-between font-bold">
                              <span className="truncate max-w-[200px]">{parent.name} Capacity Breakdown</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-black shrink-0 ${isExceeded ? 'bg-red-200 text-red-800' : 'bg-emerald-100 text-emerald-800'
                                }`}>
                                {isExceeded ? 'Space Exceeded' : `${availableCap} units left`}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-1 text-[11px] font-medium pt-0.5">
                              <div>
                                <span className="text-slate-400 block text-[10px]">TOTAL LIMIT</span>
                                <span className="font-bold text-slate-800">{parentCap} PCS</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px]">USED ({childCount} {childTypePlural})</span>
                                <span className="font-bold text-amber-700">{usedCap} PCS</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px]">SPACE LEFT</span>
                                <span className={`font-bold ${availableCap > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {availableCap} PCS
                                </span>
                              </div>
                            </div>

                            {/* Progress bar visual */}
                            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden flex mt-1">
                              <div
                                style={{ width: `${usedPercent}%` }}
                                className="bg-purple-500 h-full transition-all duration-300"
                                title={`Used by existing ${childTypePlural}: ${usedCap} units`}
                              />
                              {enteredCap > 0 && (
                                <div
                                  style={{
                                    width: `${Math.max(0, Math.min(100 - usedPercent, parentCap > 0 ? Math.round((enteredCap / parentCap) * 100) : 0))}%`
                                  }}
                                  className={`h-full transition-all duration-300 ${isExceeded ? 'bg-red-500' : 'bg-emerald-500'}`}
                                  title={`New ${childTypeLabel}: ${enteredCap} units`}
                                />
                              )}
                            </div>

                            {isExceeded && (
                              <p className="text-[11px] font-bold text-red-600 flex items-center gap-1 pt-0.5">
                                <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                <span>Cannot allocate {enteredCap} units. Only {availableCap} units space remaining in {parent.name}!</span>
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </>
                  );
                })()}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Description</label>
                <input
                  type="text"
                  value={locDescription}
                  onChange={e => setLocDescription(e.target.value)}
                  placeholder="Optional notes..."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-medium text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddLocationOpen(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-300 font-bold text-xs text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 font-extrabold text-xs text-white shadow-md shadow-purple-200 cursor-pointer"
                >
                  Save Location
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal 2: Stock Transfer Modal ───────────────────────────────── */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-purple-600 stroke-[2.5]" />
                Inter-Location Stock Transfer
              </h2>
              <button onClick={() => setIsTransferModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteTransfer} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Search & Select Item / Product *</label>

                {/* Searchable Autocomplete Picker */}
                <div ref={searchContainerRef} className="relative">
                  <div className="relative">
                    <Search className="w-4 h-4 text-purple-600 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      value={itemSearchQuery}
                      onFocus={() => setIsSearchDropdownOpen(true)}
                      onChange={e => {
                        setItemSearchQuery(e.target.value);
                        setIsSearchDropdownOpen(true);
                      }}
                      placeholder="Type item name, SKU code, or barcode..."
                      className="w-full pl-10 pr-9 py-2.5 bg-purple-50/50 border border-purple-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                    {itemSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setItemSearchQuery('');
                          setTransferItemId('');
                          setTransferSourceLocId('');
                          setIsSearchDropdownOpen(true);
                        }}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Autocomplete Dropdown List */}
                  {isSearchDropdownOpen && (
                    <div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto bg-white border border-purple-200 rounded-xl shadow-xl space-y-1 p-1">
                      {filteredTransferItems.length === 0 ? (
                        <div className="p-3 text-xs text-slate-400 font-medium text-center">
                          No matching inventory items found.
                        </div>
                      ) : (
                        filteredTransferItems.map(item => {
                          const isSelected = String(item.id) === transferItemId;
                          const mapping = itemLocations.find(il => Number(il.itemId) === Number(item.id) && il.quantity > 0);
                          const sourceLoc = mapping ? locationMap.get(mapping.locationId) : null;

                          return (
                            <div
                              key={item.id}
                              onClick={() => handleChooseItemFromSearch(item)}
                              className={`p-2.5 rounded-lg text-xs cursor-pointer transition flex items-center justify-between ${isSelected ? 'bg-purple-100/70 border border-purple-300' : 'hover:bg-purple-50'
                                }`}
                            >
                              <div>
                                <div className="font-bold text-slate-800">{item.name}</div>
                                <div className="text-[11px] text-slate-400 font-mono">
                                  SKU: {item.skuCode} | Barcode: {item.barcode}
                                </div>
                                {sourceLoc && (
                                  <div className="text-[10.5px] text-purple-700 font-bold mt-0.5 flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-purple-600" />
                                    <span>{sourceLoc.name} ({mapping?.quantity} PCS available)</span>
                                  </div>
                                )}
                              </div>
                              <span className="badge badge-blue shrink-0 ml-2">
                                {item.currentStock} {item.unitType}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Source Location * {transferSourceLocId && <span className="text-[10px] text-emerald-600 lowercase font-extrabold">(Auto-fetched)</span>}
                  </label>
                  <select
                    required
                    value={transferSourceLocId}
                    onChange={e => setTransferSourceLocId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-purple-300 bg-purple-50/30 font-bold text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                  >
                    <option value="">From Location...</option>
                    {tenantLocations.map(l => {
                      const qtyAtLoc = itemLocations.find(il => il.itemId === Number(transferItemId) && il.locationId === l.id)?.quantity || 0;
                      return (
                        <option key={l.id} value={l.id}>
                          {l.name} ({l.code}) {transferItemId ? `— Avail: ${qtyAtLoc} PCS` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Destination Location *</label>
                  <select
                    required
                    value={transferDestLocId}
                    onChange={e => setTransferDestLocId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-bold text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                  >
                    <option value="">To Location...</option>
                    {tenantLocations.map(l => (
                      <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Transfer Quantity *</label>
                <input
                  required
                  type="number"
                  min="1"
                  value={transferQty}
                  onChange={e => setTransferQty(e.target.value)}
                  placeholder="1"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-bold text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Notes / Reference</label>
                <input
                  type="text"
                  value={transferNotes}
                  onChange={e => setTransferNotes(e.target.value)}
                  placeholder="e.g. Internal stock restock"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-medium text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-300 font-bold text-xs text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 font-extrabold text-xs text-white shadow-md shadow-purple-200 cursor-pointer"
                >
                  Execute Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal 3: Relocate / Assign Item Modal ───────────────────────── */}
      {relocateItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-purple-600 stroke-[2.5]" />
                Relocate / Assign Item
              </h2>
              <button onClick={() => setRelocateItem(null)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRelocation} className="space-y-4">
              <div className="bg-purple-50 p-3.5 rounded-xl border border-purple-100 flex items-center justify-between">
                <div>
                  <div className="font-extrabold text-sm text-purple-900">{relocateItem.item.name}</div>
                  <div className="text-xs text-purple-700 font-mono mt-0.5">
                    SKU: {relocateItem.item.skuCode} | Total Stock: {relocateItem.item.currentStock} {relocateItem.item.unitType}
                  </div>
                </div>
                {(() => {
                  const unallocated = getItemUnallocatedStock(relocateItem.item, relocateItem.currentMapping?.id);
                  return (
                    <span className="badge badge-amber font-extrabold shrink-0">
                      📦 {unallocated} {relocateItem.item.unitType} Unallocated
                    </span>
                  );
                })()}
              </div>

              {(() => {
                const selectedWhObj = locations.find(l => String(l.id) === String(relocateWhId) || (l.code && l.code === relocateWhId));
                const selectedZoneObj = locations.find(l => String(l.id) === String(relocateZoneId) || (l.code && l.code === relocateZoneId));

                const availableZones = selectedWhObj
                  ? locations.filter(l =>
                    l.type === 'ZONE' &&
                    (String(l.parentId) === String(selectedWhObj.id) || (selectedWhObj.code && l.code.startsWith(selectedWhObj.code + '-')))
                  )
                  : [];

                const availableRacks = selectedZoneObj
                  ? locations.filter(l =>
                    l.type === 'SHELF' &&
                    (String(l.parentId) === String(selectedZoneObj.id) || (selectedZoneObj.code && l.code.startsWith(selectedZoneObj.code + '-')))
                  )
                  : selectedWhObj
                    ? locations.filter(l =>
                      l.type === 'SHELF' &&
                      (String(l.parentId) === String(selectedWhObj.id) || (selectedWhObj.code && l.code.startsWith(selectedWhObj.code + '-')))
                    )
                    : [];

                const isCapacityExceeded = Number(relocateQty) > Number(relocateMaxCap);

                return (
                  <>
                    {/* 1. Warehouse Selection */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">1. Select Warehouse / Store Branch *</label>
                      <select
                        required
                        value={relocateWhId}
                        onChange={e => {
                          const whId = e.target.value;
                          setRelocateWhId(whId);
                          setRelocateZoneId('');
                          setRelocateRackId('');
                          setRelocateDestLocId(whId);
                          updateCapacityDefaults(whId);
                        }}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-bold text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                      >
                        <option value="">Select Warehouse...</option>
                        {tenantLocations.filter(l => l.type === 'WAREHOUSE').length > 0 ? (
                          tenantLocations.filter(l => l.type === 'WAREHOUSE').map(wh => (
                            <option key={wh.id} value={wh.id}>{wh.name} ({wh.code})</option>
                          ))
                        ) : (
                          <option value="" disabled>No warehouse created for this store branch yet</option>
                        )}
                      </select>
                    </div>

                    {/* 2. Zone Selection */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">2. Select Zone / Aisle *</label>
                      <select
                        disabled={!relocateWhId}
                        value={relocateZoneId}
                        onChange={e => {
                          const zId = e.target.value;
                          setRelocateZoneId(zId);
                          setRelocateRackId('');
                          const activeId = zId || relocateWhId;
                          setRelocateDestLocId(activeId);
                          updateCapacityDefaults(activeId);
                        }}
                        className={`w-full px-3 py-2.5 rounded-xl border font-bold text-xs focus:ring-2 focus:ring-purple-500 outline-none ${!relocateWhId ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'border-slate-300'
                          }`}
                      >
                        <option value="">
                          {!relocateWhId ? 'Select Warehouse first...' : availableZones.length === 0 ? 'No Zones in this Warehouse (Pick Direct Rack below)' : 'Select Zone / Aisle...'}
                        </option>
                        {availableZones.map(z => {
                          const capInfo = getLocCapacityInfo(z);
                          return (
                            <option key={z.id} value={z.id} disabled={capInfo.isFull}>
                              {capInfo.isFull ? '🛑 [FULL] ' : ''}{z.name} ({z.code}) — {capInfo.isFull ? 'FULL (0 Available)' : `Cap: ${z.capacity} (${capInfo.remaining} Available)`}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* 3. Rack / Shelf Selection */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">3. Select Rack / Shelf / Bin *</label>
                      <select
                        disabled={!relocateWhId}
                        value={relocateRackId}
                        onChange={e => {
                          const rId = e.target.value;
                          setRelocateRackId(rId);
                          const activeId = rId || relocateZoneId || relocateWhId;
                          setRelocateDestLocId(activeId);
                          updateCapacityDefaults(activeId);
                        }}
                        className={`w-full px-3 py-2.5 rounded-xl border font-bold text-xs focus:ring-2 focus:ring-purple-500 outline-none ${!relocateWhId ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'border-slate-300'
                          }`}
                      >
                        <option value="">
                          {!relocateWhId ? 'Select Warehouse first...' : availableRacks.length === 0 ? 'No Racks in this Zone' : 'Select Rack / Shelf / Bin...'}
                        </option>
                        {availableRacks.map(r => {
                          const capInfo = getLocCapacityInfo(r);
                          return (
                            <option key={r.id} value={r.id} disabled={capInfo.isFull}>
                              {capInfo.isFull ? '🛑 [FULL] ' : ''}{r.name} ({r.code}) — {capInfo.isFull ? 'FULL (0 Available)' : `Cap: ${r.capacity} (${capInfo.remaining} Available)`}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* Selected Target Path Summary */}
                    {relocateDestLocId && (() => {
                      const fullInfo = getLocationFullPath(relocateDestLocId);
                      return (
                        <div className="bg-purple-50 p-2.5 rounded-xl border border-purple-200/80 text-xs flex items-center justify-between font-bold">
                          <span className="text-slate-500 font-medium">Selected Location:</span>
                          <span className="text-purple-800 font-extrabold flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-purple-600" />
                            {fullInfo.fullPath}
                          </span>
                        </div>
                      );
                    })()}

                    {(() => {
                      const unallocated = getItemUnallocatedStock(relocateItem.item, relocateItem.currentMapping?.id);
                      const maxAllowedStock = relocateItem.currentMapping ? (relocateItem.currentMapping.quantity + unallocated) : unallocated;
                      const isStockExceeded = Number(relocateQty) > maxAllowedStock;

                      return (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                              Quantity at Shelf * {unallocated > 0 && <span className="text-amber-600 lowercase font-extrabold">({unallocated} unallocated)</span>}
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={relocateQty}
                              onChange={e => setRelocateQty(e.target.value)}
                              placeholder={String(unallocated || '1')}
                              className={`w-full px-3 py-2.5 rounded-xl border font-bold text-xs outline-none focus:ring-2 ${
                                isCapacityExceeded || isStockExceeded ? 'border-red-500 text-red-700 bg-red-50 focus:ring-red-500' : 'border-slate-300 focus:ring-purple-500'
                              }`}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Available Capacity</label>
                            <input
                              type="number"
                              value={relocateMaxCap}
                              onChange={e => setRelocateMaxCap(e.target.value)}
                              placeholder="10"
                              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-bold text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                            />
                          </div>

                          {isCapacityExceeded && (
                            <div className="col-span-2 bg-red-50 p-2.5 rounded-xl border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
                              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                              <span>Quantity ({relocateQty} PCS) exceeds Available Capacity ({relocateMaxCap} PCS)!</span>
                            </div>
                          )}

                          {isStockExceeded && (
                            <div className="col-span-2 bg-red-50 p-2.5 rounded-xl border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
                              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                              <span>Quantity ({relocateQty} PCS) exceeds remaining unallocated stock ({maxAllowedStock} PCS)!</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </>
                );
              })()}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRelocateItem(null)}
                  className="flex-1 py-3 rounded-xl border border-slate-300 font-bold text-xs text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 font-extrabold text-xs text-white shadow-md shadow-purple-200 cursor-pointer"
                >
                  Save Placement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal 5: Enlarged Product Detail Preview Modal ──────────────── */}
      {previewItemDetail && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  <Package className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">{previewItemDetail.item.name}</h2>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 font-mono font-medium">
                    <span>SKU: {previewItemDetail.item.skuCode}</span>
                    {previewItemDetail.item.barcode && <span>• Barcode: {previewItemDetail.item.barcode}</span>}
                  </div>
                </div>
              </div>
              <button onClick={() => setPreviewItemDetail(null)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Selected Placement Card */}
            {previewItemDetail.locationId && (() => {
              const locInfo = getLocationFullPath(previewItemDetail.locationId);
              return (
                <div className="bg-gradient-to-r from-purple-50 via-purple-50/50 to-indigo-50/50 p-4 rounded-xl border border-purple-200/80 space-y-2">
                  <div className="text-[11px] font-black uppercase tracking-wider text-purple-700">Current Shelf Placement</div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-purple-600" />
                      <span className="font-extrabold text-xs text-slate-800">{locInfo.fullPath}</span>
                    </div>
                    <span className="badge badge-purple text-xs px-2.5 py-1 font-black">
                      {previewItemDetail.quantity} {previewItemDetail.item.unitType}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Product Overview Grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block mb-1">Total Stock</span>
                <span className="text-sm font-black text-slate-800">{previewItemDetail.item.currentStock} {previewItemDetail.item.unitType}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block mb-1">Sales Price</span>
                <span className="text-sm font-black text-emerald-700">Rs {previewItemDetail.item.salesPrice}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block mb-1">Purchase Price</span>
                <span className="text-sm font-black text-slate-700">Rs {previewItemDetail.item.purchasePrice || 0}</span>
              </div>
            </div>

            {/* All Mapped Locations Breakdown for this Item */}
            {(() => {
              const allItemMappings = itemLocationMapByItemId.get(previewItemDetail.item.id!) || [];
              const validMappings = allItemMappings.filter(m => m.quantity > 0);

              return (
                <div className="space-y-2">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                    Store Locations Breakdown ({validMappings.length} Placements)
                  </div>
                  {validMappings.length === 0 ? (
                    <div className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl border border-slate-200">
                      Unassigned General Stock: {previewItemDetail.item.currentStock} {previewItemDetail.item.unitType}
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {validMappings.map((m, idx) => {
                        const info = getLocationFullPath(m.locationId);
                        const isCurrent = Number(m.locationId) === Number(previewItemDetail.locationId);
                        return (
                          <div
                            key={idx}
                            className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold ${isCurrent ? 'bg-purple-50 border-purple-300 ring-1 ring-purple-300' : 'bg-slate-50 border-slate-200'
                              }`}
                          >
                            <span className="flex items-center gap-1.5 text-slate-700">
                              <MapPin className="w-3.5 h-3.5 text-purple-600" />
                              {info.fullPath}
                            </span>
                            <span className="font-mono text-purple-900 bg-white px-2 py-0.5 rounded border border-slate-200 font-extrabold">
                              {m.quantity} {previewItemDetail.item.unitType}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  const targetItem = previewItemDetail.item;
                  const targetMapping = previewItemDetail.mapping;
                  setPreviewItemDetail(null);
                  handleOpenRelocateModal(targetItem, targetMapping);
                }}
                className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 font-extrabold text-xs text-white shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Relocate Placement</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewItemDetail(null)}
                className="py-2.5 px-5 rounded-xl border border-slate-300 font-bold text-xs text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 4: Store Layout Template Generator Modal ───────────────── */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-xl w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <Wand2 className="w-5 h-5 text-amber-600 stroke-[2.5]" />
                  Store Layout Generator & Template
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Generate an entire store hierarchy (Warehouse → Zones → Racks) automatically in one click.
                </p>
              </div>
              <button onClick={() => setIsTemplateModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGenerateStore} className="space-y-5">
              {/* Presets Picker */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Select Template Preset</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { id: 'RETAIL', title: 'Standard Retail', desc: '1 WH, 3 Zones, 3 Racks/Zone' },
                    { id: 'SUPERMARKET', title: 'Supermarket', desc: '1 WH, 4 Zones, 4 Racks/Zone' },
                    { id: 'BOUTIQUE', title: 'Boutique / Shop', desc: '1 WH, 2 Zones, 2 Racks/Zone' },
                    { id: 'CUSTOM', title: 'Custom Setup', desc: 'Custom Zone & Rack counts' }
                  ].map(p => {
                    const isSelected = presetTemplate === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSelectPreset(p.id as any)}
                        className={`p-3 rounded-xl border cursor-pointer transition flex flex-col justify-between ${isSelected
                            ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-400/40 shadow-sm'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`font-extrabold text-xs ${isSelected ? 'text-amber-900' : 'text-slate-800'}`}>
                            {p.title}
                          </span>
                          {isSelected && <Check className="w-4 h-4 text-amber-600" />}
                        </div>
                        <span className="text-[11px] text-slate-500 mt-1 font-medium">{p.desc}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Form Config Fields */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Warehouse Name *</label>
                    <input
                      required
                      type="text"
                      value={whName}
                      onChange={e => {
                        setWhName(e.target.value);
                        setPresetTemplate('CUSTOM');
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-xs bg-white outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Code *</label>
                    <input
                      required
                      type="text"
                      value={whCode}
                      onChange={e => {
                        setWhCode(e.target.value);
                        setPresetTemplate('CUSTOM');
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-xs bg-white uppercase outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Warehouse Capacity</label>
                    <input
                      type="number"
                      min="1"
                      value={whCapacity}
                      onChange={e => {
                        setWhCapacity(Number(e.target.value) || 0);
                        setPresetTemplate('CUSTOM');
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-xs bg-white outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Number of Zones</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={zoneCount}
                      onChange={e => {
                        setZoneCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)));
                        setPresetTemplate('CUSTOM');
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-xs bg-white outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Capacity per Zone</label>
                    <input
                      type="number"
                      min="1"
                      value={zoneCapacity}
                      onChange={e => {
                        setZoneCapacity(Number(e.target.value) || 0);
                        setPresetTemplate('CUSTOM');
                      }}
                      className={`w-full px-3 py-2 rounded-xl border font-bold text-xs bg-white outline-none focus:ring-2 ${isZoneCapExceeded ? 'border-red-500 text-red-700 focus:ring-red-500 bg-red-50' : 'border-slate-300 focus:ring-amber-500'
                        }`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Racks per Zone</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={racksPerZone}
                      onChange={e => {
                        setRacksPerZone(Math.min(10, Math.max(1, Number(e.target.value) || 1)));
                        setPresetTemplate('CUSTOM');
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-xs bg-white outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Rack Capacity</label>
                    <input
                      type="number"
                      min="1"
                      value={rackCapacity}
                      onChange={e => {
                        setRackCapacity(Number(e.target.value) || 0);
                        setPresetTemplate('CUSTOM');
                      }}
                      className={`w-full px-3 py-2 rounded-xl border font-bold text-xs bg-white outline-none focus:ring-2 ${isRackCapExceeded ? 'border-red-500 text-red-700 focus:ring-red-500 bg-red-50' : 'border-slate-300 focus:ring-amber-500'
                        }`}
                    />
                  </div>
                </div>

                {/* Validation Warnings */}
                {isZoneCapExceeded && (
                  <p className="text-[11px] font-bold text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <span>Total Zones Capacity ({totalZoneCapAllocated} PCS) exceeds Warehouse Capacity ({whCapacity} PCS)!</span>
                  </p>
                )}

                {isRackCapExceeded && (
                  <p className="text-[11px] font-bold text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <span>Total Racks Capacity per Zone ({totalRackCapAllocatedPerZone} PCS) exceeds Zone Capacity ({zoneCapacity} PCS)!</span>
                  </p>
                )}
              </div>

              {/* Hierarchy Live Tree Preview */}
              <div className="bg-amber-50/50 p-3.5 rounded-xl border border-amber-200/70 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                  <span className="flex items-center gap-1.5">
                    <FolderTree className="w-4 h-4 text-amber-600" />
                    Layout Structure Preview
                  </span>
                  <span className="badge badge-blue">{totalLocationsToGenerate} Locations to be created</span>
                </div>

                <div className="bg-white p-3 rounded-lg border border-amber-200/50 space-y-2 text-xs">
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span className="flex items-center gap-1 text-blue-700">
                      <Warehouse className="w-3.5 h-3.5" />
                      {whName || 'Warehouse'} ({whCode || 'WH'})
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">Cap: {whCapacity} PCS</span>
                  </div>

                  <div className="pl-4 border-l-2 border-amber-200 space-y-2">
                    {Array.from({ length: Math.min(3, zoneCount) }).map((_, zIdx) => {
                      const letter = ['A', 'B', 'C', 'D'][zIdx] || `Z${zIdx + 1}`;
                      return (
                        <div key={zIdx} className="space-y-1">
                          <div className="flex items-center justify-between font-bold text-purple-700 text-[11px]">
                            <span>└─ Zone {letter} ({whCode || 'WH'}-Z{letter})</span>
                            <span className="font-mono text-[10px] text-slate-500">Cap: {zoneCapacity} PCS</span>
                          </div>
                          <div className="pl-4 text-[10.5px] text-slate-600 font-medium">
                            {racksPerZone > 0 ? (
                              <span>Racks ({racksPerZone} per zone): Rack {letter}-1 ... Rack {letter}-{racksPerZone} (Cap: {rackCapacity} PCS each)</span>
                            ) : (
                              <span className="text-slate-400 italic">No racks</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {zoneCount > 3 && (
                      <div className="text-[10.5px] text-amber-700 font-bold italic">
                        ... plus {zoneCount - 3} more Zones with {racksPerZone} racks each
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="px-6 py-3 rounded-xl border border-slate-300 font-bold text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition flex-none cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isZoneCapExceeded || isRackCapExceeded}
                  className={`flex-1 py-3 px-5 rounded-xl font-bold text-xs text-white shadow-md transition flex items-center justify-center gap-2 ${isZoneCapExceeded || isRackCapExceeded
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                      : 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 shadow-amber-500/20 active:scale-[0.99] cursor-pointer'
                    }`}
                >
                  <Wand2 className="w-4 h-4 shrink-0" />
                  <span className="whitespace-nowrap">Generate Entire Store Layout ({totalLocationsToGenerate} Locations)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
