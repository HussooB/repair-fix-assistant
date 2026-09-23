import express from "express";
import './pg-ssl-fix.js';
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import chatRoutes from "./routes/chat.js";
import chatHistoryRoutes from "./routes/chatHistory.js"; 
import { initializeGraph } from "./agent/graph.js";

dotenv.config();

const app = express();

// ✅ UPDATED: Allow both local development and your Vercel production URL
const allowedOrigins = [
  "http://localhost:5173",
  process.env.FRONTEND_URL || "https://your-app.vercel.app" // We will set FRONTEND_URL in Render
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

async function startServer() {
  console.log("Initializing LangGraph...");
  const repairGraph = await initializeGraph();
  console.log("LangGraph ready");

  app.use("/api/auth", authRoutes);
  app.use("/api/chat", chatRoutes(repairGraph));
  app.use("/api/chat/history", chatHistoryRoutes);

  app.get("/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  app.get("/", (req, res) => {
    res.json({ message: "Repair Fix Assistant Backend Running!" });
  });

  const PORT = process.env.PORT || 10000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

startServer();
