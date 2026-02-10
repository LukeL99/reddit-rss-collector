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
      triaged,
      passedTriage,
      minTriageScore,
      evaluated,
      triagedAfter,
      minTotalScore,
      minMarketSize,
      minWtp,
      minEase,
      minCompetition,
      isNiche,
      // Metadata filters
      segment,
      businessModel,
      industry,
      revenueType,
      pricingTier,
      stack,
      urgency,
      maintenance,
      limit = "50",
      offset = "0",
    } = req.query;

    const where: Prisma.PostWhereInput = {};

    // Filter by niche status (default: exclude niches)
    if (isNiche === "true") {
      where.isNiche = true;
    } else if (isNiche === "false" || isNiche === undefined) {
      where.isNiche = false;
    }

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

    // Filter by triage status
    if (triaged === "true") {
      where.isTriaged = true;
    } else if (triaged === "false") {
      where.isTriaged = false;
    }

    // Filter by passed triage status
    if (passedTriage === "true") {
      where.passedTriage = true;
    } else if (passedTriage === "false") {
      where.passedTriage = false;
    }

    // Minimum triage score filter
    if (minTriageScore && typeof minTriageScore === "string") {
      const score = parseInt(minTriageScore, 10);
      if (!isNaN(score)) {
        where.triageScore = { gte: score };
      }
    }

    // Filter by evaluation status (deep evaluation by Glitch)
    if (evaluated === "true") {
      where.isEvaluated = true;
    } else if (evaluated === "false") {
      where.isEvaluated = false;
    }

    // Filter by triage date (for new opportunities since last run)
    if (triagedAfter && typeof triagedAfter === "string") {
      const afterDate = new Date(triagedAfter);
      if (!isNaN(afterDate.getTime())) {
        where.triagedAt = { gte: afterDate };
      }
    }

    // Evaluation score filters
    if (minTotalScore && typeof minTotalScore === "string") {
      const score = parseInt(minTotalScore, 10);
      if (!isNaN(score)) {
        where.totalScore = { gte: score };
      }
    }
    if (minMarketSize && typeof minMarketSize === "string") {
      const score = parseInt(minMarketSize, 10);
      if (!isNaN(score)) {
        where.marketSizeScore = { gte: score };
      }
    }
    if (minWtp && typeof minWtp === "string") {
      const score = parseInt(minWtp, 10);
      if (!isNaN(score)) {
        where.wtpScore = { gte: score };
      }
    }
    if (minEase && typeof minEase === "string") {
      const score = parseInt(minEase, 10);
      if (!isNaN(score)) {
        where.easeScore = { gte: score };
      }
    }
    if (minCompetition && typeof minCompetition === "string") {
      const score = parseInt(minCompetition, 10);
      if (!isNaN(score)) {
        where.competitionScore = { gte: score };
      }
    }

    // Metadata filters
    if (segment && typeof segment === "string") where.segment = segment;
    if (businessModel && typeof businessModel === "string") where.businessModel = businessModel;
    if (industry && typeof industry === "string") where.industry = industry;
    if (revenueType && typeof revenueType === "string") where.revenueType = revenueType;
    if (pricingTier && typeof pricingTier === "string") where.pricingTier = pricingTier;
    if (stack && typeof stack === "string") where.stack = stack;
    if (urgency && typeof urgency === "string") where.urgency = urgency;
    if (maintenance && typeof maintenance === "string") where.maintenance = maintenance;

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
        // Triage fields (Gemini)
        isTriaged: p.isTriaged,
        passedTriage: p.passedTriage,
        triageScore: p.triageScore,
        triageReason: p.triageReason,
        triagedAt: p.triagedAt,
        // Evaluation fields (Glitch)
        isEvaluated: p.isEvaluated,
        evaluatedAt: p.evaluatedAt,
        marketSizeScore: p.marketSizeScore,
        wtpScore: p.wtpScore,
        easeScore: p.easeScore,
        competitionScore: p.competitionScore,
        totalScore: p.totalScore,
        evaluationNotes: p.evaluationNotes,
        // Niche fields
        isNiche: p.isNiche,
        parentPostId: p.parentPostId,
        nicheSource: p.nicheSource,
        nicheDescription: p.nicheDescription,
        revenueScore: p.revenueScore,
        nicheDefensibility: p.nicheDefensibility,
        // Metadata fields
        segment: p.segment,
        businessModel: p.businessModel,
        industry: p.industry,
        vertical: p.vertical,
        revenueType: p.revenueType,
        pricingTier: p.pricingTier,
        revenueCeiling: p.revenueCeiling,
        stack: p.stack,
        dataMoat: p.dataMoat,
        maintenance: p.maintenance,
        buyer: p.buyer,
        userCountEstimate: p.userCountEstimate,
        geography: p.geography,
        signalSource: p.signalSource,
        urgency: p.urgency,
        validation: p.validation,
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

// GET /api/posts/:id/niches - Get niches derived from a specific post
router.get("/:id/niches", async (req, res) => {
  try {
    const { id } = req.params;
    const niches = await prisma.post.findMany({
      where: { parentPostId: id, isNiche: true },
      include: {
        subreddit: { select: { name: true } },
      },
      orderBy: { createdUtc: "desc" },
    });

    res.json({
      niches: niches.map((p) => ({
        id: p.id,
        title: p.title,
        nicheDescription: p.nicheDescription,
        nicheSource: p.nicheSource,
        revenueScore: p.revenueScore,
        nicheDefensibility: p.nicheDefensibility,
        isEvaluated: p.isEvaluated,
        marketSizeScore: p.marketSizeScore,
        wtpScore: p.wtpScore,
        easeScore: p.easeScore,
        competitionScore: p.competitionScore,
        totalScore: p.totalScore,
        evaluationNotes: p.evaluationNotes,
        createdUtc: p.createdUtc,
      })),
      total: niches.length,
    });
  } catch (err) {
    console.error("Error fetching niches for post:", err);
    res.status(500).json({ error: "Failed to fetch niches" });
  }
});

// PATCH /api/posts/:id - Update post (flag/unflag or add evaluation)
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      isFlagged,
      // Evaluation fields that Glitch can set
      isEvaluated,
      marketSizeScore,
      wtpScore,
      easeScore,
      competitionScore,
      totalScore,
      evaluationNotes,
      // Metadata fields
      segment,
      businessModel,
      industry,
      vertical,
      revenueType,
      pricingTier,
      revenueCeiling,
      stack,
      dataMoat,
      maintenance,
      buyer,
      userCountEstimate,
      geography,
      signalSource,
      urgency,
      validation,
    } = req.body;

    const data: Prisma.PostUpdateInput = {};

    if (typeof isFlagged === "boolean") {
      data.isFlagged = isFlagged;
    }

    // Evaluation update
    if (typeof isEvaluated === "boolean") {
      data.isEvaluated = isEvaluated;
      data.evaluatedAt = isEvaluated ? new Date() : null;
    }
    if (typeof marketSizeScore === "number") {
      data.marketSizeScore = marketSizeScore;
    }
    if (typeof wtpScore === "number") {
      data.wtpScore = wtpScore;
    }
    if (typeof easeScore === "number") {
      data.easeScore = easeScore;
    }
    if (typeof competitionScore === "number") {
      data.competitionScore = competitionScore;
    }
    if (typeof totalScore === "number") {
      data.totalScore = totalScore;
    }
    if (typeof evaluationNotes === "string") {
      data.evaluationNotes = evaluationNotes;
    }

    // Metadata fields (string fields accept string or null to clear)
    const stringMetaFields = [
      'segment', 'businessModel', 'industry', 'vertical',
      'revenueType', 'pricingTier', 'stack', 'dataMoat', 'maintenance',
      'buyer', 'userCountEstimate', 'geography',
      'signalSource', 'urgency', 'validation',
    ] as const;
    const metaValues: Record<string, any> = {
      segment, businessModel, industry, vertical,
      revenueType, pricingTier, stack, dataMoat, maintenance,
      buyer, userCountEstimate, geography,
      signalSource, urgency, validation,
    };
    for (const field of stringMetaFields) {
      if (typeof metaValues[field] === "string" || metaValues[field] === null) {
        (data as any)[field] = metaValues[field];
      }
    }
    if (typeof revenueCeiling === "number" || revenueCeiling === null) {
      data.revenueCeiling = revenueCeiling;
    }

    const post = await prisma.post.update({
      where: { id },
      data,
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
      isTriaged: post.isTriaged,
      passedTriage: post.passedTriage,
      triageScore: post.triageScore,
      triageReason: post.triageReason,
      triagedAt: post.triagedAt,
      isEvaluated: post.isEvaluated,
      evaluatedAt: post.evaluatedAt,
      marketSizeScore: post.marketSizeScore,
      wtpScore: post.wtpScore,
      easeScore: post.easeScore,
      competitionScore: post.competitionScore,
      totalScore: post.totalScore,
      evaluationNotes: post.evaluationNotes,
      // Metadata
      segment: post.segment,
      businessModel: post.businessModel,
      industry: post.industry,
      vertical: post.vertical,
      revenueType: post.revenueType,
      pricingTier: post.pricingTier,
      revenueCeiling: post.revenueCeiling,
      stack: post.stack,
      dataMoat: post.dataMoat,
      maintenance: post.maintenance,
      buyer: post.buyer,
      userCountEstimate: post.userCountEstimate,
      geography: post.geography,
      signalSource: post.signalSource,
      urgency: post.urgency,
      validation: post.validation,
    });
  } catch (err) {
    console.error("Error updating post:", err);
    res.status(500).json({ error: "Failed to update post" });
  }
});

export default router;
