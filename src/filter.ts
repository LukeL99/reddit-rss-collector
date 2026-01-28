import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { Post } from "@prisma/client";
import { prisma } from "./lib/db.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FILTER_BATCH_SIZE = parseInt(process.env.FILTER_BATCH_SIZE || "50", 10);
const FILTER_MODEL = process.env.FILTER_MODEL || "gemini-3-flash-preview";

// Stop signal for cancellation
let stopRequested = false;

export function requestStop(): void {
  stopRequested = true;
}

export function isStopRequested(): boolean {
  return stopRequested;
}

export interface FilterResult {
  isOpportunity: boolean;
  score: number;
  reason: string;
}

// Structured output schema for Gemini 3
const filterResultSchema = {
  type: SchemaType.OBJECT as const,
  properties: {
    isOpportunity: {
      type: SchemaType.BOOLEAN as const,
      description: "Whether this post represents a genuine business opportunity",
    },
    score: {
      type: SchemaType.INTEGER as const,
      description: "Opportunity score from 0-10, where 7+ indicates a clear, buildable, validated pain point",
    },
    reason: {
      type: SchemaType.STRING as const,
      description: "Brief 1-2 sentence explanation of the evaluation",
    },
  },
  required: ["isOpportunity", "score", "reason"],
};

const PROMPT_TEMPLATE = `You are identifying Reddit posts where someone has a PROBLEM that could be solved with software.

POST TITLE: {title}
POST BODY: {body}
SUBREDDIT: r/{subreddit}
UPVOTES: {score}
COMMENTS: {numComments}

WHAT IS AN OPPORTUNITY (score 7-10):
- Someone frustrated with a manual/tedious process
- "Is there a tool/app that does X?"
- "I wish there was a way to..."
- Describing a specific workflow problem with no good solution
- Pain point with evidence of demand (upvotes, "me too" comments)

WHAT IS NOT AN OPPORTUNITY (score 0-3):
- Someone promoting/showing off their own project
- Asking for feedback on something they built
- General advice questions (career, relationships, health)
- Vague wishes without specific problems
- Problems that can't be solved with software
- Already well-served markets (another todo app, note-taking, etc.)

Be VERY strict. 95% of posts are NOT opportunities. Only score 7+ for clear, specific, buildable pain points where someone is actively struggling.`;

function buildPrompt(post: Post & { subreddit: { name: string } }): string {
  return PROMPT_TEMPLATE
    .replace("{title}", post.title)
    .replace("{body}", post.body || "(no body)")
    .replace("{subreddit}", post.subreddit.name)
    .replace("{score}", String(post.score))
    .replace("{numComments}", String(post.numComments));
}

export async function evaluatePost(
  post: Post & { subreddit: { name: string } }
): Promise<FilterResult> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: FILTER_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: filterResultSchema,
    },
  });

  const prompt = buildPrompt(post);

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // With structured output, response is guaranteed valid JSON
    const parsed = JSON.parse(text) as FilterResult;

    // Normalize score to 0-10 range
    return {
      isOpportunity: Boolean(parsed.isOpportunity),
      score: Math.max(0, Math.min(10, Math.round(parsed.score))),
      reason: String(parsed.reason || "").substring(0, 500),
    };
  } catch (error) {
    console.error("Error evaluating post:", error);
    throw error;
  }
}

export async function filterNewPosts(): Promise<{
  evaluated: number;
  opportunities: number;
  stopped: boolean;
}> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  // Reset stop signal at start
  stopRequested = false;

  let evaluated = 0;
  let opportunities = 0;

  // Process all pending posts in batches until done or stopped
  while (!stopRequested) {
    // Get next batch of unevaluated posts
    const posts = await prisma.post.findMany({
      where: { isEvaluated: false },
      include: { subreddit: { select: { name: true } } },
      take: FILTER_BATCH_SIZE,
      orderBy: { createdUtc: "desc" },
    });

    // No more posts to process
    if (posts.length === 0) {
      break;
    }

    for (const post of posts) {
      // Check stop signal before each post
      if (stopRequested) {
        console.log("[Filter] Stop requested, halting...");
        break;
      }

      try {
        const result = await evaluatePost(post);

        await prisma.post.update({
          where: { id: post.id },
          data: {
            isEvaluated: true,
            isOpportunity: result.isOpportunity,
            opportunityScore: result.score,
            opportunityReason: result.reason,
            evaluatedAt: new Date(),
          },
        });

        evaluated++;
        if (result.isOpportunity) {
          opportunities++;
        }

        console.log(
          `Evaluated: "${post.title.substring(0, 50)}..." - Score: ${result.score}, Opportunity: ${result.isOpportunity}`
        );

        // Small delay to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to evaluate post ${post.id}:`, error);
        // Mark as evaluated to avoid infinite retry loop, but with null values
        await prisma.post.update({
          where: { id: post.id },
          data: {
            isEvaluated: true,
            isOpportunity: null,
            opportunityScore: null,
            opportunityReason: "Evaluation failed",
            evaluatedAt: new Date(),
          },
        });
        evaluated++;
      }
    }
  }

  return { evaluated, opportunities, stopped: stopRequested };
}

export async function getFilterStatus(): Promise<{
  total: number;
  pending: number;
  evaluated: number;
  opportunities: number;
  avgScore: number | null;
}> {
  const [total, pending, opportunities, avgResult] = await Promise.all([
    prisma.post.count(),
    prisma.post.count({ where: { isEvaluated: false } }),
    prisma.post.count({ where: { isOpportunity: true } }),
    prisma.post.aggregate({
      where: { isEvaluated: true, opportunityScore: { not: null } },
      _avg: { opportunityScore: true },
    }),
  ]);

  return {
    total,
    pending,
    evaluated: total - pending,
    opportunities,
    avgScore: avgResult._avg.opportunityScore,
  };
}

// Background filter state
let backgroundFilterRunning = false;

export function isBackgroundFilterRunning(): boolean {
  return backgroundFilterRunning;
}

export async function startBackgroundFilter(): Promise<void> {
  if (!process.env.GEMINI_API_KEY) {
    console.log("[Filter] Background filter disabled - no GEMINI_API_KEY");
    return;
  }

  if (backgroundFilterRunning) {
    console.log("[Filter] Background filter already running");
    return;
  }

  backgroundFilterRunning = true;
  console.log("[Filter] Starting background filter...");

  while (backgroundFilterRunning) {
    try {
      // Get one unevaluated post
      const post = await prisma.post.findFirst({
        where: { isEvaluated: false },
        include: { subreddit: { select: { name: true } } },
        orderBy: { createdUtc: "desc" },
      });

      if (!post) {
        // No pending posts, sleep for 30 seconds then check again
        await new Promise((resolve) => setTimeout(resolve, 30000));
        continue;
      }

      // Evaluate the post
      try {
        const result = await evaluatePost(post);

        await prisma.post.update({
          where: { id: post.id },
          data: {
            isEvaluated: true,
            isOpportunity: result.isOpportunity,
            opportunityScore: result.score,
            opportunityReason: result.reason,
            evaluatedAt: new Date(),
          },
        });

        console.log(
          `[Filter] Evaluated: "${post.title.substring(0, 50)}..." - Score: ${result.score}, Opportunity: ${result.isOpportunity}`
        );
      } catch (error) {
        console.error(`[Filter] Failed to evaluate post ${post.id}:`, error);
        // Mark as evaluated to avoid infinite retry
        await prisma.post.update({
          where: { id: post.id },
          data: {
            isEvaluated: true,
            isOpportunity: null,
            opportunityScore: null,
            opportunityReason: "Evaluation failed",
            evaluatedAt: new Date(),
          },
        });
      }

      // Small delay between posts to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error("[Filter] Background filter error:", error);
      // Sleep on error to avoid tight loop
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  console.log("[Filter] Background filter stopped");
}

export function stopBackgroundFilter(): void {
  backgroundFilterRunning = false;
}
