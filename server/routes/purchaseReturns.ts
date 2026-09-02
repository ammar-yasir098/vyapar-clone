import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { Item, Party, PurchaseReturn, PurchaseReturnItem, ItemLocationMapping, CashAccount, CashTransaction, isDbConnected, sequelize } from '../db/sequelize.js';

export const purchaseReturnsRouter = Router();

// GET /api/v1/purchase-returns - Fetch all debit notes for active tenant
purchaseReturnsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { tenantId = 'default-tenant' } = req.query;

    if (isDbConnected()) {
      const tId = String(tenantId);
      const returns = await PurchaseReturn.findAll({
        where: { tenantId: tId },
        include: [{ model: PurchaseReturnItem, as: 'items' }],
        order: [['id', 'DESC']]
      });

      return res.json({ success: true, data: returns });
    }

    return res.json({ success: true, data: [] });
  } catch (err: any) {
    console.error('Error fetching purchase returns:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/purchase-returns - Insert Purchase Return / Debit Note & update stock/payables using Sequelize ORM
purchaseReturnsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      returnId,
      debitNoteNumber = `DN-${Date.now().toString().slice(-4)}`,
      returnDate = new Date().toISOString().split('T')[0],
      purchaseBillNumber = '',
      supplierId,
      supplierName,
      supplierPhone = '',
      sourceLocationId,
      settlementMode = 'SUPPLIER_CREDIT', // 'CASH_REFUND' or 'SUPPLIER_CREDIT'
      items = [],
      notes = '',
      tenantId = 'default-tenant'
    } = req.body;

    if (!supplierName || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Supplier name and returned items are required' });
    }

    const totalReturnAmount = items.reduce((sum: number, item: any) => {
      const qty = Number(item.returnQuantity) || Number(item.quantity) || 1;
      const rate = Number(item.unitPrice) || Number(item.purchasePrice) || 0;
      return sum + (Number(item.totalAmount) || (qty * rate));
    }, 0);

    if (isDbConnected()) {
      const t = await sequelize.transaction();
      try {
        const uniqueReturnId = returnId || `dn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        // 1. Create PurchaseReturn record
        const newReturn = await PurchaseReturn.create({
          returnId: uniqueReturnId,
          tenantId,
          debitNoteNumber,
          returnDate,
          purchaseBillNumber,
          supplierId: supplierId ? String(supplierId) : null,
          supplierName,
          supplierPhone,
          sourceLocationId: sourceLocationId ? String(sourceLocationId) : null,
          subtotal: totalReturnAmount,
          grandTotal: totalReturnAmount,
          notes
        }, { transaction: t });

        // 2. Create PurchaseReturnItems & Deduct Item Stock Levels
        for (const item of items) {
          const returnQty = Number(item.returnQuantity) || Number(item.quantity) || 1;
          const rate = Number(item.unitPrice) || Number(item.purchasePrice) || 0;
          const itemTotal = Number(item.totalAmount) || (returnQty * rate);

          await PurchaseReturnItem.create({
            purchaseReturnId: String(newReturn.id),
            itemId: item.itemId ? String(item.itemId) : (item.id ? String(item.id) : null),
            itemName: item.itemName || item.name || 'Returned Item',
            unitType: item.unitType || 'PCS',
            returnQuantity: returnQty,
            unitPrice: rate,
            totalAmount: itemTotal
          }, { transaction: t });

          // Reduce Total Item Stock Level
          let dbItem = item.itemId ? await Item.findOne({ where: { id: String(item.itemId), tenantId }, transaction: t }) : null;
          if (!dbItem && item.itemName) {
            dbItem = await Item.findOne({ where: { name: item.itemName, tenantId }, transaction: t });
          }
          if (!dbItem && item.itemId) {
            dbItem = await Item.findByPk(String(item.itemId), { transaction: t });
          }

          if (dbItem) {
            const curStock = Number(dbItem.get('currentStock')) || 0;
            const newStock = Math.max(0, curStock - returnQty);
            await dbItem.update({ currentStock: newStock }, { transaction: t });

            // Reduce location mapping stock if sourceLocationId provided
            if (sourceLocationId) {
              const locIdStr = String(sourceLocationId);
              
              // 1. Deduct from direct mapping (root warehouse or store front)
              const directMapping = await ItemLocationMapping.findOne({
                where: { tenantId, itemId: String(dbItem.id), locationId: locIdStr },
                transaction: t
              });
              if (directMapping) {
                const curLocQty = Number(directMapping.get('quantity')) || 0;
                await directMapping.update({ quantity: Math.max(0, curLocQty - returnQty) }, { transaction: t });
              }

              // 2. If returning from Warehouse, also deduct from warehouse physical racks using FIFO
              const isWarehouse = locIdStr.startsWith('wh-');
              if (isWarehouse) {
                const rackMappings = await ItemLocationMapping.findAll({
                  where: {
                    tenantId,
                    itemId: String(dbItem.id),
                    locationId: { [Op.like]: 'rack-%' },
                    quantity: { [Op.gt]: 0 }
                  },
                  order: [['id', 'ASC']],
                  transaction: t
                });

                let remainingRackDeduct = returnQty;
                for (const rMap of rackMappings) {
                  if (remainingRackDeduct <= 0) break;
                  const currentRackQty = Number(rMap.get('quantity')) || 0;
                  const deductFromThisRack = Math.min(currentRackQty, remainingRackDeduct);
                  const newRackQty = currentRackQty - deductFromThisRack;
                  remainingRackDeduct -= deductFromThisRack;
                  await rMap.update({ quantity: newRackQty }, { transaction: t });
                }
              }
            }
          }
        }

        // 3. Settlement: Cash Refund In vs Supplier Ledger Deduction
        if (settlementMode === 'CASH_REFUND') {
          // Cash refund received from supplier -> Log Cash Inflow
          let cAccount = await CashAccount.findOne({ where: { tenantId }, transaction: t });
          if (!cAccount) {
            cAccount = await CashAccount.create({ tenantId, name: 'Main Cash Drawer', openingBalance: 0 }, { transaction: t });
          }
          await CashTransaction.create({
            cashAccountId: (cAccount as any).id,
            tenantId,
            type: 'IN',
            amount: totalReturnAmount,
            source: 'PURCHASE_RETURN_REFUND',
            referenceId: debitNoteNumber,
            description: `Cash refund received for Purchase Return ${debitNoteNumber} (${supplierName})`,
            transactionDate: returnDate || new Date().toISOString()
          }, { transaction: t });
        } else {
          // Deduct from Supplier Account Balance (Khata reduction)
          if (supplierId || supplierName) {
            let supplier = supplierId ? await Party.findByPk(String(supplierId), { transaction: t }) : null;
            if (!supplier && supplierName) {
              supplier = await Party.findOne({ where: { name: supplierName, tenantId }, transaction: t });
            }
            if (!supplier && supplierName) {
              supplier = await Party.findOne({ where: { name: supplierName }, transaction: t });
            }
            if (supplier) {
              const curBal = Number(supplier.get('currentBalance')) || 0;
              await supplier.update({ currentBalance: Math.max(0, curBal - totalReturnAmount) }, { transaction: t });
            }
          }
        }

        await t.commit();

        const fullReturn = await PurchaseReturn.findByPk(newReturn.id, {
          include: [{ model: PurchaseReturnItem, as: 'items' }]
        });

        return res.status(201).json({
          success: true,
          message: 'Purchase Return recorded in PostgreSQL. Stock and location mappings deducted.',
          data: fullReturn
        });
      } catch (err: any) {
        try {
          if (t && !(t as any).finished) {
            await t.rollback();
          }
        } catch (_) {}
        console.error('Purchase return error:', err);
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    return res.status(201).json({ success: true, data: req.body });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/purchase-returns/:id - Delete Purchase Return / Debit Note
purchaseReturnsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (isDbConnected()) {
      await PurchaseReturn.destroy({ where: { id } });
      return res.json({ success: true, message: 'Purchase Return deleted' });
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting purchase return:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
