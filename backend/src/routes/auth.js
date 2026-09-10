

import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'repair-fix-hackathon-2025-secret';

// Signup
// Signup
router.post('/signup', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
      },
    });

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: 'User created successfully',
      token,
      user: { id: user.id, username: user.username, tokensUsed: user.tokensUsed },
    });
  } catch (error) {
    console.error("⚠️ Signup Error Details:", error); // <-- THIS WILL SHOW THE REAL ERROR
    
    // P2002 is Prisma's code for "Unique constraint failed"
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Username already taken' });
    }
    
    // For any other error (like missing tables), show the real message
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});
// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = await prisma.user.findUnique({ where: { username } });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });

  res.json({
    token,
    user: { id: user.id, username: user.username, tokensUsed: user.tokensUsed },
  });
});

export default router;