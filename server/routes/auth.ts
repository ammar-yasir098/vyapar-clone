import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export const authRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'vyapar-cloud-secret-key-2026';

// Dummy users table for auth demo
const users: any[] = [
  {
    userId: 'user-001',
    tenantId: 'default-tenant',
    fullName: 'Store Admin',
    email: 'admin@vyapar.com',
    phone: '9876543210',
    passwordHash: bcrypt.hashSync('admin123', 8),
    role: 'OWNER'
  }
];

// POST /api/v1/auth/login
authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const user = users.find(u => u.email === email);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { userId: user.userId, tenantId: user.tenantId, role: user.role },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  return res.json({
    token,
    user: {
      userId: user.userId,
      tenantId: user.tenantId,
      fullName: user.fullName,
      email: user.email,
      role: user.role
    }
  });
});

// POST /api/v1/auth/register
authRouter.post('/register', async (req: Request, res: Response) => {
  const { businessName, fullName, email, phone, password } = req.body;
  if (!businessName || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const tenantId = `tenant-${Date.now()}`;
  const userId = `user-${Date.now()}`;
  const newUser = {
    userId,
    tenantId,
    fullName: fullName || businessName,
    email,
    phone: phone || '',
    passwordHash: bcrypt.hashSync(password, 8),
    role: 'OWNER'
  };

  users.push(newUser);

  const token = jwt.sign(
    { userId: newUser.userId, tenantId: newUser.tenantId, role: newUser.role },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  return res.status(201).json({
    token,
    user: {
      userId: newUser.userId,
      tenantId: newUser.tenantId,
      fullName: newUser.fullName,
      email: newUser.email,
      role: newUser.role
    }
  });
});
