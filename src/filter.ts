import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { Post } from "@prisma/client";
import { prisma } from "./lib/db.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FILTER_BATCH_SIZE = parseInt(process.env.FILTER_BATCH_SIZE || "50", 10);
const FILTER_MODEL = process.env.FILTER_MODEL || "gemini-3-flash-preview";

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

const PROMPT_TEMPLATE = `You are evaluating Reddit posts for business opportunity potential.

POST TITLE: {title}
POST BODY: {body}
SUBREDDIT: r/{subreddit}
UPVOTES: {score}
COMMENTS: {numComments}

Scoring criteria:
- Is this a real problem someone would pay to solve?
- Could a small team build a solution in weeks/months?
- Is there evidence of demand beyond this one person?
- Is it specific and actionable (not vague wishes)?

Be strict. Most posts are NOT opportunities. Score 7+ only for clear, buildable, validated pain points.`;

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
}> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  // Get unevaluated posts
  const posts = await prisma.post.findMany({
    where: { isEvaluated: false },
    include: { subreddit: { select: { name: true } } },
    take: FILTER_BATCH_SIZE,
    orderBy: { createdUtc: "desc" },
  });

  let evaluated = 0;
  let opportunities = 0;

  for (const post of posts) {
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

  return { evaluated, opportunities };
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
