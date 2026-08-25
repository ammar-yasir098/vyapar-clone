import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User, CompanyProfile, isDbConnected } from '../db/sequelize.js';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.js';

export const authRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'vyapar-cloud-secret-key-2026';

// Fallback in-memory users list if DB is initializing
const memoryUsers: any[] = [];

// In-memory Rate Limiter to prevent auth brute forcing (max 15 attempts per minute per IP)
const authAttemptsMap = new Map<string, { count: number; resetTime: number }>();
function authRateLimiter(req: Request, res: Response, next: any) {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxAttempts = 15;

  const current = authAttemptsMap.get(ip);
  if (!current || now > current.resetTime) {
    authAttemptsMap.set(ip, { count: 1, resetTime: now + windowMs });
    return next();
  }

  if (current.count >= maxAttempts) {
    return res.status(429).json({
      success: false,
      error: 'Too many authentication attempts. Please try again after 1 minute.'
    });
  }

  current.count += 1;
  next();
}

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
authRouter.post('/login', authRateLimiter, async (req: Request, res: Response) => {
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
    return res.status(500).json({ success: false, error: 'Internal authentication server error' });
  }
});

// POST /api/v1/auth/register
authRouter.post('/register', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { businessName, fullName, email, phone, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters long' });
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

    // Auto-increment sequential User ID (user-1, user-2, user-3...) and Tenant ID (tenant-1, tenant-2, tenant-3...)
    let maxUserNum = 0;
    let maxTenantNum = 0;

    if (isDbConnected()) {
      const maxUser = await User.max('id');
      if (maxUser && typeof maxUser === 'number') maxUserNum = maxUser;

      const allProfiles = await CompanyProfile.findAll();
      for (const p of allProfiles) {
        const tid = p.get('tenantId') as string;
        if (tid) {
          const match = tid.match(/(?:tenant-)?(\d+)$/i);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxTenantNum) maxTenantNum = num;
          }
        }
      }
    } else {
      maxUserNum = memoryUsers.length;
      maxTenantNum = memoryUsers.length;
    }

    const tenantId = `tenant-${maxTenantNum + 1}`;
    const userId = `user-${maxUserNum + 1}`;
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
    return res.status(500).json({ success: false, error: 'Internal authentication server error' });
  }
});

// POST /api/v1/auth/forgot-password
authRouter.post('/forgot-password', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email address is required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    let user: any = null;

    if (isDbConnected()) {
      user = await User.findOne({ where: { email: cleanEmail } });
    } else {
      user = memoryUsers.find(u => u.email === cleanEmail);
    }

    if (!user) {
      return res.json({
        success: true,
        message: 'If an account exists with this email address, a password reset token has been generated.'
      });
    }

    // Generate 6-digit PIN reset token
    const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
    const resetTokenExpiry = new Date(Date.now() + 3600 * 1000); // 1 hour

    if (isDbConnected()) {
      await user.update({ resetToken, resetTokenExpiry });
    } else {
      user.resetToken = resetToken;
      user.resetTokenExpiry = resetTokenExpiry;
    }

    console.log(`🔑 Password reset token generated for '${cleanEmail}': ${resetToken}`);

    const isProduction = process.env.NODE_ENV === 'production';
    return res.json({
      success: true,
      message: 'Password reset token generated successfully.',
      ...(isProduction ? {} : { resetToken }) // Only include token in non-production/offline dev mode
    });
  } catch (err: any) {
    console.error('Error handling forgot-password:', err);
    return res.status(500).json({ success: false, error: 'Internal authentication server error' });
  }
});

// POST /api/v1/auth/reset-password
authRouter.post('/reset-password', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, resetToken, newPassword } = req.body;
    if (!email || !resetToken || !newPassword) {
      return res.status(400).json({ success: false, error: 'Email, reset token, and new password are required' });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters long' });
    }

    const cleanEmail = email.trim().toLowerCase();
    let user: any = null;

    if (isDbConnected()) {
      user = await User.findOne({ where: { email: cleanEmail } });
    } else {
      user = memoryUsers.find(u => u.email === cleanEmail);
    }

    if (!user || !user.resetToken || user.resetToken !== String(resetToken).trim()) {
      return res.status(400).json({ success: false, error: 'Invalid or incorrect password reset token' });
    }

    if (user.resetTokenExpiry && new Date() > new Date(user.resetTokenExpiry)) {
      return res.status(400).json({ success: false, error: 'Reset token has expired. Please request a new one.' });
    }

    const passwordHash = bcrypt.hashSync(newPassword, 8);

    if (isDbConnected()) {
      await user.update({ passwordHash, resetToken: null, resetTokenExpiry: null });
    } else {
      user.passwordHash = passwordHash;
      user.resetToken = null;
      user.resetTokenExpiry = null;
    }

    return res.json({
      success: true,
      message: 'Password reset successfully. You can now sign in with your new password.'
    });
  } catch (err: any) {
    console.error('Error resetting password:', err);
    return res.status(500).json({ success: false, error: 'Internal authentication server error' });
  }
});

// POST /api/v1/auth/change-password (Protected)
authRouter.post('/change-password', authenticateJwt, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current password and new password are required' });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters long' });
    }

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Missing user session' });
    }

    let user: any = null;
    if (isDbConnected()) {
      user = await User.findOne({ where: { userId } });
    } else {
      user = memoryUsers.find(u => u.userId === userId);
    }

    if (!user || !bcrypt.compareSync(currentPassword, user.passwordHash)) {
      return res.status(400).json({ success: false, error: 'Incorrect current password' });
    }

    const passwordHash = bcrypt.hashSync(newPassword, 8);
    if (isDbConnected()) {
      await user.update({ passwordHash });
    } else {
      user.passwordHash = passwordHash;
    }

    return res.json({
      success: true,
      message: 'Password updated successfully.'
    });
  } catch (err: any) {
    console.error('Error changing password:', err);
    return res.status(500).json({ success: false, error: 'Internal authentication server error' });
  }
});
