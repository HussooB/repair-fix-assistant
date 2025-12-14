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

// Health check route — keeps Render awake
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Backend is alive!', 
    time: new Date().toISOString() 
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Repair Fix Assistant Backend Running!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Health check: /health (use with uptime monitor)');
});