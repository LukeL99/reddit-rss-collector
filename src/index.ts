import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import subredditRoutes from "./routes/subreddits.js";
import postRoutes from "./routes/posts.js";
import systemRoutes from "./routes/system.js";
import filterRoutes from "./routes/filter.js";
import { startCollector } from "./collector.js";
import { startBackgroundTriage } from "./filter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
const COLLECT_INTERVAL = parseInt(process.env.COLLECT_INTERVAL_MINUTES || "30", 10);

// Middleware
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, "../public")));

// API routes
app.use("/api/subreddits", subredditRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/filter", filterRoutes);
app.use("/api", systemRoutes);

// Serve index.html for root
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  // Start the collector service
  startCollector(COLLECT_INTERVAL);

  // Start background triage (processes posts as they come in)
  startBackgroundTriage();
});
