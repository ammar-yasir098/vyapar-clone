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
  Sparkles
} from 'lucide-react';
import {
  Item,
  BusinessDetails,
  InventoryLocation,
  ItemLocationMapping,
  StockTransfer,
  LocationType
} from '../../types';
import { db } from '../../db';
import { saveServerLocation, saveServerItemLocation, createServerStockTransfer } from '../../services/api';
import { useToast } from '../Common/ToastContext';
import { seed100SampleItems } from '../../utils/sampleDataSeeder';

interface LocationScreenProps {
  items: Item[];
  locations: InventoryLocation[];
  itemLocations: ItemLocationMapping[];
  stockTransfers: StockTransfer[];
  business: BusinessDetails;
}

export const LocationScreen: React.FC<LocationScreenProps> = ({
  items,
  locations,
  itemLocations,
  stockTransfers,
  business
}) => {
  const { showToast } = useToast();

  const [activeViewTab, setActiveViewTab] = useState<'stock-table' | 'hierarchy-master' | 'transfer-history'>('stock-table');
  const [searchTerm, setSearchTerm] = useState('');
  const [barcodeSearch, setBarcodeSearch] = useState('');
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState<string>('ALL');
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false);

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

  // Relocate Form
  const [relocateDestLocId, setRelocateDestLocId] = useState<string>('');
  const [relocateQty, setRelocateQty] = useState<string>('1');
  const [relocateMaxCap, setRelocateMaxCap] = useState<string>('100');

  const tenantId = business.tenantId || 'default-tenant';
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

  // Filtered items list for transfer modal search
  const filteredTransferItems = useMemo(() => {
    if (!itemSearchQuery.trim()) return items;
    const q = itemSearchQuery.toLowerCase();
    return items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      i.skuCode.toLowerCase().includes(q) ||
      i.barcode.toLowerCase().includes(q)
    );
  }, [items, itemSearchQuery]);

  // Handle selecting an item from search dropdown
  const handleChooseItemFromSearch = (item: Item) => {
    if (!item.id) return;
    setTransferItemId(String(item.id));
    setItemSearchQuery(item.name);
    setIsSearchDropdownOpen(false);

    // Auto-fetch source location with stock > 0
    const itemMappings = itemLocations.filter(il => il.itemId === item.id && il.quantity > 0);
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
      const itemMappings = itemLocations.filter(il => il.itemId === item.id && il.quantity > 0);
      if (itemMappings.length > 0) {
        setTransferSourceLocId(String(itemMappings[0].locationId));
      } else {
        setTransferSourceLocId('');
      }
    }
  };

  // Open Relocate Modal for specific row
  const handleOpenRelocateModal = (item: Item, mapping?: ItemLocationMapping) => {
    setRelocateItem({ item, currentMapping: mapping });
    setRelocateDestLocId(String(mapping ? mapping.locationId : ''));
    setRelocateQty(String(mapping ? mapping.quantity : item.currentStock));
    setRelocateMaxCap(String(mapping ? mapping.maxCapacity : 100));
  };

  // Helper maps for location names & paths
  const locationMap = useMemo(() => {
    const map = new Map<number, InventoryLocation>();
    locations.forEach(l => { if (l.id) map.set(l.id, l); });
    return map;
  }, [locations]);

  const getLocationFullPath = (locId?: number): { warehouse: string; shelf: string; fullPath: string } => {
    if (!locId || !locationMap.has(locId)) {
      return { warehouse: 'Unassigned', shelf: 'Unassigned', fullPath: 'Unassigned' };
    }
    const curr = locationMap.get(locId)!;
    if (curr.type === 'WAREHOUSE') {
      return { warehouse: curr.name, shelf: curr.code, fullPath: `${curr.name} (${curr.code})` };
    }
    if (curr.type === 'ZONE' && curr.parentId && locationMap.has(curr.parentId)) {
      const parent = locationMap.get(curr.parentId)!;
      return { warehouse: parent.name, shelf: curr.name, fullPath: `${parent.name} → ${curr.name}` };
    }
    if (curr.type === 'SHELF' && curr.parentId && locationMap.has(curr.parentId)) {
      const parentZone = locationMap.get(curr.parentId)!;
      const grandParentWh = parentZone.parentId && locationMap.has(parentZone.parentId)
        ? locationMap.get(parentZone.parentId)!.name
        : 'Warehouse';
      return { warehouse: grandParentWh, shelf: `${curr.name} (${curr.code})`, fullPath: `${grandParentWh} → ${parentZone.name} → ${curr.name}` };
    }
    return { warehouse: curr.name, shelf: curr.code, fullPath: `${curr.name} (${curr.code})` };
  };

  // Top Metrics Calculation
  const activeWarehouses = useMemo(() => {
    return locations.filter(l => l.type === 'WAREHOUSE').length;
  }, [locations]);

  const definedShelves = useMemo(() => {
    return locations.filter(l => l.type === 'SHELF' || l.type === 'ZONE').length;
  }, [locations]);

  const itemLocationMapByItemId = useMemo(() => {
    const map = new Map<number, ItemLocationMapping[]>();
    itemLocations.forEach(il => {
      if (!map.has(il.itemId)) map.set(il.itemId, []);
      map.get(il.itemId)!.push(il);
    });
    return map;
  }, [itemLocations]);

  const { assignedCount, unassignedCount } = useMemo(() => {
    let assigned = 0;
    let unassigned = 0;
    items.forEach(item => {
      if (item.id) {
        const mappings = itemLocationMapByItemId.get(item.id) || [];
        const hasMapping = mappings.some(m => m.quantity > 0);
        if (hasMapping) assigned++;
        else unassigned++;
      }
    });
    return { assignedCount: assigned, unassignedCount: unassigned };
  }, [items, itemLocationMapByItemId]);

  const capacityUtilization = useMemo(() => {
    let totalCap = 0;
    locations.forEach(l => { totalCap += (l.capacity || 0); });
    let usedCap = 0;
    itemLocations.forEach(il => { usedCap += il.quantity; });
    if (totalCap === 0) return 0;
    return Math.min(100, Math.round((usedCap / totalCap) * 100));
  }, [locations, itemLocations]);

  // Unified Rows for Stock by Location Table
  const stockRows = useMemo(() => {
    const rows: Array<{
      item: Item;
      mapping?: ItemLocationMapping;
      warehouseName: string;
      shelfCode: string;
      fullPath: string;
      availableQty: number;
      capacityLimit: number;
      isUnassigned: boolean;
    }> = [];

    items.forEach(item => {
      if (!item.id) return;
      const mappings = itemLocationMapByItemId.get(item.id) || [];

      if (mappings.length === 0) {
        rows.push({
          item,
          warehouseName: 'Unassigned',
          shelfCode: 'No Shelf Assigned',
          fullPath: 'Unassigned (General Stock)',
          availableQty: item.currentStock,
          capacityLimit: 0,
          isUnassigned: true
        });
      } else {
        mappings.forEach(m => {
          const locInfo = getLocationFullPath(m.locationId);
          rows.push({
            item,
            mapping: m,
            warehouseName: locInfo.warehouse,
            shelfCode: locInfo.shelf,
            fullPath: locInfo.fullPath,
            availableQty: m.quantity,
            capacityLimit: m.maxCapacity || locationMap.get(m.locationId)?.capacity || 100,
            isUnassigned: false
          });
        });
      }
    });

    return rows;
  }, [items, itemLocationMapByItemId, locationMap]);

  // Filtered Stock Rows
  const filteredStockRows = useMemo(() => {
    return stockRows.filter(row => {
      // Search term filter
      const matchesSearch =
        !searchTerm ||
        row.item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.item.skuCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.item.barcode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.shelfCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.fullPath.toLowerCase().includes(searchTerm.toLowerCase());

      // Barcode quick search filter
      const matchesBarcode =
        !barcodeSearch ||
        row.item.barcode.toLowerCase() === barcodeSearch.trim().toLowerCase() ||
        row.item.skuCode.toLowerCase() === barcodeSearch.trim().toLowerCase();

      // Warehouse filter
      const matchesWh =
        selectedWarehouseFilter === 'ALL' ||
        row.warehouseName === selectedWarehouseFilter;

      // Unassigned filter
      const matchesUnassigned = !showUnassignedOnly || row.isUnassigned;

      return matchesSearch && matchesBarcode && matchesWh && matchesUnassigned;
    });
  }, [stockRows, searchTerm, barcodeSearch, selectedWarehouseFilter, showUnassignedOnly]);

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

    if (locType !== 'WAREHOUSE' && !locParentId) {
      showToast(`Please select a Parent Location for ${locType === 'ZONE' ? 'Zone / Aisle' : 'Rack / Shelf / Bin'}.`, 'error');
      return;
    }

    const codeUpper = locCode.trim().toUpperCase();
    const existingCode = locations.find(l => l.code === codeUpper && l.tenantId === tenantId);
    if (existingCode) {
      showToast(`Location Code "${codeUpper}" already exists! Please use a unique code.`, 'error');
      return;
    }

    const payload = {
      tenantId,
      name: locName.trim(),
      code: codeUpper,
      type: locType,
      parentId: locParentId ? Number(locParentId) : null,
      capacity: Number(locCapacity) || 0,
      description: locDescription.trim(),
      createdAt: new Date().toISOString()
    };

    try {
      await db.locations.add(payload);
      saveServerLocation(payload).catch(() => {});

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
    const itemIdNum = Number(transferItemId);
    const srcLocIdNum = Number(transferSourceLocId);
    const destLocIdNum = Number(transferDestLocId);
    const qty = Number(transferQty);

    if (!itemIdNum || !srcLocIdNum || !destLocIdNum || qty <= 0) {
      showToast('Please fill all transfer details with a valid quantity.', 'error');
      return;
    }

    if (srcLocIdNum === destLocIdNum) {
      showToast('Source and Destination locations must be different.', 'error');
      return;
    }

    try {
      // 1. Deduct from Source Location Mapping
      let srcMapping = await db.itemLocations
        .filter(il => il.tenantId === tenantId && il.itemId === itemIdNum && il.locationId === srcLocIdNum)
        .first();

      const itemObj = items.find(i => i.id === itemIdNum);

      // Auto-fallback: If item has stock in store but no explicit source mapping record yet
      if (!srcMapping && itemObj && itemObj.currentStock >= qty) {
        const newSrcId = await db.itemLocations.add({
          tenantId,
          itemId: itemIdNum,
          locationId: srcLocIdNum,
          quantity: itemObj.currentStock,
          maxCapacity: 500,
          updatedAt: new Date().toISOString()
        });
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
      saveServerItemLocation({ tenantId, itemId: itemIdNum, locationId: srcLocIdNum, quantity: updatedSrcQty }).catch(() => {});

      // 2. Add to Destination Location Mapping
      const destMapping = await db.itemLocations
        .filter(il => il.tenantId === tenantId && il.itemId === itemIdNum && il.locationId === destLocIdNum)
        .first();

      const updatedDestQty = (destMapping ? destMapping.quantity : 0) + qty;
      if (destMapping) {
        await db.itemLocations.update(destMapping.id!, {
          quantity: updatedDestQty,
          updatedAt: new Date().toISOString()
        });
      } else {
        await db.itemLocations.add({
          tenantId,
          itemId: itemIdNum,
          locationId: destLocIdNum,
          quantity: qty,
          maxCapacity: 200,
          updatedAt: new Date().toISOString()
        });
      }
      saveServerItemLocation({ tenantId, itemId: itemIdNum, locationId: destLocIdNum, quantity: updatedDestQty }).catch(() => {});

      // 3. Log Stock Transfer History
      const trfNum = `TRF-${Date.now().toString().slice(-6)}`;
      const transferPayload = {
        transferNumber: trfNum,
        tenantId,
        sourceLocationId: srcLocIdNum,
        destinationLocationId: destLocIdNum,
        itemId: itemIdNum,
        quantity: qty,
        transferDate: new Date().toISOString().split('T')[0],
        notes: transferNotes || 'Internal inter-location stock transfer',
        createdAt: new Date().toISOString()
      };
      await db.stockTransfers.add(transferPayload);
      createServerStockTransfer(transferPayload).catch(() => {});

      const selectedItem = items.find(i => i.id === itemIdNum);
      const srcLoc = locationMap.get(srcLocIdNum);
      const destLoc = locationMap.get(destLocIdNum);

      showToast(
        `Transferred ${qty} PCS of ${selectedItem?.name || 'Item'} from ${srcLoc?.name || 'Source'} to ${destLoc?.name || 'Destination'}.`,
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
    const destLocIdNum = Number(relocateDestLocId);
    const qty = Number(relocateQty) || item.currentStock;
    const cap = Number(relocateMaxCap) || 100;

    try {
      if (relocateItem.currentMapping) {
        // Update existing mapping
        await db.itemLocations.update(relocateItem.currentMapping.id!, {
          locationId: destLocIdNum,
          quantity: qty,
          maxCapacity: cap,
          updatedAt: new Date().toISOString()
        });
      } else {
        // Create new location assignment
        await db.itemLocations.add({
          tenantId,
          itemId: item.id!,
          locationId: destLocIdNum,
          quantity: qty,
          maxCapacity: cap,
          updatedAt: new Date().toISOString()
        });
      }
      saveServerItemLocation({ tenantId, itemId: item.id!, locationId: destLocIdNum, quantity: qty, maxCapacity: cap }).catch(() => {});

      const destLoc = locationMap.get(destLocIdNum);
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
                className={`px-4 py-2 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center gap-2 ${
                  activeViewTab === 'stock-table'
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Package className="w-4 h-4" />
                <span>Stock by Location</span>
              </button>

              <button
                onClick={() => setActiveViewTab('hierarchy-master')}
                className={`px-4 py-2 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center gap-2 ${
                  activeViewTab === 'hierarchy-master'
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FolderTree className="w-4 h-4" />
                <span>Location Hierarchy Master</span>
              </button>

              <button
                onClick={() => setActiveViewTab('transfer-history')}
                className={`px-4 py-2 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center gap-2 ${
                  activeViewTab === 'transfer-history'
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ArrowLeftRight className="w-4 h-4" />
                <span>Stock Transfer Logs ({stockTransfers.length})</span>
              </button>
            </div>

            {/* Filter Toggle for Unassigned Items */}
            {activeViewTab === 'stock-table' && (
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
          <div className="card bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="vyapar-table">
                <thead>
                  <tr>
                    <th className="w-12 text-center">#</th>
                    <th>Item Name</th>
                    <th>SKU / Barcode</th>
                    <th>Warehouse / Branch</th>
                    <th>Shelf / Bin Code</th>
                    <th className="text-right">Available Qty</th>
                    <th className="text-right">Capacity / Max</th>
                    <th className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStockRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-slate-400 font-medium">
                        No inventory stock mapping found matching your search.
                      </td>
                    </tr>
                  ) : (
                    filteredStockRows.map((row, idx) => (
                      <tr key={`${row.item.id}-${row.mapping?.id || idx}`}>
                        {/* Index # */}
                        <td className="font-mono text-xs font-bold text-slate-400 text-center">{idx + 1}</td>

                        {/* Item Name */}
                        <td>
                          <div className="font-bold text-slate-800">{row.item.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">Unit: {row.item.unitType}</div>
                        </td>

                        {/* SKU / Barcode */}
                        <td>
                          <div className="font-mono text-xs font-bold text-slate-700">{row.item.skuCode}</div>
                          <div className="font-mono text-[11px] text-slate-400">{row.item.barcode}</div>
                        </td>

                        {/* Warehouse / Branch */}
                        <td>
                          <span className={`badge ${row.isUnassigned ? 'badge-amber' : 'badge-blue'}`}>
                            {row.warehouseName}
                          </span>
                        </td>

                        {/* Shelf / Bin Code */}
                        <td>
                          <div className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                            <span>{row.shelfCode}</span>
                          </div>
                          <div className="text-[10.5px] text-slate-400">{row.fullPath}</div>
                        </td>

                        {/* Available Quantity */}
                        <td className="text-right font-black text-slate-900 text-xs">
                          {row.availableQty} {row.item.unitType}
                        </td>

                        {/* Capacity Limit */}
                        <td className="text-right font-mono text-xs text-slate-600">
                          {row.capacityLimit > 0 ? `${row.capacityLimit} ${row.item.unitType}` : 'N/A'}
                        </td>

                        {/* Actions */}
                        <td className="text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => handleOpenTransferForRow(row.item, row.mapping)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold transition cursor-pointer inline-flex items-center gap-1 border border-emerald-200"
                              title="Transfer stock from this location"
                            >
                              <ArrowLeftRight className="w-3.5 h-3.5" />
                              <span>⇄ Transfer</span>
                            </button>

                            <button
                              onClick={() => handleOpenRelocateModal(row.item, row.mapping)}
                              className="px-2.5 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-[11px] font-bold transition cursor-pointer inline-flex items-center gap-1 border border-purple-200"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>Relocate</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── View 2: Location Hierarchy Master ─────────────────────────── */}
        {activeViewTab === 'hierarchy-master' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {locations.filter(l => l.type === 'WAREHOUSE').map(wh => {
              const zones = locations.filter(l => l.type === 'ZONE' && l.parentId === wh.id);

              return (
                <div key={wh.id} className="card bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                        <Warehouse className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-sm text-slate-800">{wh.name}</h3>
                        <span className="text-[11px] font-mono text-slate-400">{wh.code}</span>
                      </div>
                    </div>
                    <span className="badge badge-blue">Warehouse</span>
                  </div>

                  <p className="text-xs text-slate-500">{wh.description || 'Main warehouse facility'}</p>

                  <div className="space-y-3">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Zones & Shelves</div>
                    {zones.length === 0 ? (
                      <div className="text-xs text-slate-400 italic py-2">No zones created in this warehouse yet.</div>
                    ) : (
                      zones.map(zone => {
                        const shelves = locations.filter(l => l.type === 'SHELF' && l.parentId === zone.id);
                        return (
                          <div key={zone.id} className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 space-y-2">
                            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                              <span>{zone.name} ({zone.code})</span>
                              <span className="text-[10px] text-purple-600 font-extrabold uppercase">Zone</span>
                            </div>
                            <div className="space-y-1 pl-2">
                              {shelves.map(sh => (
                                <div key={sh.id} className="flex items-center justify-between text-[11px] text-slate-600 bg-white p-1.5 rounded-lg border border-slate-200/50">
                                  <span className="font-semibold flex items-center gap-1">
                                    <ChevronRight className="w-3 h-3 text-slate-400" />
                                    {sh.name}
                                  </span>
                                  <span className="font-mono text-[10px] text-slate-400">Cap: {sh.capacity}</span>
                                </div>
                              ))}
                            </div>
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
                  {stockTransfers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-slate-400 font-medium">
                        No inter-location stock transfers recorded yet.
                      </td>
                    </tr>
                  ) : (
                    stockTransfers.map((trf, idx) => {
                      const item = items.find(i => i.id === trf.itemId);
                      const srcLoc = locationMap.get(trf.sourceLocationId);
                      const destLoc = locationMap.get(trf.destinationLocationId);

                      return (
                        <tr key={trf.id}>
                          <td className="font-mono text-xs font-bold text-slate-400 text-center">{idx + 1}</td>
                          <td className="font-mono text-xs font-bold text-slate-800">{trf.transferNumber}</td>
                          <td className="text-xs text-slate-600">{trf.transferDate}</td>
                          <td className="font-bold text-slate-800">{item?.name || 'Item'}</td>
                          <td>
                            <span className="badge badge-red">{srcLoc?.name || 'Source'}</span>
                          </td>
                          <td>
                            <span className="badge badge-green">{destLoc?.name || 'Destination'}</span>
                          </td>
                          <td className="text-right font-black text-purple-700 text-xs">
                            {trf.quantity} PCS
                          </td>
                          <td className="text-xs text-slate-500">{trf.notes || '-'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
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
                  onChange={e => setLocType(e.target.value as LocationType)}
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
                    {locations
                      .filter(l => locType === 'ZONE' ? l.type === 'WAREHOUSE' : (l.type === 'ZONE' || l.type === 'WAREHOUSE'))
                      .map(l => (
                        <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
                      ))}
                    {locations.filter(l => locType === 'ZONE' ? l.type === 'WAREHOUSE' : (l.type === 'ZONE' || l.type === 'WAREHOUSE')).length === 0 && (
                      <option value="" disabled>No parent warehouses created yet. Please create a Warehouse first.</option>
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
                <input
                  type="number"
                  value={locCapacity}
                  onChange={e => setLocCapacity(e.target.value)}
                  placeholder="500"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-bold text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                />
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
                          const mapping = itemLocations.find(il => il.itemId === item.id && il.quantity > 0);
                          const sourceLoc = mapping ? locationMap.get(mapping.locationId) : null;

                          return (
                            <div
                              key={item.id}
                              onClick={() => handleChooseItemFromSearch(item)}
                              className={`p-2.5 rounded-lg text-xs cursor-pointer transition flex items-center justify-between ${
                                isSelected ? 'bg-purple-100/70 border border-purple-300' : 'hover:bg-purple-50'
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
                    {locations.map(l => {
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
                    {locations.map(l => (
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
              <div className="bg-purple-50 p-3.5 rounded-xl border border-purple-100">
                <div className="font-extrabold text-sm text-purple-900">{relocateItem.item.name}</div>
                <div className="text-xs text-purple-700 font-mono mt-0.5">
                  SKU: {relocateItem.item.skuCode} | Stock: {relocateItem.item.currentStock} {relocateItem.item.unitType}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Target Shelf / Location *</label>
                <select
                  required
                  value={relocateDestLocId}
                  onChange={e => setRelocateDestLocId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-bold text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                >
                  <option value="">Select Shelf / Location...</option>
                  {locations.map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({l.code}) — Cap: {l.capacity}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Quantity at Shelf</label>
                  <input
                    type="number"
                    value={relocateQty}
                    onChange={e => setRelocateQty(e.target.value)}
                    placeholder={String(relocateItem.item.currentStock)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-bold text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Max Shelf Capacity</label>
                  <input
                    type="number"
                    value={relocateMaxCap}
                    onChange={e => setRelocateMaxCap(e.target.value)}
                    placeholder="100"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-bold text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                  />
                </div>
              </div>

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

    </div>
  );
};
