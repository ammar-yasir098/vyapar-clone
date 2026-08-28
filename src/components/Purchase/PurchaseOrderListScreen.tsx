import React, { useState } from 'react';
import { 
  ShoppingBag, 
  Plus, 
  Search, 
  Printer, 
  Trash2, 
  Eye, 
  Clock, 
  X, 
  CheckCircle2,
  ArrowRightLeft,
  FileCheck
} from 'lucide-react';
import { PurchaseOrder, BusinessDetails, Party, Item, PurchaseBill } from '../../types';
import { db, getActiveTenantId } from '../../db';
import { updateServerPOStatus, deleteServerPurchaseOrder, createServerPurchase } from '../../services/api';
import { syncManager } from '../../services/sync';
import { useToast } from '../Common/ToastContext';

interface PurchaseOrderListScreenProps {
  purchaseOrders: PurchaseOrder[];
  business: BusinessDetails;
  parties: Party[];
  items: Item[];
  onCreatePO: () => void;
  onPOUpdated: () => void;
  onNavigateToPurchaseBill: () => void;
}

export const PurchaseOrderListScreen: React.FC<PurchaseOrderListScreenProps> = ({
  purchaseOrders,
  business,
  parties,
  items,
  onCreatePO,
  onPOUpdated,
  onNavigateToPurchaseBill
}) => {
  const { showToast, showConfirm } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const safeNum = (val: any): number => {
    if (val === null || val === undefined) return 0;
    const n = Number(val);
    return isNaN(n) || !isFinite(n) ? 0 : n;
  };

  const filteredOrders = purchaseOrders.filter(po => 
    po.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    po.supplierName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDeletePO = async (po: PurchaseOrder) => {
    if (!po.id && !po.poId) return;
    showConfirm({
      title: 'Delete Purchase Order',
      message: `Are you sure you want to delete PO ${po.poNumber}?`,
      type: 'danger',
      confirmText: 'Yes, Delete',
      onConfirm: async () => {
        if (po.id) await db.purchaseOrders.delete(po.id);
        try {
          if (po.id) await deleteServerPurchaseOrder(po.id);
        } catch {}
        showToast(`Purchase Order ${po.poNumber} deleted`, 'info');
        onPOUpdated();
        if (selectedPO?.id === po.id) {
          setIsDetailModalOpen(false);
          setIsPrintModalOpen(false);
        }
      }
    });
  };

  // Convert Purchase Order to Purchase Bill (Stock + Payable Ledger Entry)
  const handleConvertToPurchaseBill = async (po: PurchaseOrder) => {
    showConfirm({
      title: 'Convert PO to Purchase Bill',
      message: `Do you want to convert Purchase Order ${po.poNumber} into a Purchase Bill? This will update item stock levels and supplier payables!`,
      type: 'info',
      confirmText: 'Yes, Convert Now',
      onConfirm: async () => {
        const currentTenantId = getActiveTenantId(business);
        const billNumber = `PUR-PO-${po.poNumber.replace(/[^0-9]/g, '') || Date.now().toString().slice(-4)}`;
        const billDate = new Date().toISOString().split('T')[0];

        // Find or fallback supplier party
        const supplier = parties.find(p => p.id === po.supplierId || p.name.toLowerCase() === po.supplierName.toLowerCase()) || {
          id: po.supplierId,
          name: po.supplierName,
          phone: po.supplierPhone || '',
          currentBalance: 0
        };

        const convertedItems = po.items.map(item => ({
          itemId: item.itemId || 1,
          itemName: item.itemName,
          hsnSacCode: '1000',
          unitType: (item.unitType || 'PCS') as any,
          quantity: item.quantity,
          unitPrice: item.purchasePrice,
          purchasePrice: item.purchasePrice,
          cgstRate: 0,
          sgstRate: 0,
          igstRate: 0,
          taxAmount: 0,
          totalAmount: item.totalAmount
        }));

        // 0. Create persistent PurchaseBill record in Dexie IndexedDB
        const billId = `pur-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newPurchaseBill: PurchaseBill = {
          billId,
          tenantId: currentTenantId,
          billNumber,
          billDate,
          supplierId: supplier.id,
          supplierName: supplier.name,
          supplierPhone: supplier.phone || '',
          items: convertedItems.map(i => ({
            itemId: i.itemId,
            itemName: i.itemName,
            unitType: i.unitType,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            purchasePrice: i.purchasePrice,
            totalAmount: i.totalAmount
          })),
          subtotal: po.grandTotal,
          taxTotal: 0,
          grandTotal: po.grandTotal,
          notes: `Converted from PO ${po.poNumber}`,
          createdAt: new Date().toISOString()
        };

        await db.purchaseBills.add(newPurchaseBill);

        // 1. Stock Inward: Increase Item stock levels in Dexie DB & update location mapping
        for (const pItem of convertedItems) {
          const dbItem = await db.items.get(pItem.itemId);
          if (dbItem) {
            const newStock = safeNum(dbItem.currentStock) + safeNum(pItem.quantity);
            await db.items.update(pItem.itemId, {
              currentStock: newStock,
              purchasePrice: pItem.unitPrice,
              updatedAt: new Date().toISOString()
            });
          }

          if (po.receivingLocationId) {
            const locIdNum = Number(po.receivingLocationId);
            const existingMapping = await db.itemLocations
              .filter(il => Number(il.itemId) === Number(pItem.itemId) && Number(il.locationId) === locIdNum)
              .first();

            if (existingMapping && existingMapping.id) {
              const newLocQty = (existingMapping.quantity || 0) + pItem.quantity;
              await db.itemLocations.update(existingMapping.id, {
                quantity: newLocQty,
                updatedAt: new Date().toISOString()
              });
            } else {
              await db.itemLocations.add({
                tenantId: currentTenantId,
                itemId: pItem.itemId,
                locationId: locIdNum,
                quantity: pItem.quantity,
                updatedAt: new Date().toISOString()
              });
            }
          }

          await db.itemRestocks.add({
            itemId: pItem.itemId,
            itemName: pItem.itemName,
            tenantId: currentTenantId,
            supplierId: supplier.id,
            supplierName: supplier.name,
            supplierPhone: supplier.phone || '',
            billNumber,
            restockDate: billDate,
            quantityAdded: pItem.quantity,
            purchasePrice: pItem.unitPrice,
            totalCost: pItem.totalAmount,
            source: 'PURCHASE_BILL',
            createdAt: new Date().toISOString()
          });
        }

        // 2. Update Supplier Accounts Payable Ledger Balance
        if (supplier.id) {
          const curBal = safeNum(supplier.currentBalance);
          const newBal = curBal + po.grandTotal;
          await db.parties.update(supplier.id, { currentBalance: newBal });
          await syncManager.logMutation('PARTY', String(supplier.id), 'UPDATE', { id: supplier.id, currentBalance: newBal });
        }

        // 3. Update PO status to CONVERTED in Dexie & PostgreSQL
        if (po.id) {
          await db.purchaseOrders.update(po.id, { status: 'CONVERTED', updatedAt: new Date().toISOString() });
          await updateServerPOStatus(po.id, 'CONVERTED');
        }

        // 5. Send purchase bill to PostgreSQL server API
        try {
          await createServerPurchase({
            billNumber,
            billDate,
            supplierId: supplier.id,
            supplierName: supplier.name,
            items: convertedItems,
            tenantId: currentTenantId
          });
        } catch {}

        showToast(`PO ${po.poNumber} successfully converted to Purchase Bill ${billNumber}! Stock & payables updated.`, 'success');
        onPOUpdated();
        setIsDetailModalOpen(false);
      }
    });
  };

  return (
    <div className="flex-1 bg-[#f0f4f8] p-6 overflow-y-auto flex flex-col justify-between select-none">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-100 rounded-xl text-blue-700">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Purchase Orders (PO)</h1>
                <p className="text-xs text-slate-500 font-medium">Draft demand notes for suppliers — Does NOT deduct stock or add payables until converted</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onCreatePO}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-md transition cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Create Purchase Order</span>
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Orders</div>
              <div className="text-2xl font-black text-slate-800 mt-1">{purchaseOrders.length}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Orders</div>
              <div className="text-2xl font-black text-amber-600 mt-1">
                {purchaseOrders.filter(po => po.status === 'PENDING').length}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Quoted Cost</div>
              <div className="text-2xl font-black text-emerald-600 mt-1">
                Rs. {purchaseOrders.reduce((acc, po) => acc + (po.grandTotal || 0), 0).toLocaleString()}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              Rs
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by PO number or supplier name..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="text-xs font-semibold text-slate-500 shrink-0">
            Showing <span className="text-slate-900 font-bold">{filteredOrders.length}</span> order(s)
          </div>
        </div>

        {/* Purchase Orders Table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {filteredOrders.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 mb-1">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <div className="text-sm font-bold text-slate-700">No Purchase Orders Found</div>
              <p className="text-xs text-slate-400 max-w-sm">
                Send demand notes to your suppliers by creating a new Purchase Order.
              </p>
              <button
                onClick={onCreatePO}
                className="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm cursor-pointer"
              >
                Create Purchase Order
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">PO Number</th>
                    <th className="py-3 px-4">Order Date</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4">Items</th>
                    <th className="py-3 px-4 text-right">Order Cost</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredOrders.map(po => (
                    <tr key={po.id || po.poId} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4 font-bold text-slate-900 font-mono">
                        {po.poNumber}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-mono">
                        {po.poDate}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{po.supplierName}</div>
                        {po.supplierPhone && <div className="text-[10px] text-slate-400">{po.supplierPhone}</div>}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-600">
                        {po.items?.length || 0} item(s)
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-slate-900">
                        Rs. {(po.grandTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${
                          po.status === 'CONVERTED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : po.status === 'CANCELLED'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {po.status || 'PENDING'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {po.status === 'PENDING' && (
                            <button
                              onClick={() => handleConvertToPurchaseBill(po)}
                              className="px-2.5 py-1 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-bold text-[11px] transition cursor-pointer flex items-center gap-1 border border-emerald-200"
                              title="Convert to Purchase Bill"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                              <span>Convert to Bill</span>
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setSelectedPO(po);
                              setIsDetailModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                            title="View PO Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => {
                              setSelectedPO(po);
                              setIsPrintModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                            title="Print PO Receipt"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeletePO(po)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                            title="Delete PO"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* DETAIL MODAL */}
      {isDetailModalOpen && selectedPO && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-blue-400" />
                <span className="font-bold text-sm">Purchase Order Details - {selectedPO.poNumber}</span>
              </div>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-xs">
                <div>
                  <div className="text-slate-400 font-semibold uppercase text-[10px]">Supplier</div>
                  <div className="font-bold text-slate-800 text-sm mt-0.5">{selectedPO.supplierName}</div>
                  {selectedPO.supplierPhone && <div className="text-slate-500">{selectedPO.supplierPhone}</div>}
                </div>
                <div className="text-right">
                  <div className="text-slate-400 font-semibold uppercase text-[10px]">Order Date</div>
                  <div className="font-bold text-slate-800 text-sm mt-0.5">{selectedPO.poDate}</div>
                  <div className="text-blue-600 font-bold uppercase text-[10px] mt-0.5">Status: {selectedPO.status}</div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">Ordered Products</h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-bold">
                      <tr>
                        <th className="py-2 px-3">Item Name</th>
                        <th className="py-2 px-3 text-center">Qty</th>
                        <th className="py-2 px-3 text-right">Expected Rate</th>
                        <th className="py-2 px-3 text-right">Total Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedPO.items?.map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-semibold text-slate-800">{item.itemName}</td>
                          <td className="py-2 px-3 text-center font-mono">{item.quantity} {item.unitType || 'PCS'}</td>
                          <td className="py-2 px-3 text-right font-mono">Rs. {item.purchasePrice}</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900 font-mono">Rs. {item.totalAmount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedPO.notes && (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-800">
                  <span className="font-bold block mb-0.5">Order Notes:</span>
                  {selectedPO.notes}
                </div>
              )}

              <div className="border-t border-slate-200 pt-3 flex flex-col items-end gap-1 text-xs">
                <div className="flex justify-between w-48 font-black text-slate-900 text-sm border-slate-200">
                  <span>Grand Total:</span>
                  <span className="text-blue-600">Rs. {selectedPO.grandTotal}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between items-center">
              <div>
                {selectedPO.status === 'PENDING' && (
                  <button
                    onClick={() => handleConvertToPurchaseBill(selectedPO)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileCheck className="w-4 h-4" />
                    <span>Convert to Purchase Bill</span>
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setIsPrintModalOpen(true);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print PO Document</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT PO RECEIPT MODAL (A4 Professional Template) */}
      {isPrintModalOpen && selectedPO && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white px-6 py-3.5 flex items-center justify-between">
              <span className="font-bold text-sm flex items-center gap-2">
                <Printer className="w-4 h-4 text-blue-400" />
                <span>Print A4 Purchase Order</span>
              </span>
              <button onClick={() => setIsPrintModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[80vh]">
              <div id="po-print-area" className="bg-white p-8 font-sans text-slate-900 border border-slate-300 rounded-xl shadow-xs space-y-6">
                <div className="flex justify-between items-start border-b border-slate-300 pb-6">
                  <div className="space-y-1">
                    <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{business.name || 'Company Name'}</h1>
                    <p className="text-xs text-slate-600 font-medium">{business.address || 'Store Location / Street Address'}</p>
                    <p className="text-xs text-slate-600">Phone: {business.phone || '+92 300 0000000'}</p>
                    {business.gstin && <p className="text-xs text-slate-600 font-mono font-semibold">{business.gstin}</p>}
                  </div>

                  <div className="flex flex-col items-end space-y-3">
                    <h2 className="text-3xl font-black text-blue-800 uppercase tracking-wider">PURCHASE ORDER</h2>
                    
                    <table className="border-collapse border border-slate-400 text-[11px] font-sans w-64 text-center">
                      <thead>
                        <tr className="bg-slate-200 text-slate-800 font-bold uppercase border-b border-slate-400">
                          <th className="py-1 px-2 border-r border-slate-400">PO #</th>
                          <th className="py-1 px-2">DATE</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-slate-400 font-mono font-bold">
                          <td className="py-1 px-2 border-r border-slate-400 text-slate-900">{selectedPO.poNumber}</td>
                          <td className="py-1 px-2 text-slate-900">{selectedPO.poDate}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <div className="bg-slate-200 border border-slate-400 px-3 py-1.5 font-bold text-xs uppercase tracking-wider text-slate-800 mb-2">
                    VENDOR / SUPPLIER DETAILS
                  </div>
                  <div className="px-2 text-xs space-y-0.5">
                    <div className="font-bold text-slate-900 text-sm">{selectedPO.supplierName}</div>
                    {selectedPO.supplierPhone && <div className="text-slate-600">Phone: {selectedPO.supplierPhone}</div>}
                  </div>
                </div>

                <div className="border border-slate-400 rounded-xs overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-200 text-slate-800 font-extrabold uppercase border-b border-slate-400">
                        <th className="py-2 px-3 border-r border-slate-400">PRODUCT DESCRIPTION</th>
                        <th className="py-2 px-3 text-center border-r border-slate-400 w-20">QTY</th>
                        <th className="py-2 px-3 text-right border-r border-slate-400 w-28">RATE</th>
                        <th className="py-2 px-3 text-right w-32">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      {selectedPO.items?.map((item, idx) => (
                        <tr key={idx} className="font-medium text-slate-800">
                          <td className="py-2.5 px-3 border-r border-slate-300 font-bold">{item.itemName}</td>
                          <td className="py-2.5 px-3 text-center border-r border-slate-300 font-mono">{item.quantity} {item.unitType || 'PCS'}</td>
                          <td className="py-2.5 px-3 text-right border-r border-slate-300 font-mono">Rs. {(item.purchasePrice || 0).toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">Rs. {(item.totalAmount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between items-start pt-2">
                  <div className="italic text-xs text-slate-600 font-medium">
                    Please deliver the products as per specified rates.
                  </div>

                  <table className="border-collapse border border-slate-400 text-xs w-64">
                    <tbody>
                      <tr className="bg-slate-200 border-t-2 border-slate-400">
                        <td className="py-2 px-3 font-black uppercase text-slate-900 text-sm">TOTAL ORDER COST</td>
                        <td className="py-2 px-3 text-right font-black text-slate-900 text-sm font-mono">
                          Rs. {(selectedPO.grandTotal || 0).toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsPrintModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Purchase Order</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
