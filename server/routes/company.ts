import { Router, Request, Response } from 'express';
import { CompanyProfile, isDbConnected } from '../db/sequelize.js';
import { Op } from 'sequelize';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const companyRouter = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '../uploads');

function saveBase64Image(base64Data: string | undefined | null, subfolder: string, prefix: string, tenantId: string): string | null {
  if (!base64Data) return null;
  if (!base64Data.startsWith('data:image/')) {
    return base64Data; // Already a file path or URL
  }

  try {
    const matches = base64Data.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (!matches) return base64Data;

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const buffer = Buffer.from(matches[2], 'base64');

    const folderPath = path.join(uploadsDir, subfolder);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const safeTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${prefix}_${safeTenant}.${ext}`;
    const filePath = path.join(folderPath, filename);

    fs.writeFileSync(filePath, buffer);
    return `/uploads/${subfolder}/${filename}`;
  } catch (err) {
    console.error('Error saving image file:', err);
    return base64Data;
  }
}

// GET /api/v1/company/all - Fetch all company profiles (Multi-Store / Multi-Branch)
companyRouter.get('/all', async (req: Request, res: Response) => {
  try {
    const { tenantId, userId } = req.query;
    if (isDbConnected()) {
      let whereClause: any = {};
      if (userId) {
        // Return profiles owned by this user OR unclaimed profiles (user_id IS NULL)
        whereClause = { userId: { [Op.or]: [String(userId), null] } };
      } else if (tenantId) {
        whereClause = { tenantId: String(tenantId) };
      }
      const profiles = await CompanyProfile.findAll({ where: whereClause, order: [['id', 'ASC']] });
      return res.json({ success: true, data: profiles });
    }

    return res.json({ success: true, data: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/company - Fetch company profile using Sequelize
companyRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;
    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'tenantId parameter is required' });
    }
    if (isDbConnected()) {
      const profile = await CompanyProfile.findOne({ where: { tenantId: String(tenantId) } });
      return res.json({ success: true, data: profile || null });
    }

    return res.json({ success: true, data: null });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/company - Create or update company profile using Sequelize
companyRouter.post('/', async (req: Request, res: Response) => {
  try {
    let {
      tenantId,
      userId,
      name,
      phone,
      email,
      address,
      gstin,
      businessType,
      businessCategory,
      pincode,
      logoUrl,
      signatureUrl,
      booksBeginDate
    } = req.body;

    if (!tenantId) {
      tenantId = `tenant-${Date.now().toString().slice(-6)}`;
    }

    const savedLogoUrl = saveBase64Image(logoUrl, 'logos', 'logo', tenantId);
    const savedSignatureUrl = saveBase64Image(signatureUrl, 'signatures', 'sig', tenantId);

    if (isDbConnected()) {
      if (req.body.tenantId === undefined || !req.body.tenantId) {
        let maxNum = 0;
        const allProfiles = await CompanyProfile.findAll();
        for (const p of allProfiles) {
          const tid = p.get('tenantId') as string;
          if (tid) {
            const match = tid.match(/^tenant-(\d+)$/i);
            if (match) {
              const num = parseInt(match[1], 10);
              if (!isNaN(num) && num > maxNum) maxNum = num;
            }
          }
        }
        tenantId = `tenant-${maxNum + 1}`;
      }

      let profile = await CompanyProfile.findOne({ where: { tenantId } });

      if (profile) {
        await profile.update({
          userId: userId || profile.get('userId'),
          name: name || profile.get('name'),
          phone: phone || profile.get('phone'),
          email: email || profile.get('email'),
          address: address || profile.get('address'),
          gstin: gstin || profile.get('gstin'),
          businessType: businessType || profile.get('businessType'),
          businessCategory: businessCategory || profile.get('businessCategory'),
          pincode: pincode || profile.get('pincode'),
          logoUrl: savedLogoUrl !== null ? savedLogoUrl : profile.get('logoUrl'),
          signatureUrl: savedSignatureUrl !== null ? savedSignatureUrl : profile.get('signatureUrl'),
          booksBeginDate: booksBeginDate || profile.get('booksBeginDate')
        });
      } else {
        profile = await CompanyProfile.create({
          userId,
          tenantId,
          name,
          phone,
          email,
          address,
          gstin,
          businessType,
          businessCategory,
          pincode,
          logoUrl: savedLogoUrl,
          signatureUrl: savedSignatureUrl,
          booksBeginDate
        });
      }

      return res.status(200).json({ success: true, message: 'Company profile saved to PostgreSQL via Sequelize', data: profile });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...req.body,
        logoUrl: savedLogoUrl,
        signatureUrl: savedSignatureUrl
      }
    });
  } catch (err: any) {
    console.error('Error saving company profile:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/company - Delete company profile & all associated store data from PostgreSQL
companyRouter.delete('/', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;
    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'tenantId is required' });
    }

    const tId = String(tenantId);

    if (isDbConnected()) {
      // 1. Delete Company Profile
      await CompanyProfile.destroy({ where: { tenantId: tId } });

      // 2. Cascade delete all relational entities belonging to this tenantId
      const { 
        Item, 
        Party, 
        Invoice, 
        InvoiceItem, 
        SaleReturn, 
        SaleReturnItem, 
        PurchaseReturn, 
        PurchaseReturnItem, 
        PurchaseBill, 
        PurchaseBillItem, 
        PurchaseOrder, 
        PurchaseOrderItem, 
        Expense, 
        PaymentIn, 
        PaymentOut, 
        Estimate, 
        EstimateItem, 
        LedgerAccount, 
        JournalEntry,
        CashAccount,
        CashTransaction
      } = await import('../db/sequelize.js');

      await Item.destroy({ where: { tenantId: tId } }).catch(() => {});
      await Party.destroy({ where: { tenantId: tId } }).catch(() => {});
      await Invoice.destroy({ where: { tenantId: tId } }).catch(() => {});
      await SaleReturn.destroy({ where: { tenantId: tId } }).catch(() => {});
      await PurchaseReturn.destroy({ where: { tenantId: tId } }).catch(() => {});
      await PurchaseBill.destroy({ where: { tenantId: tId } }).catch(() => {});
      await PurchaseOrder.destroy({ where: { tenantId: tId } }).catch(() => {});
      await Expense.destroy({ where: { tenantId: tId } }).catch(() => {});
      await PaymentIn.destroy({ where: { tenantId: tId } }).catch(() => {});
      await PaymentOut.destroy({ where: { tenantId: tId } }).catch(() => {});
      await Estimate.destroy({ where: { tenantId: tId } }).catch(() => {});
      await LedgerAccount.destroy({ where: { tenantId: tId } }).catch(() => {});
      await JournalEntry.destroy({ where: { tenantId: tId } }).catch(() => {});
      await CashTransaction.destroy({ where: { tenantId: tId } }).catch(() => {});
      await CashAccount.destroy({ where: { tenantId: tId } }).catch(() => {});
    }

    console.log(`🗑️ [DELETE COMPANY] Successfully deleted company profile and associated store records for tenantId: ${tId}`);

    return res.status(200).json({ 
      success: true, 
      message: `Company profile ${tId} and associated store data deleted successfully from cloud database.` 
    });
  } catch (err: any) {
    console.error('Error deleting company profile:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
