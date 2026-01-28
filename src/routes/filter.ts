import { Router } from "express";
import { filterNewPosts, getFilterStatus } from "../filter.js";

const router = Router();

// Track if filtering is currently running
let isFiltering = false;

// POST /api/filter - Trigger manual filter run
router.post("/", async (_req, res) => {
  if (isFiltering) {
    return res.status(409).json({
      error: "Filter is already running",
      success: false,
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is not configured",
      success: false,
    });
  }

  isFiltering = true;

  try {
    const result = await filterNewPosts();
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Filter error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Filter failed",
      success: false,
    });
  } finally {
    isFiltering = false;
  }
});

// GET /api/filter/status - Get filter stats
router.get("/status", async (_req, res) => {
  try {
    const status = await getFilterStatus();
    res.json({
      ...status,
      isRunning: isFiltering,
      isConfigured: Boolean(process.env.GEMINI_API_KEY),
    });
  } catch (error) {
    console.error("Error getting filter status:", error);
    res.status(500).json({ error: "Failed to get filter status" });
  }
});

export default router;
