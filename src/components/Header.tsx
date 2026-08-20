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
  Trash2,
  LogOut,
  User as UserIcon
} from 'lucide-react';
import { BusinessDetails } from '../types';
import { syncManager, SyncStatus } from '../services/sync';

interface HeaderProps {
  business: BusinessDetails;
  companies?: BusinessDetails[];
  currentTenantId?: string;
  userSession?: { fullName: string; email: string; role?: string } | null;
  itemCount: number;
  invoiceCount: number;
  activeTab: string;
  onNavigateToTab: (tab: string) => void;
  onOpenCommandPalette: () => void;
  onOpenSyncModal: () => void;
  onSelectCompany?: (tenantId: string) => void;
  onCreateCompany?: (newCompany: Partial<BusinessDetails>) => void;
  onDeleteCompany?: (tenantId: string, companyName: string) => void;
  onSignOut?: () => void;
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
  onDeleteCompany,
  userSession,
  onSignOut
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
    <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0 select-none z-30 relative" style={{ boxShadow: '0 1px 0 0 #e2e8f0, 0 2px 8px -1px rgba(0,0,0,0.06)' }}>
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
                        {onDeleteCompany && (
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

                {userSession && (
                  <div className="pt-2 border-t border-slate-100 mt-1 flex flex-col gap-1.5">
                    <div className="px-3 py-2 bg-slate-50 rounded-xl flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <div className="text-xs font-bold text-slate-900 truncate">{userSession.fullName || 'User'}</div>
                        <div className="text-[10px] text-slate-500 font-mono truncate">{userSession.email}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsDropdownOpen(false);
                          if (onSignOut) onSignOut();
                        }}
                        className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[11px] font-extrabold rounded-lg transition flex items-center gap-1 cursor-pointer shrink-0 border border-rose-200/60"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Search */}
        <div
          onClick={onOpenCommandPalette}
          className="hidden md:flex items-center relative cursor-pointer group"
          style={{ width: '260px' }}
        >
          <input
            type="text"
            readOnly
            placeholder="Search items, bills, parties (Ctrl+F)..."
            className="w-full cursor-pointer outline-none transition"
            style={{
              height: '34px', paddingLeft: '34px', paddingRight: '12px',
              background: '#f8fafc', border: '1.5px solid #e2e8f0',
              borderRadius: '10px', fontSize: '12px', fontWeight: 500,
              color: '#334155', fontFamily: 'inherit',
            }}
            onMouseEnter={e => { (e.target as HTMLInputElement).style.borderColor = '#3b82f6'; (e.target as HTMLInputElement).style.background = '#fff'; }}
            onMouseLeave={e => { (e.target as HTMLInputElement).style.borderColor = '#e2e8f0'; (e.target as HTMLInputElement).style.background = '#f8fafc'; }}
          />
          <Search className="w-3.5 h-3.5 absolute left-2.5" style={{ top: '10px', color: '#94a3b8' }} />
          <kbd className="absolute right-2.5 text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded" style={{ top: '8px' }}>⌘F</kbd>
        </div>
      </div>

      {/* CTA Buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onNavigateToTab('pos')}
          className="btn-vyapar-red cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 stroke-[3]" />
          + Add Sale
        </button>

        <button
          onClick={() => onNavigateToTab('purchase')}
          className="btn-vyapar-blue cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 stroke-[3]" />
          + Add Purchase
        </button>

        <button
          onClick={() => onNavigateToTab('parties')}
          className="btn-vyapar-outline cursor-pointer hidden sm:flex"
        >
          <Plus className="w-3.5 h-3.5 stroke-[3]" />
          + Add Party
        </button>
      </div>

      {/* Right: Support · Sync · Clock · User */}
      <div className="flex items-center gap-2.5">
        {/* Support number */}
        <div
          className="hidden xl:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
          style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}
        >
          <PhoneCall className="w-3.5 h-3.5" style={{ color: '#16a34a' }} />
          <span>Support: <strong>+92 300 xxxxxxx</strong></span>
        </div>

        {/* Cloud Sync */}
        <button
          onClick={onOpenSyncModal}
          title="Click to force sync"
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition cursor-pointer"
          style={{
            background: syncStatus.isSyncing ? '#fffbeb' : syncStatus.pendingCount > 0 ? '#eff6ff' : '#f0fdf4',
            color:      syncStatus.isSyncing ? '#92400e' : syncStatus.pendingCount > 0 ? '#1e40af' : '#166534',
            borderColor: syncStatus.isSyncing ? '#fcd34d' : syncStatus.pendingCount > 0 ? '#bfdbfe' : '#bbf7d0',
          }}
        >
          {syncStatus.isSyncing ? (
            <><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span>Syncing...</span></>
          ) : syncStatus.pendingCount > 0 ? (
            <><Cloud className="w-3.5 h-3.5" /><span>{syncStatus.pendingCount} Pending</span></>
          ) : (
            <><Cloud className="w-3.5 h-3.5" /><span>Cloud Synced</span></>
          )}
        </button>

        {/* Clock */}
        <div
          className="font-mono text-xs font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#334155' }}
        >
          <Clock className="w-3.5 h-3.5" style={{ color: '#94a3b8' }} />
          <span>{time}</span>
        </div>

        {/* User chip */}
        {userSession && (
          <div className="hidden lg:flex items-center gap-1.5" style={{ paddingLeft: '6px', borderLeft: '1px solid #e2e8f0' }}>
            <div
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-bold cursor-default"
              style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#1e293b' }}
              title={userSession.email}
            >
              <div
                className="w-5 h-5 rounded-lg flex items-center justify-center text-white font-black text-[10px] shrink-0"
                style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}
              >
                {(userSession.fullName || userSession.email).charAt(0).toUpperCase()}
              </div>
              <span className="max-w-[100px] truncate">{userSession.fullName || userSession.email}</span>
            </div>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                title="Sign Out"
                className="w-8 h-8 flex items-center justify-center rounded-xl transition cursor-pointer"
                style={{ color: '#94a3b8' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff1f2'; (e.currentTarget as HTMLButtonElement).style.color = '#e53e3e'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'; }}
              >
                <LogOut className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            )}
          </div>
        )}
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
