import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";

const router = Router();

// GET /api/posts - List posts with filters
router.get("/", async (req, res) => {
  try {
    const {
      subreddit,
      search,
      minScore,
      flagged,
      since,
      limit = "50",
      offset = "0",
    } = req.query;

    const where: Prisma.PostWhereInput = {};

    // Filter by subreddit name
    if (subreddit && typeof subreddit === "string") {
      const sub = await prisma.subreddit.findUnique({
        where: { name: subreddit },
      });
      if (sub) {
        where.subredditId = sub.id;
      } else {
        return res.json({ posts: [], total: 0 });
      }
    }

    // Search in title and body
    if (search && typeof search === "string") {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { body: { contains: search, mode: "insensitive" } },
      ];
    }

    // Minimum score filter
    if (minScore && typeof minScore === "string") {
      const score = parseInt(minScore, 10);
      if (!isNaN(score)) {
        where.score = { gte: score };
      }
    }

    // Flagged only filter
    if (flagged === "true") {
      where.isFlagged = true;
    }

    // Posts since date
    if (since && typeof since === "string") {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        where.createdUtc = { gte: sinceDate };
      }
    }

    const take = Math.min(parseInt(limit as string, 10) || 50, 100);
    const skip = parseInt(offset as string, 10) || 0;

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          subreddit: {
            select: { name: true },
          },
        },
        orderBy: { createdUtc: "desc" },
        take,
        skip,
      }),
      prisma.post.count({ where }),
    ]);

    res.json({
      posts: posts.map((p) => ({
        id: p.id,
        redditId: p.redditId,
        subreddit: p.subreddit.name,
        title: p.title,
        body: p.body,
        author: p.author,
        url: p.url,
        score: p.score,
        numComments: p.numComments,
        createdUtc: p.createdUtc,
        fetchedAt: p.fetchedAt,
        isFlagged: p.isFlagged,
      })),
      total,
      limit: take,
      offset: skip,
    });
  } catch (err) {
    console.error("Error fetching posts:", err);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

// PATCH /api/posts/:id - Update post (flag/unflag)
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { isFlagged } = req.body;

    if (typeof isFlagged !== "boolean") {
      return res.status(400).json({ error: "isFlagged must be a boolean" });
    }

    const post = await prisma.post.update({
      where: { id },
      data: { isFlagged },
      include: {
        subreddit: {
          select: { name: true },
        },
      },
    });

    res.json({
      id: post.id,
      redditId: post.redditId,
      subreddit: post.subreddit.name,
      title: post.title,
      body: post.body,
      author: post.author,
      url: post.url,
      score: post.score,
      numComments: post.numComments,
      createdUtc: post.createdUtc,
      fetchedAt: post.fetchedAt,
      isFlagged: post.isFlagged,
    });
  } catch (err) {
    console.error("Error updating post:", err);
    res.status(500).json({ error: "Failed to update post" });
  }
});

export default router;
