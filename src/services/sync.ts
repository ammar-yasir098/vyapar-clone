import { db } from '../db';
import { SyncJournal } from '../types';

const SYNC_SERVER_URL = 'http://localhost:5000/api/v1/sync';

export interface SyncStatus {
  isOnline: boolean;
  pendingCount: number;
  lastSyncedAt?: string;
  isSyncing: boolean;
  serverVersion?: number;
}

type Listener = (status: SyncStatus) => void;

class ClientSyncManager {
  private isSyncing = false;
  private lastSyncedAt?: string;
  private listeners: Set<Listener> = new Set();

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
  /**
   * Logs a local mutation to the sync journal queue.
   */
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
  public async triggerSync(targetTenantId?: string) {
    const activeTenantId = targetTenantId || (typeof localStorage !== 'undefined' ? localStorage.getItem('vyapar_current_tenant') : null) || 'default-tenant';
    if (this.isSyncing || (typeof navigator !== 'undefined' && !navigator.onLine)) return;

    this.isSyncing = true;
    this.notify();

    try {
      let unsynced = await db.syncJournal.filter(record => !record.synced).toArray();

      // If sync journal is empty, auto-queue all current local records for cloud sync
      if (unsynced.length === 0) {
        const tId = activeTenantId;
        const localItems = await db.items.filter(i => i.tenantId === tId).toArray();
        const localParties = await db.parties.filter(p => (p.tenantId || 'default-tenant') === tId).toArray();
        const localInvoices = await db.invoices.filter(inv => (inv.tenantId || 'default-tenant') === tId).toArray();

        for (const item of localItems) {
          if (item.id) {
            await db.syncJournal.add({
              versionId: `client-v-${Date.now()}-item-${item.id}`,
              clientSequence: Date.now(),
              entityType: 'ITEM',
              entityId: String(item.id),
              mutationType: 'INSERT',
              payload: JSON.stringify(item),
              timestamp: new Date().toISOString(),
              synced: false
            });
          }
        }

        for (const party of localParties) {
          if (party.id) {
            await db.syncJournal.add({
              versionId: `client-v-${Date.now()}-party-${party.id}`,
              clientSequence: Date.now(),
              entityType: 'PARTY',
              entityId: String(party.id),
              mutationType: 'INSERT',
              payload: JSON.stringify(party),
              timestamp: new Date().toISOString(),
              synced: false
            });
          }
        }

        for (const inv of localInvoices) {
          if (inv.id || inv.invoiceId) {
            await db.syncJournal.add({
              versionId: `client-v-${Date.now()}-inv-${inv.id || inv.invoiceId}`,
              clientSequence: Date.now(),
              entityType: 'INVOICE',
              entityId: String(inv.id || inv.invoiceId),
              mutationType: 'INSERT',
              payload: JSON.stringify(inv),
              timestamp: new Date().toISOString(),
              synced: false
            });
          }
        }

        const localJournals = await db.journalEntries.filter(j => (j.tenantId || 'default-tenant') === tId).toArray();
        for (const je of localJournals) {
          if (je.id || je.entryNumber) {
            await db.syncJournal.add({
              versionId: `client-v-${Date.now()}-je-${je.id || je.entryNumber}`,
              clientSequence: Date.now(),
              entityType: 'JOURNAL',
              entityId: String(je.id || je.entryNumber),
              mutationType: 'INSERT',
              payload: JSON.stringify(je),
              timestamp: new Date().toISOString(),
              synced: false
            });
          }
        }

        const localEstimates = await db.estimates.filter(e => (e.tenantId || 'default-tenant') === tId).toArray();
        for (const est of localEstimates) {
          if (est.id || est.estimateId) {
            await db.syncJournal.add({
              versionId: `client-v-${Date.now()}-est-${est.id || est.estimateId}`,
              clientSequence: Date.now(),
              entityType: 'ESTIMATE',
              entityId: String(est.id || est.estimateId),
              mutationType: 'INSERT',
              payload: JSON.stringify(est),
              timestamp: new Date().toISOString(),
              synced: false
            });
          }
        }

        const localPaymentsIn = await db.paymentIn.filter(p => (p.tenantId || 'default-tenant') === tId).toArray();
        for (const payIn of localPaymentsIn) {
          if (payIn.id || payIn.receiptNumber) {
            await db.syncJournal.add({
              versionId: `client-v-${Date.now()}-payin-${payIn.id || payIn.receiptNumber}`,
              clientSequence: Date.now(),
              entityType: 'PAYMENT_IN',
              entityId: String(payIn.id || payIn.receiptNumber),
              mutationType: 'INSERT',
              payload: JSON.stringify(payIn),
              timestamp: new Date().toISOString(),
              synced: false
            });
          }
        }

        const localPOs = await db.purchaseOrders.filter(po => (po.tenantId || 'default-tenant') === tId).toArray();
        for (const po of localPOs) {
          if (po.id || po.poId) {
            await db.syncJournal.add({
              versionId: `client-v-${Date.now()}-po-${po.id || po.poId}`,
              clientSequence: Date.now(),
              entityType: 'PURCHASE_ORDER',
              entityId: String(po.id || po.poId),
              mutationType: 'INSERT',
              payload: JSON.stringify(po),
              timestamp: new Date().toISOString(),
              synced: false
            });
          }
        }

        const localBills = await db.purchaseBills.filter(b => (b.tenantId || 'default-tenant') === tId).toArray();
        for (const bill of localBills) {
          if (bill.id || bill.billId) {
            await db.syncJournal.add({
              versionId: `client-v-${Date.now()}-bill-${bill.id || bill.billId}`,
              clientSequence: Date.now(),
              entityType: 'PURCHASE_BILL',
              entityId: String(bill.id || bill.billId),
              mutationType: 'INSERT',
              payload: JSON.stringify(bill),
              timestamp: new Date().toISOString(),
              synced: false
            });
          }
        }

        const localPaymentsOut = await db.paymentOut.filter(p => (p.tenantId || 'default-tenant') === tId).toArray();
        for (const payOut of localPaymentsOut) {
          if (payOut.id || payOut.receiptNumber) {
            await db.syncJournal.add({
              versionId: `client-v-${Date.now()}-payout-${payOut.id || payOut.receiptNumber}`,
              clientSequence: Date.now(),
              entityType: 'PAYMENT_OUT',
              entityId: String(payOut.id || payOut.receiptNumber),
              mutationType: 'INSERT',
              payload: JSON.stringify(payOut),
              timestamp: new Date().toISOString(),
              synced: false
            });
          }
        }

        const localExpenses = await db.expenses.filter(e => (e.tenantId || 'default-tenant') === tId).toArray();
        for (const exp of localExpenses) {
          if (exp.id || exp.expenseNumber) {
            await db.syncJournal.add({
              versionId: `client-v-${Date.now()}-exp-${exp.id || exp.expenseNumber}`,
              clientSequence: Date.now(),
              entityType: 'EXPENSE',
              entityId: String(exp.id || exp.expenseNumber),
              mutationType: 'INSERT',
              payload: JSON.stringify(exp),
              timestamp: new Date().toISOString(),
              synced: false
            });
          }
        }

        const localReturns = await db.purchaseReturns.filter(r => (r.tenantId || 'default-tenant') === tId).toArray();
        for (const ret of localReturns) {
          if (ret.id || ret.returnId) {
            await db.syncJournal.add({
              versionId: `client-v-${Date.now()}-ret-${ret.id || ret.returnId}`,
              clientSequence: Date.now(),
              entityType: 'PURCHASE_RETURN',
              entityId: String(ret.id || ret.returnId),
              mutationType: 'INSERT',
              payload: JSON.stringify(ret),
              timestamp: new Date().toISOString(),
              synced: false
            });
          }
        }

        const localSaleReturns = await db.saleReturns.filter(sr => (sr.tenantId || 'default-tenant') === tId).toArray();
        for (const sret of localSaleReturns) {
          if (sret.id || sret.returnId) {
            await db.syncJournal.add({
              versionId: `client-v-${Date.now()}-saleret-${sret.id || sret.returnId}`,
              clientSequence: Date.now(),
              entityType: 'SALE_RETURN',
              entityId: String(sret.id || sret.returnId),
              mutationType: 'INSERT',
              payload: JSON.stringify(sret),
              timestamp: new Date().toISOString(),
              synced: false
            });
          }
        }

        const localCashAccs = await db.cashAccounts.filter(c => (c.tenantId || 'default-tenant') === tId).toArray();
        for (const cAcc of localCashAccs) {
          if (cAcc.id) {
            await db.syncJournal.add({
              versionId: `client-v-${Date.now()}-cashacc-${cAcc.id}`,
              clientSequence: Date.now(),
              entityType: 'CASH_ACCOUNT',
              entityId: String(cAcc.id),
              mutationType: 'INSERT',
              payload: JSON.stringify(cAcc),
              timestamp: new Date().toISOString(),
              synced: false
            });
          }
        }

        const localCashTxns = await db.cashTransactions.filter(ct => (ct.tenantId || 'default-tenant') === tId).toArray();
        for (const cTx of localCashTxns) {
          if (cTx.id || cTx.referenceId) {
            await db.syncJournal.add({
              versionId: `client-v-${Date.now()}-cashtx-${cTx.id || cTx.referenceId}`,
              clientSequence: Date.now(),
              entityType: 'CASH_TRANSACTION',
              entityId: String(cTx.id || cTx.referenceId),
              mutationType: 'INSERT',
              payload: JSON.stringify(cTx),
              timestamp: new Date().toISOString(),
              synced: false
            });
          }
        }

        // Re-fetch unsynced queue after auto-populating
        unsynced = await db.syncJournal.filter(record => !record.synced).toArray();
      }

      if (unsynced.length > 0) {
        const activeTenantId = targetTenantId || 'default-tenant';
        const response = await fetch(`${SYNC_SERVER_URL}/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId: activeTenantId,
            mutations: unsynced
          })
        });

        if (response.ok) {
          const resData = await response.json();
          
          // Mark local records as synced and prune obsolete journal records
          for (const item of unsynced) {
            if (item.id) {
              await db.syncJournal.update(item.id, { synced: true });
            }
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
