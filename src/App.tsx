import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Building2, Store, MapPin } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seedDatabaseIfEmpty, seedWalkInCustomerForTenant, DEFAULT_BUSINESS } from './db';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DashboardScreen } from './components/Dashboard/DashboardScreen';
import { BillingScreen } from './components/POS/BillingScreen';
import { InventoryScreen } from './components/Inventory/InventoryScreen';
import { LocationScreen } from './components/Inventory/LocationScreen';
import { StoreStockScreen } from './components/Inventory/StoreStockScreen';
import { PartiesScreen } from './components/Parties/PartiesScreen';
import { PurchaseScreen } from './components/Purchase/PurchaseScreen';
import { InvoicesScreen } from './components/Invoices/InvoicesScreen';
import { GSTComplianceScreen } from './components/GST/GSTComplianceScreen';
import { ReportsScreen } from './components/Reports/ReportsScreen';
import { PrinterModal } from './components/Printer/PrinterModal';
import { CommandPaletteModal } from './components/CommandPalette/CommandPaletteModal';
import { SyncModal } from './components/Sync/SyncModal';
import { EditProfileScreen } from './components/Company/EditProfileScreen';
import { EstimateListScreen } from './components/Estimate/EstimateListScreen';
import { CreateEstimateScreen } from './components/Estimate/CreateEstimateScreen';
import { PaymentInScreen } from './components/PaymentIn/PaymentInScreen';
import { PurchaseOrderListScreen } from './components/Purchase/PurchaseOrderListScreen';
import { CreatePurchaseOrderScreen } from './components/Purchase/CreatePurchaseOrderScreen';
import { PurchaseBillListScreen } from './components/Purchase/PurchaseBillListScreen';
import { PaymentOutScreen } from './components/PaymentOut/PaymentOutScreen';
import { ExpenseScreen } from './components/Expense/ExpenseScreen';
import { PurchaseReturnListScreen } from './components/PurchaseReturn/PurchaseReturnListScreen';
import { CreatePurchaseReturnScreen } from './components/PurchaseReturn/CreatePurchaseReturnScreen';
import { SaleReturnListScreen } from './components/SaleReturn/SaleReturnListScreen';
import { CreateSaleReturnScreen } from './components/SaleReturn/CreateSaleReturnScreen';
import { CashInHandScreen } from './components/CashBank/CashInHandScreen';
import { AuthScreen, AuthUser } from './components/Auth/AuthScreen';
import { Invoice, BusinessDetails, Party } from './types';
import { triggerThermalPrint } from './services/printer';
import {
  checkServerHealth,
  fetchServerItems,
  fetchServerParties,
  fetchServerInvoices,
  fetchServerCompanyProfile,
  fetchServerAllCompanies,
  saveServerCompanyProfile,
  fetchServerEstimates,
  fetchServerPaymentsIn,
  fetchServerPurchaseOrders,
  fetchServerPurchaseBills,
  fetchServerPaymentsOut,
  fetchServerExpenses,
  fetchServerPurchaseReturns,
  fetchServerSaleReturns,
  fetchServerCashTransactions,
  fetchServerLocations,
  fetchServerItemLocations,
  fetchServerStockTransfers,
  deleteServerCompanyProfile
} from './services/api';
import { useToast } from './components/Common/ToastContext';
import { syncManager, deduplicateLocalDatabase } from './services/sync';

export function App() {
  const { showToast, showConfirm } = useToast();

  const isSyncingRef = useRef(false);
  const syncedTenantRef = useRef<string | null>(null);

  // Read activeTab initial state from hash or localStorage so refresh remembers current screen
  const getInitialTab = () => {
    const hash = window.location.hash.replace('#', '');
    if (hash) return hash;
    return localStorage.getItem('vyapar_active_tab') || 'home';
  };

  const getInitialBusiness = (): BusinessDetails => {
    const saved = localStorage.getItem('vyapar_business_details');
    if (saved) {
      try { return JSON.parse(saved); } catch { }
    }
    return DEFAULT_BUSINESS;
  };

  const [activeTab, setActiveTabState] = useState<string>(
    window.location.hash ? window.location.hash.replace('#', '') : (localStorage.getItem('vyapar_active_tab') || 'home')
  );
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [businessDetails, setBusinessDetails] = useState<BusinessDetails>(getInitialBusiness());
  const [companies, setCompanies] = useState<BusinessDetails[]>([]);
  const [partyForPaymentIn, setPartyForPaymentIn] = useState<Party | null>(null);
  const [partyForPaymentOut, setPartyForPaymentOut] = useState<Party | null>(null);
  const [currentTenantId, setCurrentTenantId] = useState<string>(localStorage.getItem('vyapar_current_tenant') || '');

  const [userSession, setUserSession] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem('vyapar_user_session');
    if (saved) {
      try { return JSON.parse(saved); } catch { }
    }
    return null;
  });

  const handleAuthSuccess = async (session: AuthUser) => {
    setUserSession(session);
    localStorage.setItem('vyapar_user_session', JSON.stringify(session));
    localStorage.setItem('vyapar_auth_token', session.token);
    if (session.tenantId) {
      setCurrentTenantId(session.tenantId);
      localStorage.setItem('vyapar_current_tenant', session.tenantId);
    }
    // Clean up local Dexie cache for other users' company profiles on login
    try {
      const allDexie = await db.companyProfiles.toArray();
      const foreignProfiles = allDexie.filter(c => c.userId && c.userId !== session.userId && c.tenantId !== session.tenantId);
      for (const f of foreignProfiles) {
        if (f.id) await db.companyProfiles.delete(f.id);
      }
    } catch {}
    showToast(`Welcome, ${session.fullName || session.email}!`, 'success');
  };

  const handleSignOut = () => {
    showConfirm({
      title: 'Sign Out Account',
      message: 'Are you sure you want to sign out? Your offline store data remains safely saved on this device.',
      type: 'danger',
      confirmText: 'Sign Out',
      onConfirm: () => {
        localStorage.removeItem('vyapar_user_session');
        localStorage.removeItem('vyapar_auth_token');
        localStorage.removeItem('vyapar_current_tenant');
        localStorage.removeItem('vyapar_business_details');
        setCompanies([]);
        setCurrentTenantId('');
        setUserSession(null);
        showToast('Signed out successfully.', 'info');
      }
    });
  };

  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    localStorage.setItem('vyapar_active_tab', tab);
    window.location.hash = tab;
  };

  // Sync hash changes & listen for unauthorized event
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && hash !== activeTab) {
        setActiveTabState(hash);
      }
    };
    const handleUnauthorized = () => {
      setUserSession(null);
    };
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('vyapar:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('vyapar:unauthorized', handleUnauthorized);
    };
  }, [activeTab]);

  // Helper to check if an entity has pending unsynced local mutations in syncJournal
  async function hasPendingLocalMutation(entityType: string, entityId?: string | number): Promise<boolean> {
    if (!entityId) return false;
    const strId = String(entityId);
    const pending = await db.syncJournal
      .filter(record => !record.synced && record.entityType === entityType && record.entityId === strId)
      .first();
    return !!pending;
  }

  // Initialize & Sync with PostgreSQL Backend
  useEffect(() => {
    async function syncPostgresToClient() {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;

      // 1. Read local Dexie companyProfiles FIRST for 0ms instant startup & tenant resolution


      const allDexieProfiles = await db.companyProfiles.toArray();
      const localDexieProfiles = userSession?.userId
        ? allDexieProfiles.filter(c => c.userId === userSession.userId || c.tenantId === userSession.tenantId)
        : allDexieProfiles;

      let activeTenantId = currentTenantId || localStorage.getItem('vyapar_current_tenant') || userSession?.tenantId || '';

      if (localDexieProfiles && localDexieProfiles.length > 0) {
        const mappedLocal = localDexieProfiles.map(c => ({
          userId: c.userId || userSession?.userId,
          tenantId: c.tenantId,
          name: c.name || 'My Store',
          phone: c.phone || '',
          address: c.address || '',
          gstin: c.gstin || '',
          state: 'Punjab, Pakistan',
          tagline: 'Quality Products at Everyday Low Prices',
          email: c.email || '',
          businessType: c.businessType || 'Retail',
          logoUrl: c.logoUrl || null,
          signatureUrl: c.signatureUrl || null
        }));
        setCompanies(mappedLocal);

        // Ensure active company profile belongs to this user
        const validActive = mappedLocal.find(c => c.tenantId && c.tenantId === activeTenantId)
          || mappedLocal.find(c => c.tenantId && c.tenantId === userSession?.tenantId)
          || mappedLocal[0];

        if (validActive && validActive.tenantId) {
          activeTenantId = validActive.tenantId;
          setBusinessDetails(validActive);
          if (activeTenantId !== currentTenantId) {
            setCurrentTenantId(activeTenantId);
            localStorage.setItem('vyapar_current_tenant', activeTenantId);
          }
        }
      } else {
        const localSaved = getInitialBusiness();
        activeTenantId = userSession?.tenantId || localSaved.tenantId || activeTenantId || 'default-tenant';
        const defaultProfile: BusinessDetails = { ...localSaved, userId: userSession?.userId, tenantId: activeTenantId };
        setBusinessDetails(defaultProfile);
        setCompanies([defaultProfile]);
        if (activeTenantId !== currentTenantId) {
          setCurrentTenantId(activeTenantId);
          localStorage.setItem('vyapar_current_tenant', activeTenantId);
        }
        try {
          await db.companyProfiles.put({
            userId: userSession?.userId,
            tenantId: activeTenantId,
            name: defaultProfile.name,
            phone: defaultProfile.phone,
            address: defaultProfile.address,
            gstin: defaultProfile.gstin,
            businessType: defaultProfile.businessType || 'Retail',
            email: defaultProfile.email,
            logoUrl: defaultProfile.logoUrl,
            signatureUrl: defaultProfile.signatureUrl,
            updatedAt: new Date().toISOString()
          } as any);
        } catch { }
      }

      console.log(`[Sync] Active Tenant ID: ${activeTenantId}`);

      // Seed walk-in party
      await seedWalkInCustomerForTenant(activeTenantId);

      // Log startup local records count
      const localItemCount = await db.items.filter(i => (i.tenantId || 'default-tenant') === activeTenantId).count();
      const localPartyCount = await db.parties.filter(p => (p.tenantId || 'default-tenant') === activeTenantId).count();
      const localInvoiceCount = await db.invoices.filter(i => (i.tenantId || 'default-tenant') === activeTenantId).count();

      console.log(`[Sync] Local records loaded: ${localItemCount} items, ${localPartyCount} parties, ${localInvoiceCount} invoices`);

      setIsDbLoaded(true);

      // If user is not logged in or has no saved auth token, do not attempt protected backend sync calls
      if (!userSession || !localStorage.getItem('vyapar_auth_token')) {
        isSyncingRef.current = false;
        return;
      }

      // Fast health check: if backend server is offline, skip network calls to prevent UI delays
      const isOnline = await checkServerHealth(1500);
      if (!isOnline) {
        if (localItemCount === 0) {
          await seedDatabaseIfEmpty(activeTenantId);
        }
        console.warn('Backend server offline or unreachable. Operating in 100% local Dexie offline mode.');
        isSyncingRef.current = false;
        return;
      }


      try {
        // Fetch company profiles strictly scoped to logged in user's userId
        const allCompanies = await fetchServerAllCompanies(userSession?.userId);
        if (allCompanies && allCompanies.length > 0) {
          const mappedCompanies = allCompanies.map((c: any) => ({
            userId: c.userId || userSession?.userId,
            tenantId: c.tenantId || 'default-tenant',
            name: c.name || 'My Store',
            phone: c.phone || '+92 300 xxxxxxx',
            address: c.address || '',
            gstin: c.gstin || 'NTN: 7654321-0',
            state: 'Punjab, Pakistan',
            tagline: 'Quality Products at Everyday Low Prices',
            email: c.email || '',
            businessType: c.businessType || 'Retail',
            logoUrl: c.logoUrl || null,
            signatureUrl: c.signatureUrl || null
          }));
          setCompanies(mappedCompanies);

          for (const c of mappedCompanies) {
            const existing = await db.companyProfiles.where('tenantId').equals(c.tenantId).first();
            if (existing) {
              await db.companyProfiles.update(existing.id!, c);
            } else {
              await db.companyProfiles.add(c);
            }
          }

          const activeCompany = mappedCompanies.find((c: any) => c.tenantId === activeTenantId) || mappedCompanies[0];
          if (activeCompany) {
            activeTenantId = activeCompany.tenantId || activeTenantId;
            setBusinessDetails(activeCompany);
            if (activeTenantId !== currentTenantId) {
              setCurrentTenantId(activeTenantId);
              localStorage.setItem('vyapar_current_tenant', activeTenantId);
            }
          }
        }

        // Execute unified server pull and local database deduplication
        await syncManager.pullServerChanges(activeTenantId);
        await deduplicateLocalDatabase();

        // Seed structural defaults if database is completely empty for active tenant
        const localItemCount = await db.items.filter(i => (i.tenantId || 'default-tenant') === activeTenantId).count();
        if (localItemCount === 0) {
          await seedDatabaseIfEmpty(activeTenantId);
        }
      } catch (err) {
        console.warn('Error during cloud database sync:', err);
      } finally {
        isSyncingRef.current = false;
      }
    }

    syncPostgresToClient();
  }, [currentTenantId, userSession?.userId]);


  // Global Ctrl+F listener for Command Palette Search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Reactive Dexie Live Queries filtered by active store tenantId
  const allItems = useLiveQuery(() => db.items.toArray(), []) || [];
  const allParties = useLiveQuery(() => db.parties.toArray(), []) || [];
  const allInvoices = useLiveQuery(() => db.invoices.reverse().toArray(), []) || [];
  const allEstimates = useLiveQuery(() => db.estimates.reverse().toArray(), []) || [];
  const allPaymentsIn = useLiveQuery(() => db.paymentIn.reverse().toArray(), []) || [];
  const allPurchaseOrders = useLiveQuery(() => db.purchaseOrders.reverse().toArray(), []) || [];
  const allPurchaseBills = useLiveQuery(() => db.purchaseBills.reverse().toArray(), []) || [];
  const allPaymentsOut = useLiveQuery(() => db.paymentOut.reverse().toArray(), []) || [];
  const allExpenses = useLiveQuery(() => db.expenses.reverse().toArray(), []) || [];
  const allPurchaseReturns = useLiveQuery(() => db.purchaseReturns.reverse().toArray(), []) || [];
  const allSaleReturns = useLiveQuery(() => db.saleReturns.reverse().toArray(), []) || [];
  const allCashTransactions = useLiveQuery(() => db.cashTransactions.reverse().toArray(), []) || [];
  const allLocations = useLiveQuery(() => db.locations.toArray(), []) || [];
  const allItemLocations = useLiveQuery(() => db.itemLocations.toArray(), []) || [];
  const allStockTransfers = useLiveQuery(() => db.stockTransfers.reverse().toArray(), []) || [];

  const activeTenantId = currentTenantId || 'default-tenant';

  // Determine accessible warehouses for active store based strictly on ownership or explicit allowedTenantIds linkage
  const accessibleWhIds = useMemo(() => {
    const set = new Set<string>();
    allLocations.forEach(loc => {
      if (loc.type === 'WAREHOUSE') {
        const locTenant = loc.tenantId || 'default-tenant';
        const isOwner = locTenant === activeTenantId || locTenant === 'default-tenant' || activeTenantId === 'default-tenant';
        const isLinked = loc.allowedTenantIds && Array.isArray(loc.allowedTenantIds) && loc.allowedTenantIds.includes(activeTenantId);
        const isShared = loc.isShared === true;
        if (isOwner || isLinked || isShared || allLocations.length <= 15) {
          set.add(String(loc.id));
        }
      }
    });
    return set;
  }, [allLocations, activeTenantId]);

  // Compute all child location IDs (Zones, Racks, Shelves, Store Front) belonging to accessible warehouses or active tenant
  const accessibleLocationIds = useMemo(() => {
    const locIds = new Set<string>(accessibleWhIds);
    let addedChild = true;
    while (addedChild) {
      addedChild = false;
      for (const loc of allLocations) {
        const locIdStr = String(loc.id);
        const parentIdStr = loc.parentId !== undefined && loc.parentId !== null ? String(loc.parentId) : null;
        if (parentIdStr && locIds.has(parentIdStr) && !locIds.has(locIdStr)) {
          locIds.add(locIdStr);
          addedChild = true;
        }
      }
    }
    return locIds;
  }, [allLocations, accessibleWhIds]);

  const locations = useMemo(() => {
    return allLocations.filter(loc => {
      if (!loc) return false;
      const locTenant = loc.tenantId || 'default-tenant';
      const isOwner = locTenant === activeTenantId || locTenant === 'default-tenant' || activeTenantId === 'default-tenant';
      const isLocAccessible = accessibleLocationIds.has(String(loc.id));
      const isShared = loc.isShared === true;
      return isOwner || isLocAccessible || isShared;
    });
  }, [allLocations, activeTenantId, accessibleLocationIds]);

  const itemLocations = useMemo(() => {
    return allItemLocations.filter(il => {
      if (!il) return false;
      const ilTenant = il.tenantId || 'default-tenant';
      const isOwner = ilTenant === activeTenantId || ilTenant === 'default-tenant' || activeTenantId === 'default-tenant';
      const isLocAccessible = accessibleLocationIds.has(String(il.locationId));
      return isOwner || isLocAccessible;
    });
  }, [allItemLocations, activeTenantId, accessibleLocationIds]);

  const items = useMemo(() => {
    return allItems.filter(item => {
      if (!item) return false;
      const itemTenant = item.tenantId || 'default-tenant';
      const isOwner = itemTenant === activeTenantId || itemTenant === 'default-tenant' || activeTenantId === 'default-tenant';
      const isStoredInAccessibleLoc = itemLocations.some((il: any) => String(il.itemId) === String(item.id) && accessibleLocationIds.has(String(il.locationId)));
      return isOwner || isStoredInAccessibleLoc;
    });
  }, [allItems, activeTenantId, itemLocations, accessibleLocationIds]);

  const parties = allParties.filter(party => party && (party.tenantId || 'default-tenant') === activeTenantId);
  const invoices = allInvoices.filter(inv => inv && (inv.tenantId || 'default-tenant') === activeTenantId);
  const estimates = allEstimates.filter(est => est && (est.tenantId || 'default-tenant') === activeTenantId);
  const paymentsIn = allPaymentsIn.filter(p => p && (p.tenantId || 'default-tenant') === activeTenantId);
  const purchaseOrders = allPurchaseOrders.filter(po => po && (po.tenantId || 'default-tenant') === activeTenantId);
  const purchaseBills = allPurchaseBills.filter(pb => pb && (pb.tenantId || 'default-tenant') === activeTenantId);
  const paymentsOut = allPaymentsOut.filter(po => po && (po.tenantId || 'default-tenant') === activeTenantId);
  const expenses = allExpenses.filter(e => e && (e.tenantId || 'default-tenant') === activeTenantId);
  const purchaseReturns = allPurchaseReturns.filter(pr => pr && (pr.tenantId || 'default-tenant') === activeTenantId);
  const saleReturns = allSaleReturns.filter(sr => sr && (sr.tenantId || 'default-tenant') === activeTenantId);
  const cashTransactions = allCashTransactions.filter(ct => ct && (ct.tenantId || 'default-tenant') === activeTenantId);

  const stockTransfers = useMemo(() => {
    return allStockTransfers.filter(st => {
      if (!st) return false;
      const isOwner = (st.tenantId || 'default-tenant') === activeTenantId;
      const isSrcAccessible = accessibleLocationIds.has(String(st.sourceLocationId));
      const isDestAccessible = accessibleLocationIds.has(String(st.destinationLocationId));
      return isOwner || isSrcAccessible || isDestAccessible;
    });
  }, [allStockTransfers, activeTenantId, accessibleLocationIds]);

  const handleInvoiceCreated = (invoice: Invoice) => {
    triggerThermalPrint(invoice, businessDetails, '80mm');
  };

  const handleSelectCompany = async (tenantId: string) => {
    setCurrentTenantId(tenantId);
    localStorage.setItem('vyapar_current_tenant', tenantId);

    const selectedComp = companies.find(c => (c.tenantId || 'default-tenant') === tenantId);
    if (selectedComp) {
      setBusinessDetails(selectedComp);
      localStorage.setItem('vyapar_business_details', JSON.stringify(selectedComp));
    } else {
      const serverComp = await fetchServerCompanyProfile(tenantId);
      if (serverComp && serverComp.name) {
        const comp = {
          tenantId: serverComp.tenantId || tenantId,
          name: serverComp.name,
          phone: serverComp.phone || '+92 300 xxxxxxx',
          address: serverComp.address || '',
          gstin: serverComp.gstin || 'NTN: 7654321-0',
          state: 'Punjab, Pakistan',
          tagline: 'Quality Products at Everyday Low Prices',
          email: serverComp.email || '',
          logoUrl: serverComp.logoUrl || null,
          signatureUrl: serverComp.signatureUrl || null
        };
        setBusinessDetails(comp);
        localStorage.setItem('vyapar_business_details', JSON.stringify(comp));
      }
    }
  };

  const handleCreateCompany = async (newCompanyData: Partial<BusinessDetails>) => {
    // Auto-increment sequential tenant ID (tenant-1, tenant-2, tenant-3...)
    let maxNum = 0;
    for (const c of companies) {
      if (c.tenantId) {
        const match = c.tenantId.match(/^tenant-(\d+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      }
    }
    const newTenantId = newCompanyData.tenantId || `tenant-${maxNum + 1}`;
    const fullCompanyData = {
      userId: userSession?.userId,
      tenantId: newTenantId,
      name: newCompanyData.name || 'New Branch',
      phone: newCompanyData.phone || '+92 300 xxxxxxx',
      email: newCompanyData.email || '',
      address: newCompanyData.address || '',
      gstin: newCompanyData.gstin || 'NTN: 1234567-8',
      businessType: newCompanyData.businessType || 'Retail',
      businessCategory: newCompanyData.businessCategory || 'Supermarket & FMCG'
    };

    await saveServerCompanyProfile(fullCompanyData);

    const newCompObj: BusinessDetails = {
      ...fullCompanyData,
      state: 'Punjab, Pakistan',
      tagline: 'Quality Products at Everyday Low Prices'
    };

    try {
      const existing = await db.companyProfiles.where('tenantId').equals(newTenantId).first();
      if (existing && existing.id) {
        await db.companyProfiles.update(existing.id, newCompObj as any);
      } else {
        await db.companyProfiles.add(newCompObj as any);
      }
    } catch { }

    setCompanies(prev => [...prev, newCompObj]);
    handleSelectCompany(newTenantId);
  };

  const handleDeleteCompany = (tenantIdToDelete: string, storeName: string) => {
    showConfirm({
      title: `Delete Store Profile "${storeName}"?`,
      message: `Are you sure you want to permanently delete "${storeName}"? This will erase all items, customer ledgers, invoices, and returns belonging to this store from both local storage and cloud database.`,
      type: 'danger',
      confirmText: 'Delete Store',
      onConfirm: async () => {
        try {
          // 1. Call Backend API to delete from PostgreSQL Cloud DB
          await deleteServerCompanyProfile(tenantIdToDelete);

          // 2. Cascade delete from local Dexie IndexedDB
          await db.companyProfiles.where('tenantId').equals(tenantIdToDelete).delete().catch(() => { });
          await db.items.where('tenantId').equals(tenantIdToDelete).delete().catch(() => { });
          await db.parties.where('tenantId').equals(tenantIdToDelete).delete().catch(() => { });
          await db.invoices.where('tenantId').equals(tenantIdToDelete).delete().catch(() => { });
          await db.saleReturns.where('tenantId').equals(tenantIdToDelete).delete().catch(() => { });
          await db.purchaseReturns.where('tenantId').equals(tenantIdToDelete).delete().catch(() => { });
          await db.purchaseBills.where('tenantId').equals(tenantIdToDelete).delete().catch(() => { });
          await db.purchaseOrders.where('tenantId').equals(tenantIdToDelete).delete().catch(() => { });
          await db.expenses.where('tenantId').equals(tenantIdToDelete).delete().catch(() => { });
          await db.paymentIn.where('tenantId').equals(tenantIdToDelete).delete().catch(() => { });
          await db.paymentOut.where('tenantId').equals(tenantIdToDelete).delete().catch(() => { });
          await db.estimates.where('tenantId').equals(tenantIdToDelete).delete().catch(() => { });
          await db.cashAccounts.where('tenantId').equals(tenantIdToDelete).delete().catch(() => { });
          await db.cashTransactions.where('tenantId').equals(tenantIdToDelete).delete().catch(() => { });

          // 3. Update React state
          const remainingCompanies = companies.filter(c => c.tenantId !== tenantIdToDelete);
          setCompanies(remainingCompanies);

          if (remainingCompanies.length > 0) {
            const nextActive = remainingCompanies[0];
            const nextTenantId = nextActive.tenantId || '';
            setCurrentTenantId(nextTenantId);
            setBusinessDetails(nextActive);
            localStorage.setItem('vyapar_current_tenant', nextTenantId);
            localStorage.setItem('vyapar_business_details', JSON.stringify(nextActive));
          } else {
            setCompanies([]);
            setBusinessDetails({
              tenantId: '',
              name: '',
              phone: '',
              email: '',
              address: '',
              gstin: '',
              state: 'Punjab, Pakistan',
              tagline: 'Quality Products at Everyday Low Prices',
              businessType: 'Retail',
              businessCategory: 'Supermarket & FMCG'
            });
            setCurrentTenantId('');
            localStorage.removeItem('vyapar_current_tenant');
            localStorage.removeItem('vyapar_business_details');
          }

          showToast(`Store profile "${storeName}" deleted successfully from local and cloud databases.`, 'success');
        } catch (err: any) {
          showToast(`Failed to delete company profile: ${err.message}`, 'error');
        }
      }
    });
  };

  if (!userSession) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  if (!isDbLoaded) {
    return (
      <div className="h-screen w-screen bg-[#f3f4f6] text-slate-800 flex flex-col items-center justify-center gap-3 select-none">
        <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
        <div className="font-extrabold text-xs text-slate-700">Connecting to PostgreSQL Cloud Server...</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#f3f4f6] overflow-hidden select-none">
      {/* Top Header */}
      <Header
        business={businessDetails}
        companies={companies}
        currentTenantId={currentTenantId}
        userSession={userSession}
        itemCount={items.length}
        invoiceCount={invoices.length}
        activeTab={activeTab}
        onNavigateToTab={setActiveTab}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenSyncModal={() => setIsSyncModalOpen(true)}
        onSelectCompany={handleSelectCompany}
        onCreateCompany={handleCreateCompany}
        onDeleteCompany={handleDeleteCompany}
        onSignOut={handleSignOut}
      />

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        <main className="flex-1 flex overflow-hidden">
          {activeTab === 'home' && (
            <DashboardScreen
              invoices={invoices}
              parties={parties}
              onNavigateTab={setActiveTab}
            />
          )}

          {activeTab === 'pos' && (
            <BillingScreen
              items={items}
              parties={parties}
              business={businessDetails}
              onInvoiceCreated={handleInvoiceCreated}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryScreen items={items} parties={parties} business={businessDetails} onItemUpdated={() => { }} />
          )}

          {activeTab === 'inventory-store' && (
            <StoreStockScreen
              items={items}
              locations={locations}
              itemLocations={itemLocations}
              business={businessDetails}
            />
          )}

          {activeTab === 'inventory-location' && (
            <LocationScreen
              items={items}
              locations={locations}
              itemLocations={itemLocations}
              stockTransfers={stockTransfers}
              business={businessDetails}
            />
          )}

          {activeTab === 'parties' && (
            <PartiesScreen
              parties={parties}
              invoices={invoices}
              business={businessDetails}
              onPartyUpdated={() => { }}
              onNavigateToPaymentIn={(party) => {
                setPartyForPaymentIn(party);
                setActiveTab('payment-in');
              }}
              onNavigateToPaymentOut={(party) => {
                setPartyForPaymentOut(party);
                setActiveTab('payment-out');
              }}
            />
          )}

          {activeTab === 'payment-out' && (
            <PaymentOutScreen
              payments={paymentsOut}
              parties={parties}
              purchaseBills={purchaseBills}
              business={businessDetails}
              onPaymentRecorded={() => { }}
              selectedPartyFromParties={partyForPaymentOut}
              onClearSelectedParty={() => setPartyForPaymentOut(null)}
            />
          )}

          {activeTab === 'expenses' && (
            <ExpenseScreen
              expenses={expenses}
              business={businessDetails}
              onExpenseRecorded={() => { }}
            />
          )}

          {activeTab === 'purchase-returns' && (
            <PurchaseReturnListScreen
              purchaseReturns={purchaseReturns}
              business={businessDetails}
              onCreateReturn={() => setActiveTab('create-purchase-return')}
              onReturnUpdated={() => { }}
            />
          )}

          {activeTab === 'create-purchase-return' && (
            <CreatePurchaseReturnScreen
              items={items}
              parties={parties}
              business={businessDetails}
              onReturnSaved={() => setActiveTab('purchase-returns')}
              onCancel={() => setActiveTab('purchase-returns')}
            />
          )}

          {activeTab === 'sale-returns' && (
            <SaleReturnListScreen
              saleReturns={saleReturns}
              business={businessDetails}
              onCreateReturn={() => setActiveTab('create-sale-return')}
              onReturnUpdated={() => { }}
            />
          )}

          {activeTab === 'create-sale-return' && (
            <CreateSaleReturnScreen
              items={items}
              parties={parties}
              business={businessDetails}
              onReturnCreated={() => setActiveTab('sale-returns')}
              onCancel={() => setActiveTab('sale-returns')}
            />
          )}

          {activeTab === 'purchase' && (
            <PurchaseBillListScreen
              purchaseBills={purchaseBills}
              business={businessDetails}
              onCreateBill={() => setActiveTab('create-purchase-bill')}
              onBillUpdated={() => { }}
            />
          )}

          {activeTab === 'create-purchase-bill' && (
            <PurchaseScreen
              items={items}
              parties={parties}
              business={businessDetails}
              onPurchaseCreated={() => setActiveTab('purchase')}
            />
          )}

          {activeTab === 'purchase-orders' && (
            <PurchaseOrderListScreen
              purchaseOrders={purchaseOrders}
              business={businessDetails}
              parties={parties}
              items={items}
              onCreatePO={() => setActiveTab('create-po')}
              onPOUpdated={() => { }}
              onNavigateToPurchaseBill={() => setActiveTab('purchase')}
            />
          )}

          {activeTab === 'create-po' && (
            <CreatePurchaseOrderScreen
              items={items}
              parties={parties}
              business={businessDetails}
              onPOSaved={() => setActiveTab('purchase-orders')}
              onCancel={() => setActiveTab('purchase-orders')}
            />
          )}

          {(activeTab === 'cash-in-hand' || activeTab === 'ledger' || activeTab === 'cash-bank') && (
            <CashInHandScreen business={businessDetails} />
          )}

          {activeTab === 'invoices' && (
            <InvoicesScreen invoices={invoices} business={businessDetails} />
          )}

          {activeTab === 'payment-in' && (
            <PaymentInScreen
              payments={paymentsIn}
              parties={parties}
              invoices={invoices}
              business={businessDetails}
              onPaymentRecorded={() => { }}
              selectedPartyFromParties={partyForPaymentIn}
              onClearSelectedParty={() => setPartyForPaymentIn(null)}
            />
          )}

          {activeTab === 'estimates' && (
            <EstimateListScreen
              estimates={estimates}
              business={businessDetails}
              onCreateEstimate={() => setActiveTab('create-estimate')}
              onEstimateUpdated={() => { }}
            />
          )}

          {activeTab === 'create-estimate' && (
            <CreateEstimateScreen
              items={items}
              parties={parties}
              business={businessDetails}
              onEstimateSaved={() => setActiveTab('estimates')}
              onCancel={() => setActiveTab('estimates')}
            />
          )}

          {activeTab === 'gst' && (
            <GSTComplianceScreen invoices={invoices} business={businessDetails} />
          )}

          {activeTab === 'reports' && (
            <ReportsScreen
              items={items}
              invoices={invoices}
              purchaseBills={purchaseBills}
              purchaseReturns={purchaseReturns}
              paymentsIn={paymentsIn}
              paymentsOut={paymentsOut}
              expenses={expenses}
              saleReturns={saleReturns}
              cashTransactions={cashTransactions}
              business={businessDetails}
              companies={companies}
              onAddSale={() => setActiveTab('pos')}
              onAddPurchase={() => setActiveTab('purchase')}
            />
          )}

          {activeTab === 'settings' && <PrinterModal business={businessDetails} />}

          {activeTab === 'company' && (
            <EditProfileScreen
              business={businessDetails}
              onUpdateBusiness={async (updated) => {
                const targetTenantId = updated.tenantId || currentTenantId;
                const fullProfile = { ...businessDetails, ...updated, tenantId: targetTenantId };

                setBusinessDetails(fullProfile);
                localStorage.setItem('vyapar_business_details', JSON.stringify(fullProfile));

                setCompanies(prevCompanies => {
                  const exists = prevCompanies.some(c => (c.tenantId || 'default-tenant') === targetTenantId);
                  if (exists) {
                    return prevCompanies.map(c =>
                      (c.tenantId || 'default-tenant') === targetTenantId ? { ...c, ...updated, tenantId: targetTenantId } : c
                    );
                  }
                  return [...prevCompanies, fullProfile];
                });

                try {
                  const existing = await db.companyProfiles.where('tenantId').equals(targetTenantId).first();
                  if (existing) {
                    await db.companyProfiles.update(existing.id!, fullProfile);
                  } else {
                    await db.companyProfiles.add(fullProfile);
                  }
                } catch (err) {
                  console.warn('Error saving profile to Dexie local DB:', err);
                }
              }}
              onCancel={() => setActiveTab('home')}
              onDeleteCompany={handleDeleteCompany}
            />
          )}
        </main>
      </div>

      {/* Global Command Palette Modal */}
      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        items={items}
        parties={parties}
        invoices={invoices}
        onNavigateTab={setActiveTab}
      />

      {/* Offline Sync Inspector Modal */}
      <SyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
      />

      {/* No Company Profile Setup Prompt Modal */}
      {isDbLoaded && companies.length === 0 && (
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 max-w-lg w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center space-y-2 mb-6">
              <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-white mx-auto shadow-lg">
                <Building2 className="w-9 h-9 stroke-[2.5]" />
              </div>
              <h2 className="text-2xl font-black text-slate-800">Welcome to Vyapar POS</h2>
              <p className="text-sm text-slate-500 font-medium">Please create your Store / Business Profile to get started.</p>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const name = (form.elements.namedItem('storeName') as HTMLInputElement).value;
              const phone = (form.elements.namedItem('storePhone') as HTMLInputElement).value;
              const address = (form.elements.namedItem('storeAddress') as HTMLInputElement).value;
              const gstin = (form.elements.namedItem('storeGstin') as HTMLInputElement).value;
              if (!name) return;
              handleCreateCompany({ name, phone, address, gstin, businessType: 'Retail' });
            }} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Company / Store Name *</label>
                <input required name="storeName" placeholder="e.g. Acme SuperMarket" className="w-full px-4 py-2.5 rounded-xl border border-slate-300 font-bold text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Phone Number</label>
                  <input name="storePhone" placeholder="+92 300 1234567" className="w-full px-4 py-2.5 rounded-xl border border-slate-300 font-medium text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">GSTIN / NTN</label>
                  <input name="storeGstin" placeholder="NTN: 1234567-8" className="w-full px-4 py-2.5 rounded-xl border border-slate-300 font-medium text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Store Address</label>
                <input name="storeAddress" placeholder="Shop #1, Main Market..." className="w-full px-4 py-2.5 rounded-xl border border-slate-300 font-medium text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <button type="submit" className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm rounded-xl shadow-lg transition cursor-pointer flex items-center justify-center gap-2">
                <span>Create Business Profile & Start POS</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
