// src/routes/chat.js

import express from 'express';
import jwt from 'jsonwebtoken';
import { repairGraph } from '../agent/graph.js';
import { prisma } from '../db/prisma.js';
import { countTokens } from '../utils/tokenCounter.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'repair-fix-hackathon-2025-secret';

// Auth middleware
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Streaming chat endpoint
router.post('/stream', authenticate, async (req, res) => {
  const { message, thread_id } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const userThreadId = thread_id || `user_${req.userId}`;

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  try {
    for await (const chunk of repairGraph.stream(
      { userQuery: message },
      {
        stream_mode: "updates", // required
        configurable: { thread_id: userThreadId }
      }
    )) {
      // Tool status updates
      if (chunk.ifixitResult !== undefined) {
        res.write(`data: ${JSON.stringify({
          type: 'status',
          message: 'Searching iFixit...'
        })}\n\n`);
      }

      if (chunk.webResult !== undefined) {
        res.write(`data: ${JSON.stringify({
          type: 'status',
          message: 'Searching web fallback...'
        })}\n\n`);
      }

      // Optionally stream full state
      // Uncomment if you want the whole state each step:
      // res.write(`data: ${JSON.stringify({ type:'state', state: chunk })}\n\n`);
    }

    // After stream finishes, get final answer
    const finalState = await repairGraph.getState({
      configurable: { thread_id: userThreadId }
    });

    const finalAnswer = finalState.values.finalAnswer;

    if (finalAnswer?.content) {
      const tokensUsed = countTokens(finalAnswer.content);

      await prisma.user.update({
        where: { id: req.userId },
        data: { tokensUsed: { increment: tokensUsed } },
      });

      res.write(`data: ${JSON.stringify({
        type: 'final',
        content: finalAnswer.content,
        source: finalAnswer.source,
        tokensUsed,
      })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
    res.end();

  } catch (error) {
    res.write(`data: ${JSON.stringify({
      type: 'error',
      message: error.message
    })}\n\n`);
    res.end();
  }
});



export default router;