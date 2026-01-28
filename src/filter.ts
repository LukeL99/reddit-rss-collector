import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { Post } from "@prisma/client";
import { prisma } from "./lib/db.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TRIAGE_BATCH_SIZE = parseInt(process.env.FILTER_BATCH_SIZE || "50", 10);
const TRIAGE_MODEL = process.env.FILTER_MODEL || "gemini-3-flash-preview";

// Stop signal for cancellation
let stopRequested = false;

export function requestStop(): void {
  stopRequested = true;
}

export function isStopRequested(): boolean {
  return stopRequested;
}

export interface TriageResult {
  passedTriage: boolean;
  score: number;
  reason: string;
}

// Structured output schema for Gemini 3
const triageResultSchema = {
  type: SchemaType.OBJECT as const,
  properties: {
    passedTriage: {
      type: SchemaType.BOOLEAN as const,
      description: "Whether this post should pass triage for deeper evaluation",
    },
    score: {
      type: SchemaType.INTEGER as const,
      description: "Triage score from 0-10, where 7+ passes triage",
    },
    reason: {
      type: SchemaType.STRING as const,
      description: "Brief 1-2 sentence explanation",
    },
  },
  required: ["passedTriage", "score", "reason"],
};

const PROMPT_TEMPLATE = `You are triaging Reddit posts to identify potential business opportunities for deeper analysis.

POST TITLE: {title}
POST BODY: {body}
SUBREDDIT: r/{subreddit}
UPVOTES: {score}
COMMENTS: {numComments}

PASS TRIAGE (score 7-10):
- Someone frustrated with a manual/tedious process
- "Is there a tool/app that does X?"
- "I wish there was a way to..."
- Describing a specific workflow problem with no good solution
- Pain point with evidence of demand (upvotes, "me too" comments)

FAIL TRIAGE (score 0-3):
- Someone promoting/showing off their own project
- Asking for feedback on something they built
- General advice questions (career, relationships, health)
- Vague wishes without specific problems
- Problems that can't be solved with software
- Already well-served markets (another todo app, note-taking, etc.)

Be VERY strict. 95% of posts should FAIL triage. Only pass posts with clear, specific, buildable pain points.`;

function buildPrompt(post: Post & { subreddit: { name: string } }): string {
  return PROMPT_TEMPLATE
    .replace("{title}", post.title)
    .replace("{body}", post.body || "(no body)")
    .replace("{subreddit}", post.subreddit.name)
    .replace("{score}", String(post.score))
    .replace("{numComments}", String(post.numComments));
}

export async function triagePost(
  post: Post & { subreddit: { name: string } }
): Promise<TriageResult> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: TRIAGE_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: triageResultSchema,
    },
  });

  const prompt = buildPrompt(post);

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    const parsed = JSON.parse(text) as TriageResult;

    return {
      passedTriage: Boolean(parsed.passedTriage),
      score: Math.max(0, Math.min(10, Math.round(parsed.score))),
      reason: String(parsed.reason || "").substring(0, 500),
    };
  } catch (error) {
    console.error("Error triaging post:", error);
    throw error;
  }
}

export async function triageNewPosts(): Promise<{
  triaged: number;
  passed: number;
  stopped: boolean;
}> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  stopRequested = false;

  let triaged = 0;
  let passed = 0;

  while (!stopRequested) {
    const posts = await prisma.post.findMany({
      where: { isTriaged: false },
      include: { subreddit: { select: { name: true } } },
      take: TRIAGE_BATCH_SIZE,
      orderBy: { createdUtc: "desc" },
    });

    if (posts.length === 0) {
      break;
    }

    for (const post of posts) {
      if (stopRequested) {
        console.log("[Triage] Stop requested, halting...");
        break;
      }

      try {
        const result = await triagePost(post);

        await prisma.post.update({
          where: { id: post.id },
          data: {
            isTriaged: true,
            passedTriage: result.passedTriage,
            triageScore: result.score,
            triageReason: result.reason,
            triagedAt: new Date(),
          },
        });

        triaged++;
        if (result.passedTriage) {
          passed++;
        }

        console.log(
          `Triaged: "${post.title.substring(0, 50)}..." - Score: ${result.score}, Passed: ${result.passedTriage}`
        );

        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to triage post ${post.id}:`, error);
        await prisma.post.update({
          where: { id: post.id },
          data: {
            isTriaged: true,
            passedTriage: null,
            triageScore: null,
            triageReason: "Triage failed",
            triagedAt: new Date(),
          },
        });
        triaged++;
      }
    }
  }

  return { triaged, passed, stopped: stopRequested };
}

export async function getTriageStatus(): Promise<{
  total: number;
  pending: number;
  triaged: number;
  passed: number;
  avgScore: number | null;
}> {
  const [total, pending, passed, avgResult] = await Promise.all([
    prisma.post.count(),
    prisma.post.count({ where: { isTriaged: false } }),
    prisma.post.count({ where: { passedTriage: true } }),
    prisma.post.aggregate({
      where: { isTriaged: true, triageScore: { not: null } },
      _avg: { triageScore: true },
    }),
  ]);

  return {
    total,
    pending,
    triaged: total - pending,
    passed,
    avgScore: avgResult._avg.triageScore,
  };
}

// Background triage state
let backgroundTriageRunning = false;

export function isBackgroundTriageRunning(): boolean {
  return backgroundTriageRunning;
}

export async function startBackgroundTriage(): Promise<void> {
  if (!process.env.GEMINI_API_KEY) {
    console.log("[Triage] Background triage disabled - no GEMINI_API_KEY");
    return;
  }

  if (backgroundTriageRunning) {
    console.log("[Triage] Background triage already running");
    return;
  }

  backgroundTriageRunning = true;
  console.log("[Triage] Starting background triage...");

  while (backgroundTriageRunning) {
    try {
      const post = await prisma.post.findFirst({
        where: { isTriaged: false },
        include: { subreddit: { select: { name: true } } },
        orderBy: { createdUtc: "desc" },
      });

      if (!post) {
        await new Promise((resolve) => setTimeout(resolve, 30000));
        continue;
      }

      try {
        const result = await triagePost(post);

        await prisma.post.update({
          where: { id: post.id },
          data: {
            isTriaged: true,
            passedTriage: result.passedTriage,
            triageScore: result.score,
            triageReason: result.reason,
            triagedAt: new Date(),
          },
        });

        console.log(
          `[Triage] "${post.title.substring(0, 50)}..." - Score: ${result.score}, Passed: ${result.passedTriage}`
        );
      } catch (error) {
        console.error(`[Triage] Failed to triage post ${post.id}:`, error);
        await prisma.post.update({
          where: { id: post.id },
          data: {
            isTriaged: true,
            passedTriage: null,
            triageScore: null,
            triageReason: "Triage failed",
            triagedAt: new Date(),
          },
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error("[Triage] Background triage error:", error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  console.log("[Triage] Background triage stopped");
}

export function stopBackgroundTriage(): void {
  backgroundTriageRunning = false;
}
