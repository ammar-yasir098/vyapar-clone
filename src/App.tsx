import React, { useState, useEffect } from 'react';
import { Building2, Store } from 'lucide-react';
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
import { PurchaseReturnListScreen } from './components/PurchaseReturn/PurchaseReturnListScreen';
import { CreatePurchaseReturnScreen } from './components/PurchaseReturn/CreatePurchaseReturnScreen';
import { SaleReturnListScreen } from './components/SaleReturn/SaleReturnListScreen';
import { CreateSaleReturnScreen } from './components/SaleReturn/CreateSaleReturnScreen';
import { CashInHandScreen } from './components/CashBank/CashInHandScreen';
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
  fetchServerLedgerAccounts,
  fetchServerJournalEntries,
  fetchServerEstimates,
  fetchServerPaymentsIn,
  fetchServerPurchaseOrders,
  fetchServerPurchaseBills,
  fetchServerPaymentsOut,
  fetchServerExpenses,
  fetchServerPurchaseReturns,
  fetchServerSaleReturns,
  fetchServerCashTransactions,
  deleteServerCompanyProfile
} from './services/api';
import { syncLedgerAccountBalances } from './services/ledger';
import { useToast } from './components/Common/ToastContext';

export function App() {
  const { showToast, showConfirm } = useToast();

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
      // 1. Read local Dexie companyProfiles FIRST for 0ms instant startup & tenant resolution
      const localDexieProfiles = await db.companyProfiles.toArray();
      let activeTenantId = currentTenantId || localStorage.getItem('vyapar_current_tenant') || '';

      if (localDexieProfiles && localDexieProfiles.length > 0) {
        const mappedLocal = localDexieProfiles.map(c => ({
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

        // Ensure active company profile does not silently default to 'default-tenant' if other active companies exist
        const validActive = mappedLocal.find(c => c.tenantId && c.tenantId === activeTenantId)
          || mappedLocal.find(c => c.tenantId && c.tenantId !== 'default-tenant')
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
        activeTenantId = localSaved.tenantId || activeTenantId || 'default-tenant';
        const defaultProfile: BusinessDetails = { ...localSaved, tenantId: activeTenantId };
        setBusinessDetails(defaultProfile);
        setCompanies([defaultProfile]);
        if (activeTenantId !== currentTenantId) {
          setCurrentTenantId(activeTenantId);
          localStorage.setItem('vyapar_current_tenant', activeTenantId);
        }
        try {
          await db.companyProfiles.put({
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

      // Seed tenant ledger accounts & walk-in party
      await seedLedgerAccountsForTenant(activeTenantId);
      await seedWalkInCustomerForTenant(activeTenantId);

      // Log startup local records count
      const localItemCount = await db.items.filter(i => (i.tenantId || 'default-tenant') === activeTenantId).count();
      const localPartyCount = await db.parties.filter(p => (p.tenantId || 'default-tenant') === activeTenantId).count();
      const localInvoiceCount = await db.invoices.filter(i => (i.tenantId || 'default-tenant') === activeTenantId).count();

      console.log(`[Sync] Local records loaded: ${localItemCount} items, ${localPartyCount} parties, ${localInvoiceCount} invoices`);

      setIsDbLoaded(true);

      // Fast health check: if backend server is offline, skip network calls to prevent UI delays
      const isOnline = await checkServerHealth(1500);
      if (!isOnline) {
        if (localItemCount === 0) {
          await seedDatabaseIfEmpty(activeTenantId);
        }
        console.warn('Backend server offline or unreachable. Operating in 100% local Dexie offline mode.');
        return;
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

        // Fetch live catalog, parties, and invoices for activeTenantId from PostgreSQL API concurrently
        const [
          serverItems,
          serverParties,
          serverInvoices,
          serverAccounts,
          serverJournals,
          serverEstimates,
          serverPaymentsIn,
          serverPOs,
          serverPBills,
          serverPaymentsOut,
          serverExpenses,
          serverReturns,
          serverSaleReturns,
          serverCashTxns
        ] = await Promise.all([
          fetchServerItems(activeTenantId),
          fetchServerParties(activeTenantId),
          fetchServerInvoices(activeTenantId),
          fetchServerLedgerAccounts(activeTenantId),
          fetchServerJournalEntries(activeTenantId),
          fetchServerEstimates(activeTenantId),
          fetchServerPaymentsIn(activeTenantId),
          fetchServerPurchaseOrders(activeTenantId),
          fetchServerPurchaseBills(activeTenantId),
          fetchServerPaymentsOut(activeTenantId),
          fetchServerExpenses(activeTenantId),
          fetchServerPurchaseReturns(activeTenantId),
          fetchServerSaleReturns(activeTenantId),
          fetchServerCashTransactions(activeTenantId)
        ]);

        const pulledCount = (serverItems?.length || 0) + (serverParties?.length || 0) + (serverInvoices?.length || 0) + (serverEstimates?.length || 0) + (serverPaymentsIn?.length || 0) + (serverPOs?.length || 0) + (serverPBills?.length || 0) + (serverPaymentsOut?.length || 0) + (serverExpenses?.length || 0) + (serverReturns?.length || 0) + (serverSaleReturns?.length || 0) + (serverCashTxns?.length || 0);

        console.log(`[Sync] Pulled from Postgres: ${pulledCount} records`);

        // Only seed sample database if local tables AND cloud fetched items are completely empty
        if (localItemCount === 0 && (!serverItems || serverItems.length === 0)) {
          await seedDatabaseIfEmpty(activeTenantId);
        }

        // 1. Items Sync with pending mutation protection
        if (serverItems && serverItems.length > 0) {
          for (const sItem of serverItems) {
            const existing = await db.items.where('name').equalsIgnoreCase(sItem.name).first();
            const itemData = { ...sItem, tenantId: sItem.tenantId || activeTenantId };
            if (existing && existing.id) {
              if (await hasPendingLocalMutation('ITEM', existing.id)) continue;
              await db.items.update(existing.id, itemData);
            } else {
              await db.items.add(itemData);
            }
          }
        }

        // 2. Parties Sync with pending mutation protection
        if (serverParties && serverParties.length > 0) {
          for (const sParty of serverParties) {
            const existing = await db.parties.where('name').equalsIgnoreCase(sParty.name).first();
            const partyData = { ...sParty, tenantId: sParty.tenantId || activeTenantId };
            if (existing && existing.id) {
              if (await hasPendingLocalMutation('PARTY', existing.id)) continue;
              await db.parties.update(existing.id, partyData);
            } else {
              await db.parties.add(partyData);
            }
          }
        }

        // 3. Invoices Sync with child array reconstruction & pending mutation protection
        if (serverInvoices && serverInvoices.length > 0) {
          for (const sInv of serverInvoices) {
            const rawInv = sInv.dataValues || sInv;
            const invId = rawInv.invoiceId || rawInv.invoice_id;
            const invNum = rawInv.invoiceNumber || rawInv.invoice_number;

            const existing = await db.invoices
              .filter(i => (invId && i.invoiceId === invId) || (invNum && i.invoiceNumber === invNum))
              .first();

            const invData = {
              ...rawInv,
              invoiceId: invId || `inv-${Date.now()}-${Math.random()}`,
              invoiceNumber: invNum || `INV-${Date.now()}`,
              items: rawInv.items || rawInv.invoice_items || [],
              tenantId: rawInv.tenantId || rawInv.tenant_id || activeTenantId
            };

            if (existing && existing.id) {
              if (await hasPendingLocalMutation('INVOICE', existing.id) || await hasPendingLocalMutation('INVOICE', existing.invoiceId)) continue;
              await db.invoices.update(existing.id, invData);
            } else {
              await db.invoices.add(invData);
            }
          }
        }

        // 4. Ledger Accounts Sync
        if (serverAccounts && serverAccounts.length > 0) {
          for (const sAcc of serverAccounts) {
            const existing = await db.ledgerAccounts
              .filter(a => a.accountCode === sAcc.accountCode)
              .first();
            const accData = { ...sAcc, tenantId: sAcc.tenantId || activeTenantId };
            if (existing && existing.id) {
              await db.ledgerAccounts.update(existing.id, accData);
            } else {
              await db.ledgerAccounts.add(accData);
            }
          }
        }

        // 5. Journal Entries Sync
        if (serverJournals && serverJournals.length > 0) {
          for (const sJe of serverJournals) {
            const existing = await db.journalEntries
              .filter(j => j.entryNumber === sJe.entryNumber)
              .first();
            const jeData = { ...sJe, tenantId: sJe.tenantId || activeTenantId };
            if (existing && existing.id) {
              await db.journalEntries.update(existing.id, jeData);
            } else {
              await db.journalEntries.add(jeData);
            }
          }
        }

        // 6. Estimates Sync
        if (serverEstimates && serverEstimates.length > 0) {
          for (const sEst of serverEstimates) {
            const existing = await db.estimates.where('estimateId').equals(sEst.estimateId).first();
            const estData = {
              ...sEst,
              items: sEst.items || sEst.estimate_items || [],
              tenantId: sEst.tenantId || activeTenantId
            };
            if (existing && existing.id) {
              if (await hasPendingLocalMutation('ESTIMATE', existing.id) || await hasPendingLocalMutation('ESTIMATE', existing.estimateId)) continue;
              await db.estimates.update(existing.id, estData);
            } else {
              await db.estimates.add(estData);
            }
          }
        }

        // 7. Payment-In Sync
        if (serverPaymentsIn && serverPaymentsIn.length > 0) {
          for (const sPay of serverPaymentsIn) {
            const existing = await db.paymentIn.where('receiptNumber').equals(sPay.receiptNumber).first();
            const payData = { ...sPay, tenantId: sPay.tenantId || activeTenantId };
            if (existing && existing.id) {
              if (await hasPendingLocalMutation('PAYMENT_IN', existing.id) || await hasPendingLocalMutation('PAYMENT_IN', existing.receiptNumber)) continue;
              await db.paymentIn.update(existing.id, payData);
            } else {
              await db.paymentIn.add(payData);
            }
          }
        }

        // 8. Purchase Orders Sync
        if (serverPOs && serverPOs.length > 0) {
          for (const sPo of serverPOs) {
            const existing = await db.purchaseOrders.where('poId').equals(sPo.poId).first();
            const poData = {
              ...sPo,
              items: sPo.items || sPo.purchase_order_items || [],
              tenantId: sPo.tenantId || activeTenantId
            };
            if (existing && existing.id) {
              if (await hasPendingLocalMutation('PURCHASE_ORDER', existing.id) || await hasPendingLocalMutation('PURCHASE_ORDER', existing.poId)) continue;
              await db.purchaseOrders.update(existing.id, poData);
            } else {
              await db.purchaseOrders.add(poData);
            }
          }
        }

        // 9. Purchase Bills Sync
        if (serverPBills && serverPBills.length > 0) {
          for (const sBill of serverPBills) {
            const rawBill = sBill.dataValues || sBill;
            const bId = rawBill.billId || rawBill.bill_id;
            const bNum = rawBill.billNumber || rawBill.bill_number;
            const existing = await db.purchaseBills.filter(b => (bId && b.billId === bId) || (bNum && b.billNumber === bNum)).first();
            const billData = {
              ...rawBill,
              billId: bId || `pur-${Date.now()}`,
              billNumber: bNum || `PUR-${Date.now()}`,
              items: rawBill.items || rawBill.purchase_bill_items || [],
              tenantId: rawBill.tenantId || rawBill.tenant_id || activeTenantId
            };
            if (existing && existing.id) {
              if (await hasPendingLocalMutation('PURCHASE_BILL', existing.id) || await hasPendingLocalMutation('PURCHASE_BILL', existing.billId)) continue;
              await db.purchaseBills.update(existing.id, billData);
            } else {
              await db.purchaseBills.add(billData);
            }
          }
        }

        // 10. Payment-Out Sync
        if (serverPaymentsOut && serverPaymentsOut.length > 0) {
          for (const sPay of serverPaymentsOut) {
            const existing = await db.paymentOut.where('receiptNumber').equals(sPay.receiptNumber).first();
            const payData = { ...sPay, tenantId: sPay.tenantId || activeTenantId };
            if (existing && existing.id) {
              if (await hasPendingLocalMutation('PAYMENT_OUT', existing.id) || await hasPendingLocalMutation('PAYMENT_OUT', existing.receiptNumber)) continue;
              await db.paymentOut.update(existing.id, payData);
            } else {
              await db.paymentOut.add(payData);
            }
          }
        }

        // 11. Expenses Sync
        if (serverExpenses && serverExpenses.length > 0) {
          for (const sExp of serverExpenses) {
            const existing = await db.expenses.where('expenseNumber').equals(sExp.expenseNumber).first();
            const expData = { ...sExp, tenantId: sExp.tenantId || activeTenantId };
            if (existing && existing.id) {
              if (await hasPendingLocalMutation('EXPENSE', existing.id) || await hasPendingLocalMutation('EXPENSE', existing.expenseNumber)) continue;
              await db.expenses.update(existing.id, expData);
            } else {
              await db.expenses.add(expData);
            }
          }
        }

        // 12. Purchase Returns Sync
        if (serverReturns && serverReturns.length > 0) {
          for (const sRet of serverReturns) {
            const rawRet = sRet.dataValues || sRet;
            const rId = rawRet.returnId || rawRet.return_id;
            const dnNum = rawRet.debitNoteNumber || rawRet.debit_note_number;
            const existing = await db.purchaseReturns.filter(r => (rId && r.returnId === rId) || (dnNum && r.debitNoteNumber === dnNum)).first();
            const retData = {
              ...rawRet,
              returnId: rId || `dn-${Date.now()}`,
              debitNoteNumber: dnNum || `DN-${Date.now()}`,
              items: rawRet.items || rawRet.purchase_return_items || [],
              tenantId: rawRet.tenantId || rawRet.tenant_id || activeTenantId
            };
            if (existing && existing.id) {
              if (await hasPendingLocalMutation('PURCHASE_RETURN', existing.id) || await hasPendingLocalMutation('PURCHASE_RETURN', existing.returnId)) continue;
              await db.purchaseReturns.update(existing.id, retData);
            } else {
              await db.purchaseReturns.add(retData);
            }
          }
        }

        // 13. Sale Returns Sync
        if (serverSaleReturns && serverSaleReturns.length > 0) {
          for (const sRet of serverSaleReturns) {
            const rawRet = sRet.dataValues || sRet;
            const rId = rawRet.returnId || rawRet.return_id;
            const crNum = rawRet.creditNoteNumber || rawRet.credit_note_number;
            const existing = await db.saleReturns.filter(r => (rId && r.returnId === rId) || (crNum && r.creditNoteNumber === crNum)).first();
            const retData = {
              ...rawRet,
              returnId: rId || `cr-${Date.now()}`,
              creditNoteNumber: crNum || `CR-${Date.now()}`,
              items: rawRet.items || rawRet.sale_return_items || [],
              tenantId: rawRet.tenantId || rawRet.tenant_id || activeTenantId
            };
            if (existing && existing.id) {
              if (await hasPendingLocalMutation('SALE_RETURN', existing.id) || await hasPendingLocalMutation('SALE_RETURN', existing.returnId)) continue;
              await db.saleReturns.update(existing.id, retData);
            } else {
              await db.saleReturns.add(retData);
            }
          }
        }

        // 14. Cash Transactions Sync
        if (serverCashTxns && serverCashTxns.length > 0) {
          for (const sTx of serverCashTxns) {
            const rawTx = sTx.dataValues || sTx;
            const refId = rawTx.referenceId || rawTx.reference_id;
            const existing = await db.cashTransactions
              .filter(ct => (refId && ct.referenceId === refId) || (rawTx.id && String(ct.id) === String(rawTx.id)))
              .first();
            const txData = {
              ...rawTx,
              referenceId: refId || `TXN-${Date.now()}`,
              tenantId: rawTx.tenantId || rawTx.tenant_id || activeTenantId
            };
            if (existing && existing.id) {
              if (await hasPendingLocalMutation('CASH_TRANSACTION', existing.id) || await hasPendingLocalMutation('CASH_TRANSACTION', existing.referenceId)) continue;
              await db.cashTransactions.update(Number(existing.id), txData);
            } else {
              await db.cashTransactions.add(txData);
            }
          }
        }

        // Auto-migrate orphaned default-tenant records in local Dexie IndexedDB to active store tenantId
        if (activeTenantId && activeTenantId !== 'default-tenant') {
          const orphanedParties = await db.parties.filter(p => !p.tenantId || p.tenantId === 'default-tenant').toArray();
          for (const p of orphanedParties) {
            if (p.id) await db.parties.update(p.id, { tenantId: activeTenantId });
          }
          const orphanedItems = await db.items.filter(i => !i.tenantId || i.tenantId === 'default-tenant').toArray();
          for (const i of orphanedItems) {
            if (i.id) await db.items.update(i.id, { tenantId: activeTenantId });
          }
          const orphanedInvoices = await db.invoices.filter(i => !i.tenantId || i.tenantId === 'default-tenant').toArray();
          for (const inv of orphanedInvoices) {
            if (inv.id) await db.invoices.update(inv.id, { tenantId: activeTenantId });
          }
        }

        // Auto-deduplicate duplicate party entries in Dexie IndexedDB
        const allLocalParties = await db.parties.toArray();
        const seenPartyKeys = new Set<string>();
        for (const p of allLocalParties) {
          const key = `${p.tenantId || 'default-tenant'}_${(p.name || '').trim().toLowerCase()}`;
          if (seenPartyKeys.has(key)) {
            if (p.id) await db.parties.delete(p.id);
          } else {
            seenPartyKeys.add(key);
          }
        }
      } catch (err) {
        console.warn('Error during cloud database sync:', err);
      }
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
  const allPurchaseReturns = useLiveQuery(() => db.purchaseReturns.reverse().toArray(), []) || [];
  const allSaleReturns = useLiveQuery(() => db.saleReturns.reverse().toArray(), []) || [];
  const allCashTransactions = useLiveQuery(() => db.cashTransactions.reverse().toArray(), []) || [];

  const activeTenantId = currentTenantId || 'default-tenant';
  const items = allItems.filter(item => (item.tenantId || 'default-tenant') === activeTenantId);
  const parties = allParties.filter(party => (party.tenantId || 'default-tenant') === activeTenantId);
  const invoices = allInvoices.filter(inv => (inv.tenantId || 'default-tenant') === activeTenantId);
  const accounts = allAccounts.filter(acc => (acc.tenantId || 'default-tenant') === activeTenantId);
  const journalEntries = allJournalEntries.filter(je => (je.tenantId || 'default-tenant') === activeTenantId);
  const estimates = allEstimates.filter(est => (est.tenantId || 'default-tenant') === activeTenantId);
  const paymentsIn = allPaymentsIn.filter(p => (p.tenantId || 'default-tenant') === activeTenantId);
  const purchaseOrders = allPurchaseOrders.filter(po => (po.tenantId || 'default-tenant') === activeTenantId);
  const purchaseBills = allPurchaseBills.filter(pb => (pb.tenantId || 'default-tenant') === activeTenantId);
  const paymentsOut = allPaymentsOut.filter(po => (po.tenantId || 'default-tenant') === activeTenantId);
  const expenses = allExpenses.filter(e => (e.tenantId || 'default-tenant') === activeTenantId);
  const purchaseReturns = allPurchaseReturns.filter(pr => (pr.tenantId || 'default-tenant') === activeTenantId);
  const saleReturns = allSaleReturns.filter(sr => (sr.tenantId || 'default-tenant') === activeTenantId);
  const cashTransactions = allCashTransactions.filter(ct => (ct.tenantId || 'default-tenant') === activeTenantId);

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
          await db.ledgerAccounts.where('tenantId').equals(tenantIdToDelete).delete().catch(() => { });
          await db.journalEntries.where('tenantId').equals(tenantIdToDelete).delete().catch(() => { });
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
        onDeleteCompany={handleDeleteCompany}
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
              items={allItems}
              invoices={allInvoices}
              purchaseBills={allPurchaseBills}
              purchaseReturns={allPurchaseReturns}
              paymentsIn={allPaymentsIn}
              paymentsOut={allPaymentsOut}
              expenses={allExpenses}
              saleReturns={allSaleReturns}
              cashTransactions={allCashTransactions}
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
