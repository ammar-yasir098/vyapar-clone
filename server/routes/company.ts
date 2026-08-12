import { Router, Request, Response } from 'express';
import { CompanyProfile, isDbConnected } from '../db/sequelize.js';

export const companyRouter = Router();

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
          logoUrl: logoUrl !== undefined ? logoUrl : profile.get('logoUrl'),
          signatureUrl: signatureUrl !== undefined ? signatureUrl : profile.get('signatureUrl'),
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
          logoUrl,
          signatureUrl,
          booksBeginDate
        });
      }

      return res.status(200).json({ success: true, message: 'Company profile saved to PostgreSQL via Sequelize', data: profile });
    }

    return res.status(200).json({ success: true, data: req.body });
  } catch (err: any) {
    console.error('Error saving company profile:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
