import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { Estimate, EstimateItem, isDbConnected } from '../db/sequelize.js';

export const estimatesRouter = Router();

// GET /api/v1/estimates - Fetch all estimates for tenant
estimatesRouter.get('/', async (req: Request, res: Response) => {
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
      const estimates = await Estimate.findAll({
        where: whereClause,
        include: [{ model: EstimateItem, as: 'items' }],
        order: [['id', 'DESC']]
      });

      if (tId !== 'default-tenant' && estimates.length > 0) {
        for (const est of estimates) {
          if (!est.get('tenantId') || est.get('tenantId') === 'default-tenant') {
            await est.update({ tenantId: tId }).catch(() => {});
          }
        }
      }

      return res.json({ success: true, data: estimates });
    }

    return res.json({ success: true, data: [] });
  } catch (err: any) {
    console.error('Error fetching estimates:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/estimates - Create a new estimate/quotation (No stock reduction, no ledger entries)
estimatesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      tenantId = 'default-tenant',
      estimateId,
      estimateNumber,
      estimateDate,
      partyId,
      partyName,
      partyPhone,
      partyGstin,
      subtotal = 0,
      taxTotal = 0,
      discountTotal = 0,
      grandTotal = 0,
      status = 'OPEN',
      items = []
    } = req.body;

    if (isDbConnected()) {
      const uniqueEstId = estimateId || `EST-${Date.now()}`;
      const num = estimateNumber || `EST-${Math.floor(1000 + Math.random() * 9000)}`;

      const newEstimate = await Estimate.create({
        estimateId: uniqueEstId,
        tenantId,
        estimateNumber: num,
        estimateDate: estimateDate || new Date().toISOString().split('T')[0],
        partyId: partyId || null,
        partyName: partyName || 'Walk-in Customer',
        partyPhone: partyPhone || '',
        partyGstin: partyGstin || '',
        subtotal,
        taxTotal,
        discountTotal,
        grandTotal,
        status
      });

      if (items && Array.isArray(items)) {
        for (const item of items) {
          await EstimateItem.create({
            estimateId: newEstimate.id,
            itemId: item.itemId || item.id || null,
            itemName: item.itemName || item.name || 'Quoted Product',
            hsnSacCode: item.hsnSacCode || '',
            unitType: item.unitType || 'PCS',
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice || item.salesPrice || 0,
            taxAmount: item.taxAmount || 0,
            totalAmount: item.totalAmount || (item.quantity * (item.unitPrice || item.salesPrice || 0))
          });
        }
      }

      const fullEstimate = await Estimate.findByPk(newEstimate.id, {
        include: [{ model: EstimateItem, as: 'items' }]
      });

      return res.status(201).json({
        success: true,
        message: 'Estimate quotation created in PostgreSQL',
        data: fullEstimate
      });
    }

    return res.status(201).json({ success: true, data: req.body });
  } catch (err: any) {
    console.error('Error creating estimate:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/estimates/:id - Delete an estimate
estimatesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (isDbConnected()) {
      await Estimate.destroy({ where: { id } });
      return res.json({ success: true, message: 'Estimate deleted' });
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting estimate:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
