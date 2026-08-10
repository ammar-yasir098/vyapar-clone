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
  public async logMutation(
    entityType: 'INVOICE' | 'ITEM' | 'PARTY' | 'JOURNAL',
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
  public async triggerSync() {
    if (this.isSyncing || !navigator.onLine) return;

    this.isSyncing = true;
    this.notify();

    try {
      const unsynced = await db.syncJournal.filter(record => !record.synced).toArray();

      if (unsynced.length > 0) {
        const response = await fetch(`${SYNC_SERVER_URL}/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId: 'default-tenant',
            mutations: unsynced
          })
        });

        if (response.ok) {
          const resData = await response.json();
          
          // Mark local records as synced
          for (const item of unsynced) {
            if (item.id) {
              await db.syncJournal.update(item.id, { synced: true });
            }
          }

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

export const syncManager = new ClientSyncManager();
