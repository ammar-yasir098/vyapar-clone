import { Router, Request, Response } from 'express';
import { CompanyProfile, isDbConnected } from '../db/sequelize.js';
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
    if (isDbConnected()) {
      let profiles = await CompanyProfile.findAll();
      if (profiles.length === 0) {
        const defaultProfile = await CompanyProfile.create({
          tenantId: 'default-tenant',
          name: 'SuperMarket Retail & Traders',
          phone: '+92 300 xxxxxxx',
          email: 'contact@supermarket.com',
          address: 'Shop #12, Commercial Market, Main Boulevard, Gulberg, Lahore',
          gstin: 'NTN: 7654321-0',
          businessType: 'Retail',
          businessCategory: 'Supermarket & FMCG',
          pincode: '54000',
          booksBeginDate: new Date().toISOString().split('T')[0]
        });
        profiles = [defaultProfile];
      }
      return res.json({ success: true, data: profiles });
    }

    return res.json({
      success: true,
      data: [{
        tenantId: 'default-tenant',
        name: 'SuperMarket Retail & Traders',
        phone: '+92 300 xxxxxxx',
        email: 'contact@supermarket.com',
        address: 'Shop #12, Commercial Market, Main Boulevard, Gulberg, Lahore',
        gstin: 'NTN: 7654321-0',
        businessType: 'Retail',
        businessCategory: 'Supermarket & FMCG',
        pincode: '54000'
      }]
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/company - Fetch company profile using Sequelize
companyRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { tenantId = 'default-tenant' } = req.query;
    if (isDbConnected()) {
      let profile = await CompanyProfile.findOne({ where: { tenantId: String(tenantId) } });
      if (!profile) {
        profile = await CompanyProfile.create({
          tenantId: String(tenantId),
          name: 'SuperMarket Retail & Traders',
          phone: '+92 300 xxxxxxx',
          email: 'contact@supermarket.com',
          address: 'Shop #12, Commercial Market, Main Boulevard, Gulberg, Lahore',
          gstin: 'NTN: 7654321-0',
          businessType: 'Retail',
          businessCategory: 'Supermarket & FMCG',
          pincode: '54000',
          booksBeginDate: new Date().toISOString().split('T')[0]
        });
      }
      return res.json({ success: true, data: profile });
    }

    return res.json({
      success: true,
      data: {
        tenantId: String(tenantId),
        name: 'SuperMarket Retail & Traders',
        phone: '+92 300 xxxxxxx',
        email: 'contact@supermarket.com',
        address: 'Shop #12, Commercial Market, Main Boulevard, Gulberg, Lahore',
        gstin: 'NTN: 7654321-0',
        businessType: 'Retail',
        businessCategory: 'Supermarket & FMCG',
        pincode: '54000'
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/company - Update company profile using Sequelize find/update or create
companyRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      tenantId = 'default-tenant',
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

    const savedLogoUrl = saveBase64Image(logoUrl, 'logos', 'logo', tenantId);
    const savedSignatureUrl = saveBase64Image(signatureUrl, 'signatures', 'sig', tenantId);

    if (isDbConnected()) {
      let profile = await CompanyProfile.findOne({ where: { tenantId } });

      if (profile) {
        await profile.update({
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
