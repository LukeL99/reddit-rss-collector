import { Router } from "express";
import { triageNewPosts, getTriageStatus, requestStop, isBackgroundTriageRunning } from "../filter.js";

const router = Router();

// Track if manual batch triage is currently running
let isTriaging = false;

// POST /api/filter - Trigger manual triage run
router.post("/", async (_req, res) => {
  if (isTriaging) {
    return res.status(409).json({
      error: "Triage is already running",
      success: false,
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is not configured",
      success: false,
    });
  }

  isTriaging = true;

  try {
    const result = await triageNewPosts();
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Triage error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Triage failed",
      success: false,
    });
  } finally {
    isTriaging = false;
  }
});

// GET /api/filter/status - Get triage stats
router.get("/status", async (_req, res) => {
  try {
    const status = await getTriageStatus();
    res.json({
      ...status,
      isRunning: isTriaging,
      isBackgroundRunning: isBackgroundTriageRunning(),
      isConfigured: Boolean(process.env.GEMINI_API_KEY),
    });
  } catch (error) {
    console.error("Error getting triage status:", error);
    res.status(500).json({ error: "Failed to get triage status" });
  }
});

// POST /api/filter/stop - Stop running triage
router.post("/stop", (_req, res) => {
  if (!isTriaging) {
    return res.status(400).json({
      error: "No triage job is running",
      success: false,
    });
  }

  requestStop();
  res.json({
    success: true,
    message: "Stop requested, triage will halt after current post",
  });
});

export default router;
