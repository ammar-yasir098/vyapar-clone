import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Search, 
  ChevronDown, 
  RefreshCw, 
  Cloud, 
  Clock, 
  PhoneCall,
  Building2,
  Check,
  Store,
  X,
  Trash2
} from 'lucide-react';
import { BusinessDetails } from '../types';
import { syncManager, SyncStatus } from '../services/sync';

interface HeaderProps {
  business: BusinessDetails;
  companies?: BusinessDetails[];
  currentTenantId?: string;
  itemCount: number;
  invoiceCount: number;
  activeTab: string;
  onNavigateToTab: (tab: string) => void;
  onOpenCommandPalette: () => void;
  onOpenSyncModal: () => void;
  onSelectCompany?: (tenantId: string) => void;
  onCreateCompany?: (newCompany: Partial<BusinessDetails>) => void;
  onDeleteCompany?: (tenantId: string, companyName: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  business,
  companies = [],
  currentTenantId = '',
  itemCount,
  invoiceCount,
  activeTab,
  onNavigateToTab,
  onOpenCommandPalette,
  onOpenSyncModal,
  onSelectCompany,
  onCreateCompany,
  onDeleteCompany
}) => {
  const [time, setTime] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: true,
    pendingCount: 0,
    isSyncing: false
  });

  // New store form state
  const [newStore, setNewStore] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    gstin: '',
    businessType: 'Retail',
    businessCategory: 'Supermarket & FMCG'
  });

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    update();
    const interval = setInterval(update, 1000);
    const unsubscribe = syncManager.subscribe(setSyncStatus);

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      clearInterval(interval);
      unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const safeCompanies = companies.length > 0 ? companies : (business?.name ? [business] : []);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStore.name) return;

    if (onCreateCompany) {
      onCreateCompany(newStore);
    }
    setIsCreateModalOpen(false);
    setIsDropdownOpen(false);
    setNewStore({
      name: '',
      phone: '',
      email: '',
      address: '',
      gstin: '',
      businessType: 'Retail',
      businessCategory: 'Supermarket & FMCG'
    });
  };

  return (
    <header className="h-14 bg-white border-b border-slate-200/80 px-4 flex items-center justify-between shrink-0 select-none shadow-xs z-30 relative">
      {/* Left: Brand / Store Name & Search Bar */}
      <div className="flex items-center gap-5">
        {/* Business Selector Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2.5 px-2.5 py-1 rounded-xl hover:bg-slate-100/90 transition cursor-pointer text-left border border-transparent hover:border-slate-200"
          >
            {(() => {
              const offlineCached = localStorage.getItem('vyapar_offline_logo');
              const logoSrc = business.logoUrl?.startsWith('data:image/')
                ? business.logoUrl
                : (offlineCached || (business.logoUrl?.startsWith('/uploads/') ? `http://localhost:5000${business.logoUrl}` : business.logoUrl));
              return logoSrc ? (
                <img src={logoSrc} alt="Logo" className="w-8 h-8 rounded-lg object-cover border border-slate-200 shadow-xs shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-600 to-rose-700 text-white font-extrabold flex items-center justify-center text-sm shadow-sm shrink-0">
                  {business.name ? business.name.charAt(0).toUpperCase() : 'V'}
                </div>
              );
            })()}
            <div>
              <div className="flex items-center gap-1 font-bold text-slate-900 text-sm">
                <span className="max-w-[180px] truncate">{business.name}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </div>
              <div className="text-[10px] font-semibold text-slate-700 font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                <span>{business.gstin || 'NTN: 7654321-0'}</span>
              </div>
            </div>
          </button>

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <div className="absolute left-0 top-12 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-3.5 py-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-100 flex items-center justify-between">
                <span>Select Store / Branch</span>
                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-mono">{safeCompanies.length} Active</span>
              </div>

              <div className="max-h-60 overflow-y-auto py-1">
                {safeCompanies.map((c, idx) => {
                  const isSelected = (c.tenantId || 'default-tenant') === (currentTenantId || 'default-tenant') || c.name === business.name;
                  const cLogoUrl = c.logoUrl ? (c.logoUrl.startsWith('/uploads/') ? `http://localhost:5000${c.logoUrl}` : c.logoUrl) : null;
                  return (
                    <div
                      key={c.tenantId || idx}
                      onClick={() => {
                        if (onSelectCompany && c.tenantId) {
                          onSelectCompany(c.tenantId);
                        }
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50 transition cursor-pointer text-left ${
                        isSelected ? 'bg-blue-50/60 font-bold' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {cLogoUrl ? (
                          <img src={cLogoUrl} alt="" className="w-7 h-7 rounded-lg object-cover shrink-0 border border-slate-200" />
                        ) : (
                          <div className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {c.name ? c.name.charAt(0).toUpperCase() : 'S'}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className={`text-xs truncate ${isSelected ? 'text-blue-900 font-bold' : 'text-slate-800 font-semibold'}`}>
                            {c.name}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {c.gstin || c.phone || 'Branch Account'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                        {onDeleteCompany && safeCompanies.length > 1 && (
                          <button
                            type="button"
                            title={`Delete Store "${c.name}"`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsDropdownOpen(false);
                              if (c.tenantId) {
                                onDeleteCompany(c.tenantId, c.name);
                              }
                            }}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-2 border-t border-slate-100 gap-1.5 flex flex-col">
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    setIsCreateModalOpen(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add New Store / Branch</span>
                </button>

                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onNavigateToTab('company');
                  }}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Edit Company Details</span>
                </button>
              </div>
            </div>
          )}
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
          <span>Support: <strong className="text-slate-900 font-bold">+92 300 xxxxxxx</strong></span>
        </div>

        {/* Cloud Sync Status */}
        <button
          onClick={onOpenSyncModal}
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

      {/* CREATE NEW COMPANY MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Add New Store / Branch</h3>
                  <p className="text-xs text-slate-500">Create a new company profile in your POS</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Store / Business Name *</label>
                <input
                  type="text"
                  required
                  value={newStore.name}
                  onChange={(e) => setNewStore({ ...newStore, name: e.target.value })}
                  placeholder="e.g. Metro FMCG & Mart - Branch 2"
                  className="w-full h-9 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:bg-white focus:border-blue-600 outline-none transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={newStore.phone}
                    onChange={(e) => setNewStore({ ...newStore, phone: e.target.value })}
                    placeholder="+92 300 xxxxxxx"
                    className="w-full h-9 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:bg-white focus:border-blue-600 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">NTN / GSTIN</label>
                  <input
                    type="text"
                    value={newStore.gstin}
                    onChange={(e) => setNewStore({ ...newStore, gstin: e.target.value })}
                    placeholder="NTN: 1234567-8"
                    className="w-full h-9 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:bg-white focus:border-blue-600 outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={newStore.email}
                  onChange={(e) => setNewStore({ ...newStore, email: e.target.value })}
                  placeholder="store@business.com"
                  className="w-full h-9 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:bg-white focus:border-blue-600 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Store Address</label>
                <textarea
                  rows={2}
                  value={newStore.address}
                  onChange={(e) => setNewStore({ ...newStore, address: e.target.value })}
                  placeholder="Complete shop address..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:bg-white focus:border-blue-600 outline-none transition resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  Create & Switch Store
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};
