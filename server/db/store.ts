export interface ServerMutation {
  syncId: string;
  tenantId: string;
  versionId: string;
  clientSequence: number;
  entityType: string;
  entityId: string;
  mutationType: string;
  payload: any;
  timestamp: string;
}

// In-Memory Cloud Journal Store for instant development runtime
class CloudDataStore {
  private syncLogs: ServerMutation[] = [];
  private currentSequence = 1000;

  public pushMutations(tenantId: string, mutations: any[]): { syncedCount: number; serverVersion: number } {
    let count = 0;
    for (const m of mutations) {
      this.currentSequence++;
      const record: ServerMutation = {
        syncId: `srv-sync-${Date.now()}-${count}`,
        tenantId,
        versionId: `v-${this.currentSequence}`,
        clientSequence: this.currentSequence,
        entityType: m.entityType,
        entityId: m.entityId,
        mutationType: m.mutationType,
        payload: typeof m.payload === 'string' ? JSON.parse(m.payload) : m.payload,
        timestamp: new Date().toISOString()
      };

      this.syncLogs.push(record);
      count++;
    }

    return {
      syncedCount: count,
      serverVersion: this.currentSequence
    };
  }

  public getMutationsSince(tenantId: string, sinceSeq: number): ServerMutation[] {
    return this.syncLogs.filter(log => {
      if (log.clientSequence <= sinceSeq) return false;
      const isTenantMatch = log.tenantId === tenantId || log.tenantId === 'default-tenant' || tenantId === 'default-tenant';
      const isLocationEntity = log.entityType === 'LOCATION' || log.entityType === 'ITEM_LOCATION' || log.entityType === 'STOCK_TRANSFER' || log.entityType === 'STORE_WAREHOUSE_ACCESS';
      return isTenantMatch || isLocationEntity;
    });
  }

  public getLatestVersion(): number {
    return this.currentSequence;
  }

  public clear(): void {
    this.syncLogs = [];
    this.currentSequence = 1000;
  }

  public clearTenant(tenantId: string): void {
    this.syncLogs = this.syncLogs.filter(log => log.tenantId !== tenantId);
  }
}

export const cloudStore = new CloudDataStore();
