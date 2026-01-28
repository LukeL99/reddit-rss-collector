import { Router } from "express";
import { prisma } from "../lib/db.js";
import { collectAll } from "../collector.js";

const router = Router();

// GET /api/health - Health check
router.get("/health", async (_req, res) => {
  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`;

    const [subredditCount, postCount] = await Promise.all([
      prisma.subreddit.count(),
      prisma.post.count(),
    ]);

    res.json({
      status: "healthy",
      database: "connected",
      subreddits: subredditCount,
      posts: postCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Health check failed:", err);
    res.status(500).json({
      status: "unhealthy",
      database: "disconnected",
      error: String(err),
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /api/collect - Trigger manual collection run
router.post("/collect", async (_req, res) => {
  try {
    const result = await collectAll();
    res.json({
      success: true,
      totalFetched: result.totalFetched,
      totalNew: result.totalNew,
      subreddits: result.subredditResults,
    });
  } catch (err) {
    console.error("Manual collection failed:", err);
    res.status(500).json({
      success: false,
      error: String(err),
    });
  }
});

export default router;
