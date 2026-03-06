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

// GET /api/stats - Comprehensive stats (no pagination confusion)
router.get("/stats", async (_req, res) => {
  try {
    const [
      totalPosts,
      totalNiches,
      postsPassedTriage,
      postsEvaluated,
      postsUnevaluated,
      nichesScored,
      nichesUnscored,
      nichesFlagged,
      avgTotalScore,
      topNiches,
    ] = await Promise.all([
      prisma.post.count({ where: { isNiche: false } }),
      prisma.post.count({ where: { isNiche: true } }),
      prisma.post.count({ where: { isNiche: false, passedTriage: true } }),
      prisma.post.count({ where: { isNiche: false, passedTriage: true, isEvaluated: true } }),
      prisma.post.count({ where: { isNiche: false, passedTriage: true, isEvaluated: false } }),
      prisma.post.count({ where: { isNiche: true, totalScore: { not: null } } }),
      prisma.post.count({ where: { isNiche: true, totalScore: null } }),
      prisma.post.count({ where: { isNiche: true, isFlagged: true } }),
      prisma.post.aggregate({ where: { isNiche: true, totalScore: { not: null } }, _avg: { totalScore: true } }),
      prisma.post.findMany({
        where: { isNiche: true, totalScore: { not: null } },
        orderBy: { totalScore: "desc" },
        take: 10,
        select: { id: true, title: true, totalScore: true, revenueScore: true, wtpScore: true, easeScore: true, competitionScore: true, nicheDefensibility: true, vertical: true, segment: true },
      }),
    ]);

    res.json({
      posts: {
        total: totalPosts,
        passedTriage: postsPassedTriage,
        evaluated: postsEvaluated,
        unevaluated: postsUnevaluated,
      },
      niches: {
        total: totalNiches,
        scored: nichesScored,
        unscored: nichesUnscored,
        flagged: nichesFlagged,
        avgScore: avgTotalScore._avg.totalScore ? Math.round(avgTotalScore._avg.totalScore * 10) / 10 : null,
      },
      topNiches,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Stats failed:", err);
    res.status(500).json({ error: "Failed to compute stats" });
  }
});

export default router;
