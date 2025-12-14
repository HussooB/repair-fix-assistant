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

  // Set headers for Server-Sent Events (event stream)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const config = { configurable: { thread_id: userThreadId } };

  try {
    // Stream tool execution and LLM tokens
    for await (const chunk of repairGraph.stream(
      { userQuery: message },
      { ...config, streamMode: "updates" }
    )) {
      // Send tool status
      if (chunk.ifixitResult !== undefined || chunk.webResult !== undefined) {
        res.write(`data: ${JSON.stringify({ type: 'status', message: 'Searching iFixit...' })}\n\n`);
      }

      // Send partial LLM response tokens
      if (chunk.messages && chunk.messages.length > 0) {
        const lastMessage = chunk.messages[chunk.messages.length - 1];
        if (lastMessage.content) {
          res.write(`data: ${JSON.stringify({ type: 'token', content: lastMessage.content })}\n\n`);
        }
      }
    }

    // Get final state
    const finalState = await repairGraph.getState(config);
    const finalAnswer = finalState.values.finalAnswer;

    if (finalAnswer) {
      const tokensUsed = countTokens(finalAnswer.content || '');

      // Update user's token usage
      await prisma.user.update({
        where: { id: req.userId },
        data: { tokensUsed: { increment: tokensUsed } },
      });

      // Send final message + updated token count
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
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    res.end();
  }
});

export default router;