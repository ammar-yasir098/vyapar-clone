import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User, CompanyProfile, isDbConnected } from '../db/sequelize.js';

export const authRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'vyapar-cloud-secret-key-2026';

// Fallback in-memory users list if DB is initializing
const memoryUsers: any[] = [];

// Helper to find existing company or provision a default company
async function ensureDefaultCompany(tenantId: string, userId: string = '', name: string = 'Company', phone: string = '', email: string = '') {
  if (!isDbConnected()) return;
  try {
    const existing = await CompanyProfile.findOne({ where: { tenantId } });
    if (!existing) {
      console.log(`🏢 Auto-provisioning default company profile '${name}' for tenant '${tenantId}'...`);
      await CompanyProfile.create({
        userId,
        tenantId,
        name: name || 'Company',
        phone: phone || '+92 300 xxxxxxx',
        email: email || '',
        address: 'Shop #12, Commercial Market, Main Boulevard, Gulberg, Lahore',
        gstin: 'NTN: 7654321-0',
        businessType: 'Retail',
        businessCategory: 'Supermarket & FMCG'
      });
    } else if (userId && !existing.userId) {
      await existing.update({ userId });
    }
  } catch (err) {
    console.error('Error provisioning company profile:', err);
  }
}

// Backfill any unclaimed (user_id = NULL) company profiles to the given user
// This handles pre-existing profiles created before userId support was added
async function backfillUnclaimedProfiles(userId: string) {
  if (!isDbConnected() || !userId) return;
  try {
    const { Op } = await import('sequelize');
    const unclaimed = await CompanyProfile.findAll({ where: { userId: { [Op.is as any]: null } } });
    if (unclaimed.length > 0) {
      console.log(`🔄 Backfilling ${unclaimed.length} unclaimed company profile(s) to userId '${userId}'...`);
      for (const p of unclaimed) {
        await p.update({ userId });
      }
    }
  } catch (err) {
    console.error('Error backfilling unclaimed profiles:', err);
  }
}

// POST /api/v1/auth/login
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    let user: any = null;

    if (isDbConnected()) {
      user = await User.findOne({ where: { email: cleanEmail } });
    } else {
      user = memoryUsers.find(u => u.email === cleanEmail);
    }

    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    // Ensure company profile exists for tenant
    await ensureDefaultCompany(user.tenantId, user.userId, 'Company', user.phone, user.email);
    // Claim any unclaimed (pre-existing) company profiles that have no userId yet
    await backfillUnclaimedProfiles(user.userId);

    const token = jwt.sign(
      { userId: user.userId, tenantId: user.tenantId, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.json({
      success: true,
      token,
      user: {
        userId: user.userId,
        tenantId: user.tenantId,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone || '',
        role: user.role || 'OWNER'
      }
    });
  } catch (err: any) {
    console.error('Error logging in:', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal server login error' });
  }
});

// POST /api/v1/auth/register
authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { businessName, fullName, email, phone, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const storeName = businessName?.trim() || 'Company';

    if (isDbConnected()) {
      const existing = await User.findOne({ where: { email: cleanEmail } });
      if (existing) {
        return res.status(400).json({ success: false, error: 'An account with this email address already exists' });
      }
    } else {
      const existingMem = memoryUsers.find(u => u.email === cleanEmail);
      if (existingMem) {
        return res.status(400).json({ success: false, error: 'An account with this email address already exists' });
      }
    }

    const tenantId = `tenant-${Date.now().toString().slice(-8)}`;
    const userId = `user-${Date.now().toString().slice(-8)}`;
    const passwordHash = bcrypt.hashSync(password, 8);

    const userData = {
      userId,
      tenantId,
      fullName: fullName || storeName,
      email: cleanEmail,
      phone: phone || '',
      passwordHash,
      role: 'OWNER'
    };

    if (isDbConnected()) {
      await User.create(userData);
    } else {
      memoryUsers.push(userData);
    }

    // Auto-create default company profile with provided storeName or 'Company'
    await ensureDefaultCompany(tenantId, userId, storeName, phone, cleanEmail);

    const token = jwt.sign(
      { userId, tenantId, role: 'OWNER', email: cleanEmail },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.status(201).json({
      success: true,
      token,
      user: {
        userId,
        tenantId,
        fullName: userData.fullName,
        email: cleanEmail,
        phone: userData.phone,
        role: 'OWNER'
      }
    });
  } catch (err: any) {
    console.error('Error registering user:', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal server registration error' });
  }
});
