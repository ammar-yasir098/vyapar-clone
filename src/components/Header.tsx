import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  ChevronDown, 
  RefreshCw, 
  Cloud, 
  Clock, 
  PhoneCall
} from 'lucide-react';
import { BusinessDetails } from '../types';
import { syncManager, SyncStatus } from '../services/sync';

interface HeaderProps {
  business: BusinessDetails;
  itemCount: number;
  invoiceCount: number;
  activeTab: string;
  onNavigateToTab: (tab: string) => void;
  onOpenCommandPalette: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  business,
  itemCount,
  invoiceCount,
  activeTab,
  onNavigateToTab,
  onOpenCommandPalette
}) => {
  const [time, setTime] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: true,
    pendingCount: 0,
    isSyncing: false
  });

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    update();
    const interval = setInterval(update, 1000);
    const unsubscribe = syncManager.subscribe(setSyncStatus);

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  return (
    <header className="h-14 bg-white border-b border-slate-200/80 px-4 flex items-center justify-between shrink-0 select-none shadow-xs z-20">
      {/* Left: Brand / Store Name & Search Bar */}
      <div className="flex items-center gap-5">
        {/* Official Vyapar Gradient Logo Badge */}
        <div 
          className="flex items-center gap-2.5 cursor-pointer group" 
          onClick={() => onNavigateToTab('home')}
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-600 to-amber-500 flex items-center justify-center text-white font-extrabold text-base shadow-sm shadow-red-500/20 group-hover:scale-105 transition-transform">
            V
          </div>
          <div>
            <div className="flex items-center gap-1">
              <span className="font-extrabold text-xs sm:text-sm text-slate-900 tracking-tight leading-none">
                {business.name}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-colors" />
            </div>
            <span className="text-[10px] text-slate-600 font-bold tracking-wide mt-0.5 block">
              {business.gstin}
            </span>
          </div>
        </div>

        {/* Vyapar Search "Open Anything (Ctrl+F)" */}
        <div 
          onClick={onOpenCommandPalette}
          className="hidden md:flex items-center relative w-64 cursor-pointer group"
        >
          <input
            type="text"
            readOnly
            placeholder="Search items, bills, parties (Ctrl+F)..."
            className="w-full h-8 pl-8 pr-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 group-hover:border-blue-400 rounded-lg text-xs font-semibold text-slate-800 outline-none cursor-pointer transition placeholder:text-slate-500 placeholder:font-medium"
          />
          <Search className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-600 absolute left-2.5 top-2.5 transition-colors" />
        </div>
      </div>

      {/* Center Top Quick Action Buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onNavigateToTab('pos')}
          className="btn-vyapar-red flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 stroke-[3]" />
          <span>+ Add Sale</span>
        </button>

        <button
          onClick={() => onNavigateToTab('purchase')}
          className="btn-vyapar-blue flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 stroke-[3]" />
          <span>+ Add Purchase</span>
        </button>

        <button
          onClick={() => onNavigateToTab('parties')}
          className="btn-vyapar-outline flex items-center gap-1.5 cursor-pointer hidden sm:flex"
        >
          <Plus className="w-3.5 h-3.5 stroke-[3]" />
          <span>+ Add Party</span>
        </button>
      </div>

      {/* Right: Support, Cloud Sync & Clock */}
      <div className="flex items-center gap-3">
        <div className="hidden xl:flex items-center gap-1.5 text-xs text-slate-700 font-semibold bg-slate-50 px-3 py-1 rounded-full border border-slate-200">
          <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
          <span>Support: <strong className="text-slate-900 font-bold">+92 300 1234567</strong></span>
        </div>

        {/* Cloud Sync Status */}
        <button
          onClick={() => syncManager.triggerSync()}
          className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border transition cursor-pointer ${
            syncStatus.isSyncing
              ? 'bg-amber-50 text-amber-800 border-amber-300'
              : syncStatus.pendingCount > 0
              ? 'bg-blue-50 text-blue-800 border-blue-300'
              : 'bg-emerald-50 text-emerald-800 border-emerald-300'
          }`}
          title="Click to force sync"
        >
          {syncStatus.isSyncing ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600" />
              <span>Syncing...</span>
            </>
          ) : syncStatus.pendingCount > 0 ? (
            <>
              <Cloud className="w-3.5 h-3.5 text-blue-600" />
              <span>{syncStatus.pendingCount} Pending</span>
            </>
          ) : (
            <>
              <Cloud className="w-3.5 h-3.5 text-emerald-600" />
              <span>Cloud Synced</span>
            </>
          )}
        </button>

        {/* Clock */}
        <div className="font-mono text-xs text-slate-800 font-bold bg-slate-100/80 px-2.5 py-1 rounded-md border border-slate-200/80 flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          <span>{time}</span>
        </div>
      </div>
    </header>
  );
};
