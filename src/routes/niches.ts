import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";

const router = Router();

// Helper to format a niche post for API response
function formatNiche(p: any) {
  return {
    id: p.id,
    redditId: p.redditId,
    subreddit: p.subreddit?.name ?? null,
    title: p.title,
    body: p.body,
    author: p.author,
    url: p.url,
    score: p.score,
    numComments: p.numComments,
    createdUtc: p.createdUtc,
    fetchedAt: p.fetchedAt,
    isFlagged: p.isFlagged,
    // Niche-specific
    isNiche: p.isNiche,
    parentPostId: p.parentPostId,
    parentPost: p.parentPost
      ? { id: p.parentPost.id, title: p.parentPost.title, url: p.parentPost.url }
      : null,
    nicheSource: p.nicheSource,
    nicheDescription: p.nicheDescription,
    revenueScore: p.revenueScore,
    nicheDefensibility: p.nicheDefensibility,
    // Evaluation
    isEvaluated: p.isEvaluated,
    evaluatedAt: p.evaluatedAt,
    marketSizeScore: p.marketSizeScore,
    wtpScore: p.wtpScore,
    easeScore: p.easeScore,
    competitionScore: p.competitionScore,
    totalScore: p.totalScore,
    evaluationNotes: p.evaluationNotes,
    // Metadata
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
    notes: p.notes,
  };
}

// GET /api/niches - List all niches with filters
router.get("/", async (req, res) => {
  try {
    const {
      minTotalScore,
      evaluated,
      parentPostId,
      minRevenueScore,
      minDefensibility,
      search,
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

    const where: Prisma.PostWhereInput = { isNiche: true };

    if (minTotalScore && typeof minTotalScore === "string") {
      const score = parseInt(minTotalScore, 10);
      if (!isNaN(score)) where.totalScore = { gte: score };
    }

    if (evaluated === "true") {
      where.isEvaluated = true;
    } else if (evaluated === "false") {
      where.isEvaluated = false;
    }

    if (parentPostId && typeof parentPostId === "string") {
      where.parentPostId = parentPostId;
    }

    if (minRevenueScore && typeof minRevenueScore === "string") {
      const score = parseInt(minRevenueScore, 10);
      if (!isNaN(score)) where.revenueScore = { gte: score };
    }

    if (minDefensibility && typeof minDefensibility === "string") {
      const score = parseInt(minDefensibility, 10);
      if (!isNaN(score)) where.nicheDefensibility = { gte: score };
    }

    if (search && typeof search === "string") {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { nicheDescription: { contains: search, mode: "insensitive" } },
      ];
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

    const [niches, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          subreddit: { select: { name: true } },
          parentPost: { select: { id: true, title: true, url: true } },
        },
        orderBy: [{ totalScore: "desc" }, { createdUtc: "desc" }],
        take,
        skip,
      }),
      prisma.post.count({ where }),
    ]);

    res.json({
      niches: niches.map(formatNiche),
      total,
      limit: take,
      offset: skip,
    });
  } catch (err) {
    console.error("Error fetching niches:", err);
    res.status(500).json({ error: "Failed to fetch niches" });
  }
});

// POST /api/niches - Create a niche
router.post("/", async (req, res) => {
  try {
    const {
      parentPostId,
      // Accept both naming conventions
      title,
      name,
      nicheDescription,
      description,
      nicheSource,
      source,
      revenueScore,
      nicheDefensibility,
      // Optional evaluation fields
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
      // Notes
      notes,
    } = req.body;

    // Support friendly aliases: name→title, description→nicheDescription, source→nicheSource
    const resolvedTitle = title || name;
    const resolvedDescription = nicheDescription || description;
    const resolvedSource = nicheSource || source;

    if (!parentPostId) {
      return res.status(400).json({ error: "parentPostId is required" });
    }

    if (!resolvedTitle && !resolvedDescription) {
      return res.status(400).json({ error: "title/name or nicheDescription/description is required" });
    }

    // Verify parent post exists and is not itself a niche
    const parentPost = await prisma.post.findUnique({
      where: { id: parentPostId },
      select: { id: true, subredditId: true, isNiche: true },
    });

    if (!parentPost) {
      return res.status(404).json({ error: "Parent post not found" });
    }

    const nicheTitle = resolvedTitle || resolvedDescription!.substring(0, 200);

    const niche = await prisma.post.create({
      data: {
        redditId: `niche-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        subredditId: parentPost.subredditId,
        title: nicheTitle,
        body: resolvedDescription || null,
        author: "glitch",
        url: "",
        score: 0,
        numComments: 0,
        createdUtc: new Date(),
        isNiche: true,
        parentPostId,
        nicheSource: resolvedSource || "manual",
        nicheDescription: resolvedDescription || null,
        revenueScore: typeof revenueScore === "number" ? revenueScore : null,
        nicheDefensibility: typeof nicheDefensibility === "number" ? nicheDefensibility : null,
        // Evaluation
        isEvaluated: totalScore != null,
        evaluatedAt: totalScore != null ? new Date() : null,
        marketSizeScore: typeof marketSizeScore === "number" ? marketSizeScore : null,
        wtpScore: typeof wtpScore === "number" ? wtpScore : null,
        easeScore: typeof easeScore === "number" ? easeScore : null,
        competitionScore: typeof competitionScore === "number" ? competitionScore : null,
        totalScore: typeof totalScore === "number" ? totalScore : null,
        evaluationNotes: typeof evaluationNotes === "string" ? evaluationNotes : null,
        // Metadata
        segment: typeof segment === "string" ? segment : null,
        businessModel: typeof businessModel === "string" ? businessModel : null,
        industry: typeof industry === "string" ? industry : null,
        vertical: typeof vertical === "string" ? vertical : null,
        revenueType: typeof revenueType === "string" ? revenueType : null,
        pricingTier: typeof pricingTier === "string" ? pricingTier : null,
        revenueCeiling: typeof revenueCeiling === "number" ? revenueCeiling : null,
        stack: typeof stack === "string" ? stack : null,
        dataMoat: typeof dataMoat === "string" ? dataMoat : null,
        maintenance: typeof maintenance === "string" ? maintenance : null,
        buyer: typeof buyer === "string" ? buyer : null,
        userCountEstimate: typeof userCountEstimate === "string" ? userCountEstimate : null,
        geography: typeof geography === "string" ? geography : null,
        signalSource: typeof signalSource === "string" ? signalSource : null,
        urgency: typeof urgency === "string" ? urgency : null,
        validation: typeof validation === "string" ? validation : null,
        // Notes
        notes: typeof notes === "string" ? notes : null,
      },
      include: {
        subreddit: { select: { name: true } },
        parentPost: { select: { id: true, title: true, url: true } },
      },
    });

    res.status(201).json(formatNiche(niche));
  } catch (err) {
    console.error("Error creating niche:", err);
    res.status(500).json({ error: "Failed to create niche" });
  }
});

// PATCH /api/niches/:id - Update niche scores
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nicheDescription,
      nicheSource,
      revenueScore,
      nicheDefensibility,
      isFlagged,
      isEvaluated,
      marketSizeScore,
      wtpScore,
      easeScore,
      competitionScore,
      totalScore,
      evaluationNotes,
    } = req.body;

    // Verify it's actually a niche
    const existing = await prisma.post.findUnique({
      where: { id },
      select: { isNiche: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "Niche not found" });
    }
    if (!existing.isNiche) {
      return res.status(400).json({ error: "Post is not a niche" });
    }

    const data: Prisma.PostUpdateInput = {};

    if (typeof req.body.notes === "string" || req.body.notes === null) {
      data.notes = req.body.notes;
    }
    if (typeof nicheDescription === "string") data.nicheDescription = nicheDescription;
    if (typeof nicheSource === "string") data.nicheSource = nicheSource;
    if (typeof revenueScore === "number") data.revenueScore = revenueScore;
    if (typeof nicheDefensibility === "number") data.nicheDefensibility = nicheDefensibility;
    if (typeof isFlagged === "boolean") data.isFlagged = isFlagged;
    if (typeof isEvaluated === "boolean") {
      data.isEvaluated = isEvaluated;
      data.evaluatedAt = isEvaluated ? new Date() : null;
    }
    if (typeof marketSizeScore === "number") data.marketSizeScore = marketSizeScore;
    if (typeof wtpScore === "number") data.wtpScore = wtpScore;
    if (typeof easeScore === "number") data.easeScore = easeScore;
    if (typeof competitionScore === "number") data.competitionScore = competitionScore;
    if (typeof totalScore === "number") data.totalScore = totalScore;
    if (typeof evaluationNotes === "string") data.evaluationNotes = evaluationNotes;

    // Metadata fields
    const metaStringFields = [
      'segment', 'businessModel', 'industry', 'vertical',
      'revenueType', 'pricingTier', 'stack', 'dataMoat', 'maintenance',
      'buyer', 'userCountEstimate', 'geography',
      'signalSource', 'urgency', 'validation',
    ] as const;
    for (const field of metaStringFields) {
      if (typeof req.body[field] === "string" || req.body[field] === null) {
        (data as any)[field] = req.body[field];
      }
    }
    if (typeof req.body.revenueCeiling === "number" || req.body.revenueCeiling === null) {
      data.revenueCeiling = req.body.revenueCeiling;
    }

    const niche = await prisma.post.update({
      where: { id },
      data,
      include: {
        subreddit: { select: { name: true } },
        parentPost: { select: { id: true, title: true, url: true } },
      },
    });

    res.json(formatNiche(niche));
  } catch (err) {
    console.error("Error updating niche:", err);
    res.status(500).json({ error: "Failed to update niche" });
  }
});

export default router;
