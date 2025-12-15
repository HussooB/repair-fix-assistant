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
    const stream = await repairGraph.astream(
      { userQuery: message },
      {
        configurable: { thread_id: userThreadId },
      }
    );

    for await (const update of stream) {
      // 🔧 Tool status updates
      if (update.ifixitResult !== undefined) {
        res.write(`data: ${JSON.stringify({
          type: 'status',
          message: 'Searching iFixit...'
        })}\n\n`);
      }

      if (update.webResult !== undefined) {
        res.write(`data: ${JSON.stringify({
          type: 'status',
          message: 'Searching web fallback...'
        })}\n\n`);
      }

      // 🧠 LLM token streaming (if messages exist)
      if (update.messages?.length) {
        const last = update.messages[update.messages.length - 1];
        if (last?.content) {
          res.write(`data: ${JSON.stringify({
            type: 'token',
            content: last.content
          })}\n\n`);
        }
      }
    }

    // ✅ Fetch final state
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