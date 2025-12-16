import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import chatRoutes from "./routes/chat.js";
import { initializeGraph } from "./agent/graph.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

async function startServer() {
  console.log("Initializing LangGraph...");
  const repairGraph = await initializeGraph();
  console.log("LangGraph ready");

  app.use("/api/auth", authRoutes);
  app.use("/api/chat", chatRoutes(repairGraph));

  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      time: new Date().toISOString(),
    });
  });

  app.get("/", (req, res) => {
    res.json({ message: "Repair Fix Assistant Backend Running!" });
  });

  const PORT = process.env.PORT || 10000;
  app.listen(PORT, () =>
    console.log(`Server running on port ${PORT}`)
  );
}

startServer();