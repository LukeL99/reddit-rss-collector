import { Router } from "express";
import { prisma } from "../lib/db.js";

const router = Router();

// GET /api/subreddits - List all subreddits
router.get("/", async (_req, res) => {
  try {
    const subreddits = await prisma.subreddit.findMany({
      include: {
        _count: {
          select: { posts: true },
        },
      },
      orderBy: { name: "asc" },
    });

    res.json(
      subreddits.map((s) => ({
        id: s.id,
        name: s.name,
        enabled: s.enabled,
        createdAt: s.createdAt,
        lastFetchedAt: s.lastFetchedAt,
        postCount: s._count.posts,
      }))
    );
  } catch (err) {
    console.error("Error fetching subreddits:", err);
    res.status(500).json({ error: "Failed to fetch subreddits" });
  }
});

// POST /api/subreddits - Add a subreddit
router.post("/", async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Name is required" });
    }

    // Clean subreddit name (remove r/ prefix if present)
    const cleanName = name.replace(/^r\//, "").trim();

    if (!cleanName || !/^[a-zA-Z0-9_]+$/.test(cleanName)) {
      return res.status(400).json({ error: "Invalid subreddit name" });
    }

    const existing = await prisma.subreddit.findUnique({
      where: { name: cleanName },
    });

    if (existing) {
      return res.status(409).json({ error: "Subreddit already exists" });
    }

    const subreddit = await prisma.subreddit.create({
      data: { name: cleanName },
    });

    res.status(201).json(subreddit);
  } catch (err) {
    console.error("Error creating subreddit:", err);
    res.status(500).json({ error: "Failed to create subreddit" });
  }
});

// PATCH /api/subreddits/:id - Update a subreddit (enable/disable)
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled must be a boolean" });
    }

    const subreddit = await prisma.subreddit.update({
      where: { id },
      data: { enabled },
    });

    res.json(subreddit);
  } catch (err) {
    console.error("Error updating subreddit:", err);
    res.status(500).json({ error: "Failed to update subreddit" });
  }
});

// DELETE /api/subreddits/:id - Remove a subreddit
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.subreddit.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (err) {
    console.error("Error deleting subreddit:", err);
    res.status(500).json({ error: "Failed to delete subreddit" });
  }
});

export default router;
