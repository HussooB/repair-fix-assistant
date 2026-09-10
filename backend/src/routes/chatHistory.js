import express from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma.js";

const JWT_SECRET = process.env.JWT_SECRET || "repair-fix-hackathon-2025-secret";

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "No token provided" });
  try {
    const decoded = jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

const router = express.Router();

// Save chat and messages to database
router.post("/save", authenticate, async (req, res) => {
  try {
    const { threadId, title, messages } = req.body;

    const chat = await prisma.chat.upsert({
      where: { threadId },
      update: { title },
      create: { threadId, title, userId: req.userId },
    });

    // Clear old messages for this thread to avoid duplicates on re-save
    await prisma.message.deleteMany({ where: { chatId: chat.id } });

    // Save new messages
    await prisma.message.createMany({
      data: messages.map((msg) => ({ chatId: chat.id, role: msg.role, content: msg.content })),
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Save chat error:", error);
    res.status(500).json({ error: "Failed to save chat" });
  }
});

// Get all chats for the user
router.get("/list", authenticate, async (req, res) => {
  try {
    const chats = await prisma.chat.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    res.json(chats);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch chats" });
  }
});

export default router;