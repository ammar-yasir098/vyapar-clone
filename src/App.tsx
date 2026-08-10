import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seedDatabaseIfEmpty, DEFAULT_BUSINESS } from './db';
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
import { Invoice } from './types';
import { triggerThermalPrint } from './services/printer';
import { fetchServerItems, fetchServerParties, fetchServerInvoices } from './services/api';

export function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Initialize & Sync with PostgreSQL Backend
  useEffect(() => {
    async function syncPostgresToClient() {
      await seedDatabaseIfEmpty();

      try {
        // Fetch live data from PostgreSQL API
        const serverItems = await fetchServerItems();
        const serverParties = await fetchServerParties();
        const serverInvoices = await fetchServerInvoices();

        // If PostgreSQL server returns records, sync to local IndexedDB
        if (serverItems && serverItems.length > 0) {
          await db.items.clear();
          await db.items.bulkAdd(serverItems);
        }

        if (serverParties && serverParties.length > 0) {
          await db.parties.clear();
          await db.parties.bulkAdd(serverParties);
        }

        if (serverInvoices && serverInvoices.length > 0) {
          await db.invoices.clear();
          await db.invoices.bulkAdd(serverInvoices);
        }
      } catch (err) {
        console.warn('Backend server offline or unreachable. Operating in local mode.', err);
      }

      setIsDbLoaded(true);
    }

    syncPostgresToClient();
  }, []);

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

  // Reactive Dexie Live Queries
  const items = useLiveQuery(() => db.items.toArray(), []) || [];
  const parties = useLiveQuery(() => db.parties.toArray(), []) || [];
  const invoices = useLiveQuery(() => db.invoices.reverse().toArray(), []) || [];
  const accounts = useLiveQuery(() => db.ledgerAccounts.toArray(), []) || [];
  const journalEntries = useLiveQuery(() => db.journalEntries.reverse().toArray(), []) || [];

  const handleInvoiceCreated = (invoice: Invoice) => {
    triggerThermalPrint(invoice, DEFAULT_BUSINESS, '80mm');
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
        business={DEFAULT_BUSINESS}
        itemCount={items.length}
        invoiceCount={invoices.length}
        activeTab={activeTab}
        onNavigateToTab={setActiveTab}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
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
              business={DEFAULT_BUSINESS}
              onInvoiceCreated={handleInvoiceCreated}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryScreen items={items} onItemUpdated={() => {}} />
          )}

          {activeTab === 'parties' && (
            <PartiesScreen parties={parties} onPartyUpdated={() => {}} />
          )}

          {activeTab === 'purchase' && (
            <PurchaseScreen
              items={items}
              parties={parties}
              business={DEFAULT_BUSINESS}
              onPurchaseCreated={() => {}}
            />
          )}

          {activeTab === 'ledger' && (
            <LedgerScreen accounts={accounts} journalEntries={journalEntries} />
          )}

          {activeTab === 'invoices' && (
            <InvoicesScreen invoices={invoices} business={DEFAULT_BUSINESS} />
          )}

          {activeTab === 'gst' && (
            <GSTComplianceScreen invoices={invoices} business={DEFAULT_BUSINESS} />
          )}

          {activeTab === 'reports' && <ReportsScreen invoices={invoices} />}

          {activeTab === 'settings' && <PrinterModal business={DEFAULT_BUSINESS} />}
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
    </div>
  );
}

export default App;
