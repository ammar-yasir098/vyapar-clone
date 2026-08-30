import { db } from '../db';
import { SyncJournal } from '../types';
import { fetchWithTimeout } from './api';

const SYNC_SERVER_URL = 'http://localhost:5000/api/v1/sync';

export interface SyncStatus {
  isOnline: boolean;
  pendingCount: number;
  lastSyncedAt?: string;
  isSyncing: boolean;
  serverVersion?: number;
}

type Listener = (status: SyncStatus) => void;

export class ClientSyncManager {
  private isSyncing = false;
  private lastSyncedAt?: string;
  private listeners: Set<Listener> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      setInterval(() => {
        this.triggerSync().catch(() => {});
        this.pullServerChanges().catch(() => {});
      }, 5000);

      window.addEventListener('focus', () => {
        this.triggerSync().catch(() => {});
        this.pullServerChanges().catch(() => {});
      });
    }
  }

  public subscribe(listener: Listener) {
    this.listeners.add(listener);
    this.notify();
    return () => this.listeners.delete(listener);
  }

  private notify(serverVersion?: number) {
    db.syncJournal.where('synced').equals(0).count().then(count => {
      const status: SyncStatus = {
        isOnline: navigator.onLine,
        pendingCount: count,
        lastSyncedAt: this.lastSyncedAt,
        isSyncing: this.isSyncing,
        serverVersion
      };
      this.listeners.forEach(fn => fn(status));
    });
  }

  /**
   * Logs a local mutation to the sync journal queue.
   */
  public static async logMutation(
    entityType: SyncJournal['entityType'],
    entityId: string,
    mutationType: 'INSERT' | 'UPDATE' | 'DELETE',
    payload: any
  ): Promise<void> {
    const journalRecord: SyncJournal = {
      versionId: `client-v-${Date.now()}`,
      clientSequence: Date.now(),
      entityType,
      entityId,
      mutationType,
      payload: JSON.stringify(payload),
      timestamp: new Date().toISOString(),
      synced: false
    };

    await db.syncJournal.add(journalRecord);
    if (typeof syncManager !== 'undefined' && syncManager) {
      syncManager.notify();
      syncManager.triggerSync();
    }
  }

  public async logMutation(
    entityType: SyncJournal['entityType'],
    entityId: string,
    mutationType: 'INSERT' | 'UPDATE' | 'DELETE',
    payload: any
  ) {
    const journalRecord: SyncJournal = {
      versionId: `client-v-${Date.now()}`,
      clientSequence: Date.now(),
      entityType,
      entityId,
      mutationType,
      payload: JSON.stringify(payload),
      timestamp: new Date().toISOString(),
      synced: false
    };

    await db.syncJournal.add(journalRecord);
    this.notify();

    // Trigger sync push immediately if online
    this.triggerSync();
  }

  /**
   * Pushes pending local mutations to the cloud backend API.
   */
  /**
   * Pushes pending local mutations to the cloud backend API.
   */
  public async triggerSync(targetTenantId?: string) {
    const activeTenantId = targetTenantId || (typeof localStorage !== 'undefined' ? localStorage.getItem('vyapar_current_tenant') : null) || 'default-tenant';
    if (this.isSyncing || (typeof navigator !== 'undefined' && !navigator.onLine)) return;

    this.isSyncing = true;
    this.notify();

    try {
      let unsynced = await db.syncJournal.filter(record => !record.synced).toArray();

      if (unsynced.length > 0) {
        const response = await fetchWithTimeout(`${SYNC_SERVER_URL}/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId: activeTenantId,
            mutations: unsynced
          })
        });

        if (response.ok) {
          const resData = await response.json();
          
          // Bulk mark local records as synced in a single transaction
          const idsToSync = unsynced.map(item => item.id!).filter(Boolean);
          if (idsToSync.length > 0) {
            await db.transaction('rw', db.syncJournal, async () => {
              for (const id of idsToSync) {
                await db.syncJournal.update(id, { synced: true });
              }
            });
          }

          await pruneSyncedJournalEntries();

          this.lastSyncedAt = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });

          this.notify(resData.serverVersion);
        }
      }
    } catch (err) {
      console.warn('Sync server offline or unreachable. Operating in local mode.', err);
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }

  /**
   * Pulls latest server records from cloud PostgreSQL into local Dexie IndexedDB.
   */
  public async pullServerChanges(targetTenantId?: string) {
    const activeTenantId = targetTenantId || (typeof localStorage !== 'undefined' ? localStorage.getItem('vyapar_current_tenant') : null) || 'default-tenant';
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    try {
      const response = await fetchWithTimeout(`${SYNC_SERVER_URL}/pull?tenantId=${encodeURIComponent(activeTenantId)}`);
      if (!response.ok) return;
      const json = await response.json();
      if (!json.success || !json.data) return;

      const {
        items,
        parties,
        invoices,
        estimates,
        paymentsIn,
        purchaseOrders,
        purchaseBills,
        paymentsOut,
        expenses,
        purchaseReturns,
        saleReturns,
        cashAccounts,
        cashTransactions,
        locations,
        itemLocations,
        stockTransfers,
        storeWarehouseAccess
      } = json.data;

      const pendingJournal = await db.syncJournal.filter(record => !record.synced).toArray();
      const pendingSyncItemIds = new Set<string>();
      const pendingSyncItemKeys = new Set<string>();
      const pendingSyncLocMapIds = new Set<string>();
      const pendingDeleteIds = new Set<string>();
      const pendingDeleteKeys = new Set<string>();

      for (const j of pendingJournal) {
        if (j.entityType === 'ITEM') {
          if (j.mutationType === 'DELETE') {
            pendingDeleteIds.add(String(j.entityId));
          } else {
            pendingSyncItemIds.add(String(j.entityId));
          }
          try {
            const p = typeof j.payload === 'string' ? JSON.parse(j.payload) : j.payload;
            if (p?.id) {
              if (j.mutationType === 'DELETE') pendingDeleteIds.add(String(p.id));
              else pendingSyncItemIds.add(String(p.id));
            }
            if (p?.skuCode) {
              const skuKey = String(p.skuCode).trim().toLowerCase();
              if (j.mutationType === 'DELETE') pendingDeleteKeys.add(skuKey);
              else pendingSyncItemKeys.add(skuKey);
            }
            if (p?.name) {
              const nameKey = String(p.name).trim().toLowerCase();
              if (j.mutationType === 'DELETE') pendingDeleteKeys.add(nameKey);
              else pendingSyncItemKeys.add(nameKey);
            }
          } catch {}
        } else if (j.entityType === 'ITEM_LOCATION') {
          pendingSyncLocMapIds.add(String(j.entityId));
        }
      }

      // 1. Merge items safely with non-empty SKU or case-insensitive name match
      if (Array.isArray(items) && items.length > 0) {
        for (const sItem of items) {
          const sTenant = sItem.tenantId || activeTenantId;
          if (sTenant !== activeTenantId) continue;
          const sId = Number(sItem.id);

          const sSku = (sItem.skuCode || '').trim().toLowerCase();
          const sName = (sItem.name || '').trim().toLowerCase();

          // If item is marked for DELETE locally, skip re-adding it from server
          if (pendingDeleteIds.has(String(sId)) || (sSku && pendingDeleteKeys.has(sSku)) || (sName && pendingDeleteKeys.has(sName))) {
            continue;
          }

          const skuMatch = sItem.skuCode && sItem.skuCode.trim() !== '';
          const nameMatch = sItem.name && sItem.name.trim() !== '';
          
          const existing = await db.items
            .filter(i => {
              const tMatch = (i.tenantId || 'default-tenant') === activeTenantId;
              if (!tMatch) return false;
              if (sId && Number(i.id) === sId) return true;
              if ((i as any).cloudId && Number((i as any).cloudId) === sId) return true;
              if (skuMatch && i.skuCode && i.skuCode.trim().toLowerCase() === sItem.skuCode.trim().toLowerCase()) return true;
              if (nameMatch && i.name && i.name.trim().toLowerCase() === sItem.name.trim().toLowerCase()) return true;
              return false;
            })
            .first();

          if (existing && existing.id) {
            const isPendingSync = pendingSyncItemIds.has(String(existing.id)) ||
                                  (existing.skuCode && pendingSyncItemKeys.has(existing.skuCode.trim().toLowerCase())) ||
                                  (existing.name && pendingSyncItemKeys.has(existing.name.trim().toLowerCase()));

            const finalStock = isPendingSync
              ? Math.max(Number(existing.currentStock) || 0, Number(sItem.currentStock) || 0)
              : (sItem.currentStock !== undefined && sItem.currentStock !== null ? Number(sItem.currentStock) : Number(existing.currentStock) || 0);

            await db.items.update(existing.id, {
              ...sItem,
              id: existing.id,
              cloudId: sId,
              tenantId: activeTenantId,
              currentStock: finalStock
            });
          } else {
            await db.items.put({ ...sItem, id: sId, cloudId: sId, tenantId: activeTenantId });
          }
        }
      }

      // 2. Merge parties with case-insensitive name match
      if (Array.isArray(parties) && parties.length > 0) {
        for (const sParty of parties) {
          const sTenant = sParty.tenantId || activeTenantId;
          if (sTenant !== activeTenantId) continue;

          const pName = (sParty.name || '').trim().toLowerCase();
          const existing = await db.parties
            .filter(p => (p.tenantId || 'default-tenant') === activeTenantId && (p.name || '').trim().toLowerCase() === pName)
            .first();
          if (existing && existing.id) {
            await db.parties.update(existing.id, { ...sParty, id: existing.id, tenantId: activeTenantId });
          } else {
            const { id, ...partyData } = sParty;
            await db.parties.add({ ...partyData, tenantId: activeTenantId });
          }
        }
      }

      // 3. Merge invoices
      if (Array.isArray(invoices) && invoices.length > 0) {
        for (const sInv of invoices) {
          const sTenant = sInv.tenantId || activeTenantId;
          if (sTenant !== activeTenantId) continue;

          const invId = sInv.invoiceId || sInv.invoice_id;
          const invNum = sInv.invoiceNumber || sInv.invoice_number;
          const existing = await db.invoices
            .filter(inv => {
              const tMatch = (inv.tenantId || 'default-tenant') === activeTenantId;
              if (!tMatch) return false;
              if (invId && inv.invoiceId === invId) return true;
              if (invNum && inv.invoiceNumber === invNum) return true;
              return false;
            })
            .first();
          if (existing && existing.id) {
            await db.invoices.update(existing.id, { ...sInv, id: existing.id, tenantId: activeTenantId });
          } else {
            const { id, ...invData } = sInv;
            await db.invoices.add({ ...invData, tenantId: activeTenantId });
          }
        }
      }

      // 4. Merge estimates
      if (Array.isArray(estimates) && estimates.length > 0) {
        for (const sEst of estimates) {
          const sTenant = sEst.tenantId || activeTenantId;
          if (sTenant !== activeTenantId) continue;

          const estId = sEst.estimateId || sEst.estimate_id;
          const estNum = sEst.estimateNumber || sEst.estimate_number;
          const existing = await db.estimates
            .filter(e => {
              const tMatch = (e.tenantId || 'default-tenant') === activeTenantId;
              if (!tMatch) return false;
              if (estId && e.estimateId === estId) return true;
              if (estNum && e.estimateNumber === estNum) return true;
              return false;
            })
            .first();
          if (existing && existing.id) {
            await db.estimates.update(existing.id, { ...sEst, id: existing.id, tenantId: activeTenantId });
          } else {
            const { id, ...estData } = sEst;
            await db.estimates.add({ ...estData, tenantId: activeTenantId });
          }
        }
      }

      // 5. Merge payment-in
      if (Array.isArray(paymentsIn) && paymentsIn.length > 0) {
        for (const sPayIn of paymentsIn) {
          const sTenant = sPayIn.tenantId || activeTenantId;
          if (sTenant !== activeTenantId) continue;

          const recNum = sPayIn.receiptNumber || sPayIn.receipt_number;
          const existing = await db.paymentIn
            .filter(p => (p.tenantId || 'default-tenant') === activeTenantId && recNum && p.receiptNumber === recNum)
            .first();
          if (existing && existing.id) {
            await db.paymentIn.update(existing.id, { ...sPayIn, id: existing.id, tenantId: activeTenantId });
          } else {
            const { id, ...payInData } = sPayIn;
            await db.paymentIn.add({ ...payInData, tenantId: activeTenantId });
          }
        }
      }

      // 6. Merge purchase orders
      if (Array.isArray(purchaseOrders) && purchaseOrders.length > 0) {
        for (const sPO of purchaseOrders) {
          const sTenant = sPO.tenantId || activeTenantId;
          if (sTenant !== activeTenantId) continue;

          const poId = sPO.poId || sPO.po_id;
          const poNum = sPO.poNumber || sPO.po_number;
          const existing = await db.purchaseOrders
            .filter(po => {
              const tMatch = (po.tenantId || 'default-tenant') === activeTenantId;
              if (!tMatch) return false;
              if (poId && po.poId === poId) return true;
              if (poNum && po.poNumber === poNum) return true;
              return false;
            })
            .first();
          if (existing && existing.id) {
            await db.purchaseOrders.update(existing.id, { ...sPO, id: existing.id, tenantId: activeTenantId });
          } else {
            const { id, ...poData } = sPO;
            await db.purchaseOrders.add({ ...poData, tenantId: activeTenantId });
          }
        }
      }

      // 7. Merge purchase bills
      if (Array.isArray(purchaseBills) && purchaseBills.length > 0) {
        for (const sBill of purchaseBills) {
          const sTenant = sBill.tenantId || activeTenantId;
          if (sTenant !== activeTenantId) continue;

          const bId = sBill.billId || sBill.bill_id;
          const bNum = sBill.billNumber || sBill.bill_number;
          const existing = await db.purchaseBills
            .filter(b => {
              const tMatch = (b.tenantId || 'default-tenant') === activeTenantId;
              if (!tMatch) return false;
              if (bId && b.billId === bId) return true;
              if (bNum && b.billNumber === bNum) return true;
              return false;
            })
            .first();
          if (existing && existing.id) {
            await db.purchaseBills.update(existing.id, { ...sBill, id: existing.id, tenantId: activeTenantId });
          } else {
            const { id, ...billData } = sBill;
            await db.purchaseBills.add({ ...billData, tenantId: activeTenantId });
          }
        }
      }

      // 8. Merge payment-out
      if (Array.isArray(paymentsOut) && paymentsOut.length > 0) {
        for (const sPayOut of paymentsOut) {
          const sTenant = sPayOut.tenantId || activeTenantId;
          if (sTenant !== activeTenantId) continue;

          const recNum = sPayOut.receiptNumber || sPayOut.receipt_number;
          const existing = await db.paymentOut
            .filter(p => (p.tenantId || 'default-tenant') === activeTenantId && recNum && p.receiptNumber === recNum)
            .first();
          if (existing && existing.id) {
            await db.paymentOut.update(existing.id, { ...sPayOut, id: existing.id, tenantId: activeTenantId });
          } else {
            const { id, ...payOutData } = sPayOut;
            await db.paymentOut.add({ ...payOutData, tenantId: activeTenantId });
          }
        }
      }

      // 9. Merge expenses
      if (Array.isArray(expenses) && expenses.length > 0) {
        for (const sExp of expenses) {
          const sTenant = sExp.tenantId || activeTenantId;
          if (sTenant !== activeTenantId) continue;

          const expNum = sExp.expenseNumber || sExp.expense_number;
          const existing = await db.expenses
            .filter(e => (e.tenantId || 'default-tenant') === activeTenantId && expNum && e.expenseNumber === expNum)
            .first();
          if (existing && existing.id) {
            await db.expenses.update(existing.id, { ...sExp, id: existing.id, tenantId: activeTenantId });
          } else {
            const { id, ...expData } = sExp;
            await db.expenses.add({ ...expData, tenantId: activeTenantId });
          }
        }
      }

      // 10. Merge purchase returns
      if (Array.isArray(purchaseReturns) && purchaseReturns.length > 0) {
        for (const sRet of purchaseReturns) {
          const sTenant = sRet.tenantId || activeTenantId;
          if (sTenant !== activeTenantId) continue;

          const rId = sRet.returnId || sRet.return_id;
          const dnNum = sRet.debitNoteNumber || sRet.debit_note_number;
          const existing = await db.purchaseReturns
            .filter(r => {
              const tMatch = (r.tenantId || 'default-tenant') === activeTenantId;
              if (!tMatch) return false;
              if (rId && r.returnId === rId) return true;
              if (dnNum && r.debitNoteNumber === dnNum) return true;
              return false;
            })
            .first();
          if (existing && existing.id) {
            await db.purchaseReturns.update(existing.id, { ...sRet, id: existing.id, tenantId: activeTenantId });
          } else {
            const { id, ...retData } = sRet;
            await db.purchaseReturns.add({ ...retData, tenantId: activeTenantId });
          }
        }
      }

      // 11. Merge sale returns
      if (Array.isArray(saleReturns) && saleReturns.length > 0) {
        for (const sSRet of saleReturns) {
          const sTenant = sSRet.tenantId || activeTenantId;
          if (sTenant !== activeTenantId) continue;

          const rId = sSRet.returnId || sSRet.return_id;
          const crNum = sSRet.creditNoteNumber || sSRet.credit_note_number;
          const existing = await db.saleReturns
            .filter(sr => {
              const tMatch = (sr.tenantId || 'default-tenant') === activeTenantId;
              if (!tMatch) return false;
              if (rId && sr.returnId === rId) return true;
              if (crNum && sr.creditNoteNumber === crNum) return true;
              return false;
            })
            .first();
          if (existing && existing.id) {
            await db.saleReturns.update(existing.id, { ...sSRet, id: existing.id, tenantId: activeTenantId });
          } else {
            const { id, ...sRetData } = sSRet;
            await db.saleReturns.add({ ...sRetData, tenantId: activeTenantId });
          }
        }
      }

      // 12. Merge cash accounts
      if (Array.isArray(cashAccounts) && cashAccounts.length > 0) {
        for (const sAcc of cashAccounts) {
          const sTenant = sAcc.tenantId || activeTenantId;
          if (sTenant !== activeTenantId) continue;

          const accName = (sAcc.name || '').trim().toLowerCase();
          const existing = await db.cashAccounts
            .filter(c => (c.tenantId || 'default-tenant') === activeTenantId && (c.name || '').trim().toLowerCase() === accName)
            .first();
          if (existing && existing.id) {
            await db.cashAccounts.update(existing.id as number, { ...sAcc, id: existing.id, tenantId: activeTenantId });
          } else {
            const { id, ...accData } = sAcc;
            await db.cashAccounts.add({ ...accData, tenantId: activeTenantId });
          }
        }
      }

      // 13. Merge cash transactions
      if (Array.isArray(cashTransactions) && cashTransactions.length > 0) {
        for (const sTx of cashTransactions) {
          const sTenant = sTx.tenantId || activeTenantId;
          if (sTenant !== activeTenantId) continue;

          const refId = sTx.referenceId || sTx.reference_id;
          const existing = await db.cashTransactions
            .filter(ct => {
              const tMatch = (ct.tenantId || 'default-tenant') === activeTenantId;
              if (!tMatch) return false;
              if (refId && ct.referenceId === refId) return true;
              return false;
            })
            .first();
          if (existing && existing.id) {
            await db.cashTransactions.update(existing.id as number, { ...sTx, id: existing.id, tenantId: activeTenantId });
          } else {
            const { id, ...txData } = sTx;
            await db.cashTransactions.add({ ...txData, tenantId: activeTenantId });
          }
        }
      }

      // 14. Merge inventory locations (warehouses, zones, shelves)
      if (Array.isArray(locations) && locations.length > 0) {
        for (const sLoc of locations) {
          const locId = sLoc.id ? String(sLoc.id) : `wh-${Date.now()}`;
          const sTenant = sLoc.tenantId || activeTenantId;
          const locCode = sLoc.code ? sLoc.code.trim().toUpperCase() : null;
          
          const existing = await db.locations
            .filter(l => {
              if (l.id && String(l.id) === locId) return true;
              if (locCode && l.code && l.code.trim().toUpperCase() === locCode && (l.tenantId || 'default-tenant') === sTenant) return true;
              return false;
            })
            .first();

          if (existing && existing.id && String(existing.id) !== locId) {
            await db.locations.delete(existing.id);
          }

          await db.locations.put({
            ...sLoc,
            id: locId,
            parentId: sLoc.parentId ? String(sLoc.parentId) : null,
            tenantId: sTenant
          });
        }
      }

      // 15. Merge item location mappings
      if (Array.isArray(itemLocations) && itemLocations.length > 0) {
        for (const sMap of itemLocations) {
          const mapId = sMap.id ? String(sMap.id) : `map-${sMap.itemId}-${sMap.locationId}`;
          const sTenant = sMap.tenantId || activeTenantId;
          const itemId = String(sMap.itemId);
          const locationId = String(sMap.locationId);

          const existingMap = await db.itemLocations.get(mapId);
          if (existingMap && pendingSyncLocMapIds.has(mapId)) {
            const maxQty = Math.max(Number(existingMap.quantity) || 0, Number(sMap.quantity) || 0);
            await db.itemLocations.update(mapId, {
              ...sMap,
              id: mapId,
              tenantId: sTenant,
              itemId,
              locationId,
              quantity: maxQty
            });
          } else {
            await db.itemLocations.put({
              ...sMap,
              id: mapId,
              tenantId: sTenant,
              itemId,
              locationId,
              quantity: Number(sMap.quantity) || 0
            });
          }
        }
      }

      // 16. Merge stock transfers (Idempotent put by UUID)
      if (Array.isArray(stockTransfers) && stockTransfers.length > 0) {
        for (const sTrf of stockTransfers) {
          const trfId = sTrf.id ? String(sTrf.id) : `trf-${Date.now()}`;
          const trfNum = sTrf.transferNumber || sTrf.transfer_number || `TRF-${Date.now()}`;
          const sTenant = sTrf.tenantId || activeTenantId;

          await db.stockTransfers.put({
            ...sTrf,
            id: trfId,
            transferNumber: trfNum,
            tenantId: sTenant,
            sourceLocationId: String(sTrf.sourceLocationId || sTrf.source_location_id),
            destinationLocationId: String(sTrf.destinationLocationId || sTrf.destination_location_id),
            itemId: String(sTrf.itemId || sTrf.item_id),
            quantity: Number(sTrf.quantity) || 1,
            transferDate: sTrf.transferDate || sTrf.transfer_date || new Date().toISOString().split('T')[0]
          });
        }
      }

      // 17. Merge store warehouse access links
      if (Array.isArray(storeWarehouseAccess) && storeWarehouseAccess.length > 0) {
        for (const sAcc of storeWarehouseAccess) {
          const accId = sAcc.id ? String(sAcc.id) : `access-${sAcc.storeId}-${sAcc.warehouseId}`;
          const sTenant = sAcc.tenantId || activeTenantId;
          await db.storeWarehouseAccess.put({
            ...sAcc,
            id: accId,
            tenantId: sTenant,
            storeId: String(sAcc.storeId),
            warehouseId: String(sAcc.warehouseId)
          });
        }
      }

      // 17. Server Deletion Reconciliation: Purge local records for active store tenant if deleted on server
      try {
        const pendingJournal = await db.syncJournal.toArray();
        const pendingIdsByTable = new Map<string, Set<string>>();
        const pendingKeysByTable = new Map<string, Set<string>>();
        
        for (const j of pendingJournal) {
          if (!j.synced) {
            const tableKey = j.entityType;
            if (!pendingIdsByTable.has(tableKey)) pendingIdsByTable.set(tableKey, new Set());
            if (!pendingKeysByTable.has(tableKey)) pendingKeysByTable.set(tableKey, new Set());
            
            pendingIdsByTable.get(tableKey)!.add(String(j.entityId));
            try {
              const p = typeof j.payload === 'string' ? JSON.parse(j.payload) : j.payload;
              if (p?.id) pendingIdsByTable.get(tableKey)!.add(String(p.id));
              if (p?.skuCode) pendingKeysByTable.get(tableKey)!.add(String(p.skuCode).trim().toLowerCase());
              if (p?.name) pendingKeysByTable.get(tableKey)!.add(String(p.name).trim().toLowerCase());
            } catch {}
          }
        }

        // Reconcile Items
        if (Array.isArray(items)) {
          const sSkus = new Set(items.map(i => (i.skuCode || '').trim().toLowerCase()).filter(Boolean));
          const sNames = new Set(items.map(i => (i.name || '').trim().toLowerCase()).filter(Boolean));
          const pendingItemIds = pendingIdsByTable.get('ITEM') || new Set();
          const pendingItemKeys = pendingKeysByTable.get('ITEM') || new Set();

          const localItems = await db.items.filter(i => (i.tenantId || 'default-tenant') === activeTenantId).toArray();
          const staleItemIds = localItems
            .filter(i => {
              if (!i.id) return false;
              if (pendingItemIds.has(String(i.id))) return false;
              const sku = (i.skuCode || '').trim().toLowerCase();
              const name = (i.name || '').trim().toLowerCase();
              if (sku && pendingItemKeys.has(sku)) return false;
              if (name && pendingItemKeys.has(name)) return false;

              const inSkus = sku && sSkus.has(sku);
              const inNames = name && sNames.has(name);
              return !inSkus && !inNames;
            })
            .map(i => Number(i.id));

          if (staleItemIds.length > 0) {
            await db.items.bulkDelete(staleItemIds);
          }
        }

        // Reconcile Parties
        if (Array.isArray(parties)) {
          const sPartyNames = new Set(parties.map(p => (p.name || '').trim().toLowerCase()).filter(Boolean));
          const pendingPartyIds = pendingIdsByTable.get('PARTY') || new Set();

          const localParties = await db.parties.filter(p => (p.tenantId || 'default-tenant') === activeTenantId).toArray();
          const stalePartyIds = localParties
            .filter(p => {
              if (!p.id) return false;
              if (pendingPartyIds.has(String(p.id))) return false;
              const pName = (p.name || '').trim().toLowerCase();
              if (pName === 'walk-in customer' || pName === 'walk-in retail customer') return false;
              return pName && !sPartyNames.has(pName);
            })
            .map(p => Number(p.id));

          if (stalePartyIds.length > 0) {
            await db.parties.bulkDelete(stalePartyIds);
          }
        }

        // Reconcile Invoices
        if (Array.isArray(invoices)) {
          const sInvNums = new Set(invoices.map(i => (i.invoiceNumber || i.invoice_number || '').trim().toLowerCase()).filter(Boolean));
          const sInvIds = new Set(invoices.map(i => (i.invoiceId || i.invoice_id || '').trim().toLowerCase()).filter(Boolean));
          const pendingInvIds = pendingIdsByTable.get('INVOICE') || new Set();

          const localInvoices = await db.invoices.filter(i => (i.tenantId || 'default-tenant') === activeTenantId).toArray();
          const staleInvIds = localInvoices
            .filter(i => {
              if (!i.id) return false;
              if (pendingInvIds.has(String(i.id))) return false;
              const num = (i.invoiceNumber || '').trim().toLowerCase();
              const idStr = (i.invoiceId || '').trim().toLowerCase();
              const inNums = num && sInvNums.has(num);
              const inIds = idStr && sInvIds.has(idStr);
              return !inNums && !inIds;
            })
            .map(i => Number(i.id));

          if (staleInvIds.length > 0) {
            await db.invoices.bulkDelete(staleInvIds);
          }
        }
      } catch (reconcileErr) {
        console.warn('Deletion reconciliation error during pull:', reconcileErr);
      }

      // Automatically purge local duplicates & cross-tenant leaks after pulling server changes
      await deduplicateLocalDatabase();
    } catch (err) {
      console.warn('Error pulling server changes:', err);
    }
  }
}

/**
 * Scans all Dexie IndexedDB tables and purges duplicate rows per store tenant
 * and purges cross-tenant leaked records (copied mistakenly across store tenants)
 */
export async function deduplicateLocalDatabase() {
  try {
    // 0. Purge Cross-Tenant Leaked Cash Transactions, Payments & Expenses
    const allCashTxns = await db.cashTransactions.toArray();
    const primaryCashRefTenants = new Map<string, string>(); // refId -> primary tenantId
    const leakedCashTxIds: number[] = [];

    // Find primary owner tenant for each transaction referenceId
    for (const ct of allCashTxns) {
      const ref = ct.referenceId;
      const tId = ct.tenantId || 'default-tenant';
      if (ref && !primaryCashRefTenants.has(ref)) {
        primaryCashRefTenants.set(ref, tId);
      }
    }

    // Purge rows with same referenceId in secondary tenants
    for (const ct of allCashTxns) {
      const ref = ct.referenceId;
      const tId = ct.tenantId || 'default-tenant';
      if (ref && primaryCashRefTenants.has(ref)) {
        const ownerTenant = primaryCashRefTenants.get(ref);
        if (ownerTenant && ownerTenant !== tId && ct.id) {
          leakedCashTxIds.push(Number(ct.id));
        }
      }
    }
    if (leakedCashTxIds.length > 0) {
      await db.cashTransactions.bulkDelete(leakedCashTxIds);
    }

    // Purge Cross-Tenant Leaked PaymentOut vouchers
    const allPayOuts = await db.paymentOut.toArray();
    const primaryPayOutRefTenants = new Map<string, string>();
    const leakedPayOutIds: number[] = [];

    for (const po of allPayOuts) {
      const ref = po.receiptNumber;
      const tId = po.tenantId || 'default-tenant';
      if (ref && !primaryPayOutRefTenants.has(ref)) {
        primaryPayOutRefTenants.set(ref, tId);
      }
    }
    for (const po of allPayOuts) {
      const ref = po.receiptNumber;
      const tId = po.tenantId || 'default-tenant';
      if (ref && primaryPayOutRefTenants.has(ref)) {
        const ownerTenant = primaryPayOutRefTenants.get(ref);
        if (ownerTenant && ownerTenant !== tId && po.id) {
          leakedPayOutIds.push(Number(po.id));
        }
      }
    }
    if (leakedPayOutIds.length > 0) {
      await db.paymentOut.bulkDelete(leakedPayOutIds);
    }

    // 1. Deduplicate Items by (tenantId, skuCode) or (tenantId, name)
    const items = await db.items.toArray();
    const seenItems = new Set<string>();
    const dupItemIds: number[] = [];
    const skuToOwnerTenant = new Map<string, string>();

    for (const item of items) {
      const tId = item.tenantId || 'default-tenant';
      const keySku = item.skuCode && item.skuCode.trim() ? item.skuCode.trim().toLowerCase() : null;

      if (keySku && !skuToOwnerTenant.has(keySku)) {
        skuToOwnerTenant.set(keySku, tId);
      }

      const primaryKey = keySku ? `${tId}_sku_${keySku}` : item.name ? `${tId}_name_${item.name.trim().toLowerCase()}` : null;
      if (primaryKey && seenItems.has(primaryKey)) {
        if (item.id) dupItemIds.push(Number(item.id));
      } else if (primaryKey) {
        seenItems.add(primaryKey);
      }
    }
    if (dupItemIds.length > 0) await db.items.bulkDelete(dupItemIds);

    // 2. Deduplicate Parties by (tenantId, name)
    const parties = await db.parties.toArray();
    const seenParties = new Set<string>();
    const dupPartyIds: number[] = [];
    for (const party of parties) {
      const tId = party.tenantId || 'default-tenant';
      const key = `${tId}_${(party.name || '').trim().toLowerCase()}`;
      if (seenParties.has(key)) {
        if (party.id) dupPartyIds.push(Number(party.id));
      } else {
        seenParties.add(key);
      }
    }
    if (dupPartyIds.length > 0) await db.parties.bulkDelete(dupPartyIds);

    // 3. Deduplicate Invoices by (tenantId, invoiceNumber) or (tenantId, invoiceId)
    const invoices = await db.invoices.toArray();
    const seenInvoices = new Set<string>();
    const dupInvIds: number[] = [];
    for (const inv of invoices) {
      const tId = inv.tenantId || 'default-tenant';
      const keyNum = inv.invoiceNumber ? `${tId}_num_${inv.invoiceNumber.trim().toLowerCase()}` : null;
      const keyId = inv.invoiceId ? `${tId}_id_${inv.invoiceId.trim().toLowerCase()}` : null;
      const key = keyNum || keyId;
      if (key && seenInvoices.has(key)) {
        if (inv.id) dupInvIds.push(Number(inv.id));
      } else if (key) {
        seenInvoices.add(key);
        if (keyNum && keyId) seenInvoices.add(keyId);
      }
    }
    if (dupInvIds.length > 0) await db.invoices.bulkDelete(dupInvIds);

    // 4. Deduplicate Cash Accounts by (tenantId, name)
    const cashAccs = await db.cashAccounts.toArray();
    const seenCashAccs = new Set<string>();
    const dupCashAccIds: number[] = [];
    for (const acc of cashAccs) {
      const tId = acc.tenantId || 'default-tenant';
      const key = `${tId}_${(acc.name || '').trim().toLowerCase()}`;
      if (seenCashAccs.has(key)) {
        if (acc.id) dupCashAccIds.push(Number(acc.id));
      } else {
        seenCashAccs.add(key);
      }
    }
    if (dupCashAccIds.length > 0) await db.cashAccounts.bulkDelete(dupCashAccIds);

    // 5. Deduplicate Item Location Mappings by (tenantId, itemId/skuCode, locationId)
    const mappings = await db.itemLocations.toArray();
    const allLocalItems = await db.items.toArray();
    const itemSkuMap = new Map<number, string>();
    allLocalItems.forEach(i => {
      if (i.id && i.skuCode) itemSkuMap.set(Number(i.id), i.skuCode.trim().toLowerCase());
      if ((i as any).cloudId && i.skuCode) itemSkuMap.set(Number((i as any).cloudId), i.skuCode.trim().toLowerCase());
    });

    const seenMappings = new Set<string>();
    const dupMappingIds: number[] = [];

    for (const m of mappings) {
      const tId = m.tenantId || 'default-tenant';
      const sku = (m as any).skuCode ? String((m as any).skuCode).trim().toLowerCase() : itemSkuMap.get(Number(m.itemId));
      const productKey = sku ? `sku_${sku}` : `item_${m.itemId}`;
      const key = `${tId}_${productKey}_loc_${m.locationId}`;

      if (seenMappings.has(key)) {
        if (m.id) dupMappingIds.push(Number(m.id));
      } else {
        seenMappings.add(key);
      }
    }
    if (dupMappingIds.length > 0) await db.itemLocations.bulkDelete(dupMappingIds);

    // 6. Purge Orphaned Item Location Mappings (referencing non-existent locations)
    const validLocations = new Set((await db.locations.toArray()).map(l => Number(l.id)));
    const orphanMappingIds = mappings
      .filter(m => m.id && !validLocations.has(Number(m.locationId)))
      .map(m => Number(m.id));
    if (orphanMappingIds.length > 0) {
      await db.itemLocations.bulkDelete(orphanMappingIds);
    }
  } catch (err) {
    console.warn('Error during local database deduplication:', err);
  }
}

/**
 * Deletes obsolete sync journal records where synced === true to keep IndexedDB lean.
 */
export async function pruneSyncedJournalEntries() {
  try {
    const syncedRecords = await db.syncJournal.filter(j => j.synced === true).toArray();
    const idsToDelete = syncedRecords.map(j => j.id!).filter(Boolean);
    if (idsToDelete.length > 0) {
      await db.syncJournal.bulkDelete(idsToDelete);
    }
  } catch (err) {
    console.warn('Failed to prune synced journal entries:', err);
  }
}

export const syncManager = new ClientSyncManager();

