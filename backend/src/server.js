// src/server.js

import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'Repair Fix Assistant Backend Running!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log('  POST /api/auth/signup');
  console.log('  POST /api/auth/login');
  console.log('  POST /api/chat/stream (with Authorization: Bearer <token>)');
});