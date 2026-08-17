import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { PurchaseOrder, PurchaseOrderItem, isDbConnected } from '../db/sequelize.js';

export const purchaseOrdersRouter = Router();

// GET /api/v1/purchase-orders - Fetch all purchase orders for tenant
purchaseOrdersRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { tenantId = 'default-tenant' } = req.query;

    if (isDbConnected()) {
      const tId = String(tenantId);
      const whereClause = {
        [Op.or]: [
          { tenantId: tId },
          { tenantId: 'default-tenant' },
          { tenantId: null as any }
        ]
      };
      const orders = await PurchaseOrder.findAll({
        where: whereClause,
        include: [{ model: PurchaseOrderItem, as: 'items' }],
        order: [['id', 'DESC']]
      });

      if (tId !== 'default-tenant' && orders.length > 0) {
        for (const po of orders) {
          if (!po.get('tenantId') || po.get('tenantId') === 'default-tenant') {
            await po.update({ tenantId: tId }).catch(() => {});
          }
        }
      }

      return res.json({ success: true, data: orders });
    }

    return res.json({ success: true, data: [] });
  } catch (err: any) {
    console.error('Error fetching purchase orders:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/purchase-orders - Create a new Purchase Order (No stock / cash impact)
purchaseOrdersRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      tenantId = 'default-tenant',
      poId,
      poNumber,
      poDate,
      supplierId,
      supplierName,
      supplierPhone,
      supplierGstin,
      subtotal = 0,
      taxTotal = 0,
      grandTotal = 0,
      status = 'PENDING',
      notes = '',
      items = []
    } = req.body;

    if (isDbConnected()) {
      const uniquePoId = poId || `PO-${Date.now()}`;
      const num = poNumber || `PO-${Math.floor(1000 + Math.random() * 9000)}`;

      const newPO = await PurchaseOrder.create({
        poId: uniquePoId,
        tenantId,
        poNumber: num,
        poDate: poDate || new Date().toISOString().split('T')[0],
        supplierId: supplierId || null,
        supplierName: supplierName || 'Supplier',
        supplierPhone: supplierPhone || '',
        supplierGstin: supplierGstin || '',
        subtotal,
        taxTotal,
        grandTotal,
        status,
        notes
      });

      if (items && Array.isArray(items)) {
        for (const item of items) {
          await PurchaseOrderItem.create({
            purchaseOrderId: newPO.id,
            itemId: item.itemId || item.id || null,
            itemName: item.itemName || item.name || 'Order Product',
            unitType: item.unitType || 'PCS',
            quantity: item.quantity || 1,
            purchasePrice: item.purchasePrice || item.unitPrice || 0,
            totalAmount: item.totalAmount || ((item.quantity || 1) * (item.purchasePrice || item.unitPrice || 0))
          });
        }
      }

      const fullPO = await PurchaseOrder.findByPk(newPO.id, {
        include: [{ model: PurchaseOrderItem, as: 'items' }]
      });

      return res.status(201).json({
        success: true,
        message: 'Purchase Order created in PostgreSQL',
        data: fullPO
      });
    }

    return res.status(201).json({ success: true, data: req.body });
  } catch (err: any) {
    console.error('Error creating purchase order:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/v1/purchase-orders/:id/status - Update PO status (e.g. PENDING -> CONVERTED)
purchaseOrdersRouter.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (isDbConnected()) {
      const po = await PurchaseOrder.findByPk(id as string);
      if (!po) {
        return res.status(404).json({ success: false, error: 'Purchase Order not found' });
      }
      await po.update({ status });
      return res.json({ success: true, message: `PO status updated to ${status}`, data: po });
    }

    return res.json({ success: true, message: 'Status updated (offline mode)' });
  } catch (err: any) {
    console.error('Error updating purchase order status:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/purchase-orders/:id - Delete a Purchase Order
purchaseOrdersRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (isDbConnected()) {
      await PurchaseOrder.destroy({ where: { id } });
      return res.json({ success: true, message: 'Purchase Order deleted' });
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting purchase order:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
