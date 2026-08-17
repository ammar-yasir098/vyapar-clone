import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seedDatabaseIfEmpty, seedLedgerAccountsForTenant, seedWalkInCustomerForTenant, DEFAULT_BUSINESS } from './db';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DashboardScreen } from './components/Dashboard/DashboardScreen';
import { BillingScreen } from './components/POS/BillingScreen';
import { InventoryScreen } from './components/Inventory/InventoryScreen';
import { PartiesScreen } from './components/Parties/PartiesScreen';
import { PurchaseScreen } from './components/Purchase/PurchaseScreen';
import { LedgerScreen } from './components/Ledger/LedgerScreen';
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
import { Invoice, BusinessDetails, Party } from './types';
import { triggerThermalPrint } from './services/printer';
import { 
  fetchServerItems, 
  fetchServerParties, 
  fetchServerInvoices, 
  fetchServerCompanyProfile, 
  fetchServerAllCompanies, 
  saveServerCompanyProfile,
  fetchServerLedgerAccounts,
  fetchServerJournalEntries,
  fetchServerEstimates,
  fetchServerPaymentsIn,
  fetchServerPurchaseOrders,
  fetchServerPurchaseBills,
  fetchServerPaymentsOut,
  fetchServerExpenses
} from './services/api';
import { syncLedgerAccountBalances } from './services/ledger';

export function App() {
  // Read activeTab initial state from hash or localStorage so refresh remembers current screen
  const getInitialTab = () => {
    const hash = window.location.hash.replace('#', '');
    if (hash) return hash;
    return localStorage.getItem('vyapar_active_tab') || 'home';
  };

  const getInitialBusiness = (): BusinessDetails => {
    const saved = localStorage.getItem('vyapar_business_details');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
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
  const [currentTenantId, setCurrentTenantId] = useState<string>(localStorage.getItem('vyapar_current_tenant') || 'default-tenant');

  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    localStorage.setItem('vyapar_active_tab', tab);
    window.location.hash = tab;
  };

  // Sync hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && hash !== activeTab) {
        setActiveTabState(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activeTab]);

  // Initialize & Sync with PostgreSQL Backend
  useEffect(() => {
    async function syncPostgresToClient() {
      await seedDatabaseIfEmpty();
      await seedLedgerAccountsForTenant(currentTenantId);
      await seedWalkInCustomerForTenant(currentTenantId);
      // 1. Read local Dexie companyProfiles FIRST for 0ms instant offline startup
      const localDexieProfiles = await db.companyProfiles.toArray();
      if (localDexieProfiles && localDexieProfiles.length > 0) {
        const mappedLocal = localDexieProfiles.map(c => ({
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
        setCompanies(mappedLocal);
        const activeComp = mappedLocal.find(c => (c.tenantId || 'default-tenant') === currentTenantId) || mappedLocal[0];
        if (activeComp) setBusinessDetails(activeComp);
      }

      try {
        // Fetch all company profiles (Multi-Store / Multi-Branch)
        const allCompanies = await fetchServerAllCompanies();
        if (allCompanies && allCompanies.length > 0) {
          const mappedCompanies = allCompanies.map((c: any) => ({
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

          // Save/Sync into Dexie Local IndexedDB
          for (const c of mappedCompanies) {
            const existing = await db.companyProfiles.where('tenantId').equals(c.tenantId).first();
            if (existing) {
              await db.companyProfiles.update(existing.id!, c);
            } else {
              await db.companyProfiles.add(c);
            }
          }

          // Find active company profile & auto-cache logo for 100% offline display
          const activeCompany = mappedCompanies.find((c: any) => c.tenantId === currentTenantId) || mappedCompanies[0];
          if (activeCompany && activeCompany.logoUrl && activeCompany.logoUrl.startsWith('/uploads/')) {
            try {
              const fullUrl = `http://localhost:5000${activeCompany.logoUrl}`;
              fetch(fullUrl).then(res => res.blob()).then(blob => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  const base64 = reader.result as string;
                  if (base64 && base64.startsWith('data:image/')) {
                    localStorage.setItem('vyapar_offline_logo', base64);
                  }
                };
                reader.readAsDataURL(blob);
              }).catch(() => {});
            } catch {}
          }
          setBusinessDetails(activeCompany);
        } else {
          const serverCompany = await fetchServerCompanyProfile(currentTenantId);
          if (serverCompany && serverCompany.name) {
            const comp = {
              tenantId: serverCompany.tenantId || currentTenantId,
              name: serverCompany.name,
              phone: serverCompany.phone || '+92 300 xxxxxxx',
              address: serverCompany.address || '',
              gstin: serverCompany.gstin || 'NTN: 7654321-0',
              state: 'Punjab, Pakistan',
              tagline: 'Quality Products at Everyday Low Prices',
              email: serverCompany.email || '',
              logoUrl: serverCompany.logoUrl || null,
              signatureUrl: serverCompany.signatureUrl || null
            };
            setBusinessDetails(comp);
            setCompanies([comp]);

            const existing = await db.companyProfiles.where('tenantId').equals(comp.tenantId).first();
            if (existing) {
              await db.companyProfiles.update(existing.id!, comp);
            } else {
              await db.companyProfiles.add(comp);
            }
          }
        }

        // Fetch live catalog, parties, and invoices for current tenant from PostgreSQL API
        const serverItems = await fetchServerItems(currentTenantId);
        const serverParties = await fetchServerParties(currentTenantId);
        const serverInvoices = await fetchServerInvoices(currentTenantId);
        const serverAccounts = await fetchServerLedgerAccounts(currentTenantId);
        const serverJournals = await fetchServerJournalEntries(currentTenantId);
        const serverEstimates = await fetchServerEstimates(currentTenantId);
        const serverPaymentsIn = await fetchServerPaymentsIn(currentTenantId);
        const serverPOs = await fetchServerPurchaseOrders(currentTenantId);
        const serverPBills = await fetchServerPurchaseBills(currentTenantId);
        const serverPaymentsOut = await fetchServerPaymentsOut(currentTenantId);
        const serverExpenses = await fetchServerExpenses(currentTenantId);

        if (serverItems && serverItems.length > 0) {
          for (const sItem of serverItems) {
            const existing = await db.items.where('name').equalsIgnoreCase(sItem.name).first();
            if (!existing) {
              await db.items.add({ ...sItem, tenantId: sItem.tenantId || currentTenantId });
            }
          }
        }

        if (serverParties && serverParties.length > 0) {
          for (const sParty of serverParties) {
            const existing = await db.parties.where('name').equalsIgnoreCase(sParty.name).first();
            if (!existing) {
              await db.parties.add({ ...sParty, tenantId: sParty.tenantId || currentTenantId });
            }
          }
        }

        if (serverInvoices && serverInvoices.length > 0) {
          for (const sInv of serverInvoices) {
            const rawInv = sInv.dataValues || sInv;
            const invId = rawInv.invoiceId || rawInv.invoice_id;
            const invNum = rawInv.invoiceNumber || rawInv.invoice_number;

            const existing = await db.invoices
              .filter(i => (invId && i.invoiceId === invId) || (invNum && i.invoiceNumber === invNum))
              .first();

            if (!existing) {
              await db.invoices.add({
                ...rawInv,
                invoiceId: invId || `inv-${Date.now()}-${Math.random()}`,
                invoiceNumber: invNum || `INV-${Date.now()}`,
                tenantId: rawInv.tenantId || rawInv.tenant_id || currentTenantId
              });
            }
          }
        }

        if (serverAccounts && serverAccounts.length > 0) {
          for (const sAcc of serverAccounts) {
            const existing = await db.ledgerAccounts
              .filter(a => (a.tenantId || 'default-tenant') === currentTenantId && a.accountCode === sAcc.accountCode)
              .first();
            if (!existing) {
              await db.ledgerAccounts.add({ ...sAcc, tenantId: sAcc.tenantId || currentTenantId });
            }
          }
        }

        if (serverJournals && serverJournals.length > 0) {
          for (const sJe of serverJournals) {
            const existing = await db.journalEntries
              .filter(j => (j.tenantId || 'default-tenant') === currentTenantId && j.entryNumber === sJe.entryNumber)
              .first();
            if (!existing) {
              await db.journalEntries.add({ ...sJe, tenantId: sJe.tenantId || currentTenantId });
            }
          }
        }

        if (serverEstimates && serverEstimates.length > 0) {
          for (const sEst of serverEstimates) {
            const existing = await db.estimates.where('estimateId').equals(sEst.estimateId).first();
            if (!existing) {
              await db.estimates.add({ ...sEst, tenantId: sEst.tenantId || currentTenantId });
            }
          }
        }

        if (serverPaymentsIn && serverPaymentsIn.length > 0) {
          for (const sPay of serverPaymentsIn) {
            const existing = await db.paymentIn.where('receiptNumber').equals(sPay.receiptNumber).first();
            if (!existing) {
              await db.paymentIn.add({ ...sPay, tenantId: sPay.tenantId || currentTenantId });
            }
          }
        }

        if (serverPOs && serverPOs.length > 0) {
          for (const sPo of serverPOs) {
            const existing = await db.purchaseOrders.where('poId').equals(sPo.poId).first();
            if (!existing) {
              await db.purchaseOrders.add({ ...sPo, tenantId: sPo.tenantId || currentTenantId });
            }
          }
        }

        if (serverPBills && serverPBills.length > 0) {
          for (const sBill of serverPBills) {
            const rawBill = sBill.dataValues || sBill;
            const bId = rawBill.billId || rawBill.bill_id;
            const bNum = rawBill.billNumber || rawBill.bill_number;
            const existing = await db.purchaseBills.filter(b => (bId && b.billId === bId) || (bNum && b.billNumber === bNum)).first();
            if (!existing) {
              await db.purchaseBills.add({
                ...rawBill,
                billId: bId || `pur-${Date.now()}`,
                billNumber: bNum || `PUR-${Date.now()}`,
                tenantId: rawBill.tenantId || rawBill.tenant_id || currentTenantId
              });
            }
          }
        }

        if (serverPaymentsOut && serverPaymentsOut.length > 0) {
          for (const sPay of serverPaymentsOut) {
            const existing = await db.paymentOut.where('receiptNumber').equals(sPay.receiptNumber).first();
            if (!existing) {
              await db.paymentOut.add({ ...sPay, tenantId: sPay.tenantId || currentTenantId });
            }
          }
        }

        if (serverExpenses && serverExpenses.length > 0) {
          for (const sExp of serverExpenses) {
            const existing = await db.expenses.where('expenseNumber').equals(sExp.expenseNumber).first();
            if (!existing) {
              await db.expenses.add({ ...sExp, tenantId: sExp.tenantId || currentTenantId });
            }
          }
        }
      } catch (err) {
        console.warn('Backend server offline or unreachable. Operating in Dexie local offline mode.', err);
        // Fallback to reading company profiles from Dexie IndexedDB or localStorage
        const dexieProfiles = await db.companyProfiles.toArray();
        if (dexieProfiles && dexieProfiles.length > 0) {
          const mappedDexie = dexieProfiles.map(c => ({
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
          setCompanies(mappedDexie);
          const activeDexieComp = mappedDexie.find(c => (c.tenantId || 'default-tenant') === currentTenantId) || mappedDexie[0];
          setBusinessDetails(activeDexieComp);
        } else {
          const localSaved = getInitialBusiness();
          setBusinessDetails(localSaved);
          setCompanies([localSaved]);
          // Seed into local Dexie companyProfiles table
          await db.companyProfiles.put({
            tenantId: localSaved.tenantId || currentTenantId,
            name: localSaved.name,
            phone: localSaved.phone,
            address: localSaved.address,
            gstin: localSaved.gstin,
            businessType: localSaved.businessType || 'Retail',
            email: localSaved.email,
            logoUrl: localSaved.logoUrl,
            signatureUrl: localSaved.signatureUrl,
            updatedAt: new Date().toISOString()
          } as any);
        }
      }

      setIsDbLoaded(true);
    }

    syncPostgresToClient();
  }, [currentTenantId]);

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
  const allAccounts = useLiveQuery(() => db.ledgerAccounts.toArray(), []) || [];
  const allJournalEntries = useLiveQuery(() => db.journalEntries.reverse().toArray(), []) || [];
  const allEstimates = useLiveQuery(() => db.estimates.reverse().toArray(), []) || [];
  const allPaymentsIn = useLiveQuery(() => db.paymentIn.reverse().toArray(), []) || [];
  const allPurchaseOrders = useLiveQuery(() => db.purchaseOrders.reverse().toArray(), []) || [];
  const allPurchaseBills = useLiveQuery(() => db.purchaseBills.reverse().toArray(), []) || [];
  const allPaymentsOut = useLiveQuery(() => db.paymentOut.reverse().toArray(), []) || [];
  const allExpenses = useLiveQuery(() => db.expenses.reverse().toArray(), []) || [];

  const items = allItems.filter(item => (item.tenantId || 'default-tenant') === currentTenantId);
  const parties = allParties.filter(party => (party.tenantId || 'default-tenant') === currentTenantId);
  const invoices = allInvoices.filter(inv => (inv.tenantId || 'default-tenant') === currentTenantId);
  const accounts = allAccounts.filter(acc => (acc.tenantId || 'default-tenant') === currentTenantId);
  const journalEntries = allJournalEntries.filter(je => (je.tenantId || 'default-tenant') === currentTenantId);
  const estimates = allEstimates.filter(est => (est.tenantId || 'default-tenant') === currentTenantId);
  const paymentsIn = allPaymentsIn.filter(p => (p.tenantId || 'default-tenant') === currentTenantId);
  const purchaseOrders = allPurchaseOrders.filter(po => (po.tenantId || 'default-tenant') === currentTenantId);
  const purchaseBills = allPurchaseBills.filter(pb => (pb.tenantId || 'default-tenant') === currentTenantId);
  const paymentsOut = allPaymentsOut.filter(po => (po.tenantId || 'default-tenant') === currentTenantId);
  const expenses = allExpenses.filter(e => (e.tenantId || 'default-tenant') === currentTenantId);

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
    const newTenantId = `tenant-${Date.now().toString().slice(-6)}`;
    const fullCompanyData = {
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

    setCompanies(prev => [...prev, newCompObj]);
    handleSelectCompany(newTenantId);
  };

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
        itemCount={items.length}
        invoiceCount={invoices.length}
        activeTab={activeTab}
        onNavigateToTab={setActiveTab}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenSyncModal={() => setIsSyncModalOpen(true)}
        onSelectCompany={handleSelectCompany}
        onCreateCompany={handleCreateCompany}
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
            <InventoryScreen items={items} parties={parties} business={businessDetails} onItemUpdated={() => {}} />
          )}

          {activeTab === 'parties' && (
            <PartiesScreen
              parties={parties}
              invoices={invoices}
              business={businessDetails}
              onPartyUpdated={() => {}}
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
              onPaymentRecorded={() => {}}
              selectedPartyFromParties={partyForPaymentOut}
              onClearSelectedParty={() => setPartyForPaymentOut(null)}
            />
          )}

          {activeTab === 'expenses' && (
            <ExpenseScreen
              expenses={expenses}
              business={businessDetails}
              onExpenseRecorded={() => {}}
            />
          )}

          {activeTab === 'purchase' && (
            <PurchaseBillListScreen
              purchaseBills={purchaseBills}
              business={businessDetails}
              onCreateBill={() => setActiveTab('create-purchase-bill')}
              onBillUpdated={() => {}}
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
              onPOUpdated={() => {}}
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

          {activeTab === 'ledger' && (
            <LedgerScreen accounts={accounts} journalEntries={journalEntries} business={businessDetails} />
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
              onPaymentRecorded={() => {}}
              selectedPartyFromParties={partyForPaymentIn}
              onClearSelectedParty={() => setPartyForPaymentIn(null)}
            />
          )}

          {activeTab === 'estimates' && (
            <EstimateListScreen
              estimates={estimates}
              business={businessDetails}
              onCreateEstimate={() => setActiveTab('create-estimate')}
              onEstimateUpdated={() => {}}
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

          {activeTab === 'reports' && <ReportsScreen invoices={invoices} />}

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
    </div>
  );
}

export default App;
