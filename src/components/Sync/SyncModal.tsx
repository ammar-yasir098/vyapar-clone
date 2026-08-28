import React, { useState, useEffect } from 'react';
import { Cloud, RefreshCw, Database, Server, CheckCircle2, AlertCircle, HardDrive, ArrowRight, ShieldCheck, FileText, Trash2 } from 'lucide-react';
import { db, clearAllDatabaseData } from '../../db';
import { syncManager, SyncStatus } from '../../services/sync';
import { SyncJournal } from '../../types';
import { useToast } from '../Common/ToastContext';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SyncModal: React.FC<SyncModalProps> = ({ isOpen, onClose }) => {
  const { showToast, showConfirm } = useToast();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: true,
    pendingCount: 0,
    isSyncing: false
  });
  const [pendingQueue, setPendingQueue] = useState<SyncJournal[]>([]);
  const [dbStats, setDbStats] = useState({ 
    items: 0, 
    parties: 0, 
    invoices: 0, 
    purchaseOrders: 0, 
    purchaseBills: 0, 
    expenses: 0, 
    purchaseReturns: 0,
    saleReturns: 0 
  });
  const [serverHealth, setServerHealth] = useState<{ status: string; version?: number } | null>(null);

  const refreshModalData = async () => {
    // 1. Fetch pending queue from local IndexedDB
    const unsynced = await db.syncJournal.filter(r => !r.synced).toArray();
    setPendingQueue(unsynced);

    // 2. Fetch local storage counts for all tables
    const itemsCount = await db.items.count();
    const partiesCount = await db.parties.count();
    const invoicesCount = await db.invoices.count();
    const poCount = await db.purchaseOrders.count();
    const billCount = await db.purchaseBills.count();
    const expenseCount = await db.expenses.count();
    const returnCount = await db.purchaseReturns.count();
    const saleReturnCount = await db.saleReturns.count();

    setDbStats({ 
      items: itemsCount, 
      parties: partiesCount, 
      invoices: invoicesCount, 
      purchaseOrders: poCount, 
      purchaseBills: billCount, 
      expenses: expenseCount, 
      purchaseReturns: returnCount,
      saleReturns: saleReturnCount
    });

    // 3. Ping PostgreSQL cloud server status
    try {
      const res = await fetch('http://localhost:5000/api/v1/sync/health');
      if (res.ok) {
        const json = await res.json();
        setServerHealth({ status: 'ONLINE', version: json.serverVersion });
      } else {
        setServerHealth({ status: 'OFFLINE' });
      }
    } catch {
      setServerHealth({ status: 'OFFLINE' });
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    refreshModalData();
    const unsubscribe = syncManager.subscribe((status) => {
      setSyncStatus(status);
      refreshModalData();
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen]);

  const handleManualSync = async () => {
    const activeTenant = localStorage.getItem('vyapar_current_tenant') || 'default-tenant';
    await syncManager.triggerSync(activeTenant);
    showToast('Cloud sync triggered successfully!', 'success');
    await refreshModalData();
  };

  const handleResetAllData = async () => {
    const activeTenant = localStorage.getItem('vyapar_current_tenant') || 'default-tenant';
    showConfirm({
      title: 'Reset Store & Inventory Data (Current User Store)',
      message: 'Are you sure you want to delete ALL operational store data (products, customers, invoices, bills, expenses) and ALL inventory data (warehouses, locations, shelves, storefront stocks, and stock transfers) for your active store account in IndexedDB and cloud PostgreSQL? Your User Account and Company Profile will be preserved.',
      type: 'danger',
      confirmText: 'Yes, Reset My Store Data',
      onConfirm: async () => {
        try {
          await clearAllDatabaseData(activeTenant);
        } catch (err: any) {
          showToast(`Reset failed: ${err.message}`, 'error');
        }
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4 px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
              <Cloud className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="font-extrabold text-base flex items-center gap-2">
                <span>Offline-First Cloud Sync Inspector</span>
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                Dual Storage Engine: IndexedDB (Local Disk) ↔ Express & PostgreSQL (Cloud)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white font-extrabold text-sm px-2.5 py-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-[#f8fafc]">
          {/* Storage Architecture Visual Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Local Client Storage (IndexedDB) */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2 font-bold text-xs text-slate-800">
                  <HardDrive className="w-4 h-4 text-emerald-600" />
                  <span>Local IndexedDB (`VyaparOfflineDB`)</span>
                </div>
                <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 font-bold">
                  Zero Latency
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5 font-mono text-center pt-1 text-xs">
                <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                  <div className="text-[9px] text-slate-500 font-sans">Products</div>
                  <div className="font-bold text-slate-900">{dbStats.items}</div>
                </div>
                <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                  <div className="text-[9px] text-slate-500 font-sans">Parties</div>
                  <div className="font-bold text-slate-900">{dbStats.parties}</div>
                </div>
                <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                  <div className="text-[9px] text-slate-500 font-sans">Invoices</div>
                  <div className="font-bold text-blue-600">{dbStats.invoices}</div>
                </div>
                <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                  <div className="text-[9px] text-slate-500 font-sans">Purchases</div>
                  <div className="font-bold text-emerald-600">{dbStats.purchaseBills + dbStats.purchaseOrders}</div>
                </div>
              </div>
            </div>

            {/* Cloud Storage (PostgreSQL Server) */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2 font-bold text-xs text-slate-800">
                  <Server className="w-4 h-4 text-blue-600" />
                  <span>Cloud DB (PostgreSQL `vyapar_db`)</span>
                </div>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${
                    serverHealth?.status === 'ONLINE'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}
                >
                  {serverHealth?.status === 'ONLINE' ? 'ONLINE (Port 5000)' : 'OFFLINE MODE'}
                </span>
              </div>
              <div className="text-xs text-slate-600 space-y-1 font-mono pt-1">
                <div className="flex justify-between">
                  <span>Server Version:</span>
                  <strong className="text-slate-900">v{serverHealth?.version || 1}</strong>
                </div>
                <div className="flex justify-between">
                  <span>REST API Endpoint:</span>
                  <strong className="text-blue-600">/api/v1/sync/push</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Offline Pending Queue Table */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-500" />
                <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider">
                  Pending Offline Sync Queue (`syncJournal`)
                </h4>
              </div>
              <span className="text-xs font-mono font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                {pendingQueue.length} Unsynced Delta Mutations
              </span>
            </div>

            {pendingQueue.length === 0 ? (
              <div className="py-8 text-center text-slate-400 space-y-1">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                <p className="text-xs font-bold text-slate-700">All local data is 100% reconciled with Cloud Database!</p>
                <p className="text-[11px] text-slate-400">Any new sales or items created offline will appear here in queue.</p>
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="vyapar-table">
                  <thead>
                    <tr>
                      <th>Mutation ID</th>
                      <th>Entity Type</th>
                      <th>Action</th>
                      <th>Timestamp</th>
                      <th>Sync Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingQueue.map(item => (
                      <tr key={item.id || item.versionId}>
                        <td className="font-mono text-[11px] text-blue-600 font-bold">{item.versionId}</td>
                        <td>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                            {item.entityType}
                          </span>
                        </td>
                        <td className="font-bold text-xs text-emerald-600">{item.mutationType}</td>
                        <td className="font-mono text-[11px] text-slate-500">{new Date(item.timestamp).toLocaleTimeString()}</td>
                        <td>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                            PENDING
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="bg-white border-t border-slate-200 p-4 px-6 flex items-center justify-between">
          <div className="text-xs text-slate-500 font-medium">
            {syncStatus.lastSyncedAt ? (
              <span>Last Synced At: <strong className="text-slate-800 font-mono font-bold">{syncStatus.lastSyncedAt}</strong></span>
            ) : (
              <span>Ready for delta synchronization</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleResetAllData}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 cursor-pointer flex items-center gap-1.5"
              title="Delete all items, bills, and party ledgers to start 100% fresh"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Reset All Data (Start Fresh)</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={handleManualSync}
              disabled={syncStatus.isSyncing || serverHealth?.status !== 'ONLINE'}
              className="btn-vyapar-blue text-xs font-extrabold flex items-center gap-2 px-5 py-2 cursor-pointer shadow-md disabled:opacity-50"
            >
              {syncStatus.isSyncing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Syncing to PostgreSQL...</span>
                </>
              ) : (
                <>
                  <Cloud className="w-4 h-4" />
                  <span>TRIGGER CLOUD SYNC NOW</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
