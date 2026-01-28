import Parser from "rss-parser";
import { prisma } from "./lib/db.js";

const parser = new Parser({
  timeout: 30000,
  headers: {
    "User-Agent": "reddit-rss-collector/1.0",
  },
});

interface RSSItem {
  title?: string;
  link?: string;
  content?: string;
  creator?: string;
  author?: string;
  pubDate?: string;
  isoDate?: string;
}

function extractRedditId(link: string): string | null {
  // Extract the Reddit ID from URLs like https://www.reddit.com/r/subreddit/comments/abc123/...
  const match = link.match(/\/comments\/([a-z0-9]+)\//i);
  return match ? `t3_${match[1]}` : null;
}

function extractAuthor(creator?: string, author?: string): string {
  const raw = creator || author || "unknown";
  // Remove /u/ prefix if present
  return raw.replace(/^\/u\//, "");
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export async function collectFromSubreddit(subredditName: string): Promise<{
  fetched: number;
  newPosts: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let fetched = 0;
  let newPosts = 0;

  try {
    const subreddit = await prisma.subreddit.findUnique({
      where: { name: subredditName },
    });

    if (!subreddit) {
      return { fetched: 0, newPosts: 0, errors: [`Subreddit ${subredditName} not found in database`] };
    }

    const feedUrl = `https://www.reddit.com/r/${subredditName}/new.rss`;
    const feed = await parser.parseURL(feedUrl);

    fetched = feed.items?.length || 0;

    for (const item of feed.items || []) {
      const rssItem = item as RSSItem;

      if (!rssItem.link) continue;

      const redditId = extractRedditId(rssItem.link);
      if (!redditId) {
        errors.push(`Could not extract Reddit ID from ${rssItem.link}`);
        continue;
      }

      const existingPost = await prisma.post.findUnique({
        where: { redditId },
      });

      if (existingPost) continue;

      try {
        await prisma.post.create({
          data: {
            redditId,
            subredditId: subreddit.id,
            title: rssItem.title || "No title",
            body: rssItem.content ? stripHtml(rssItem.content) : null,
            author: extractAuthor(rssItem.creator, rssItem.author),
            url: rssItem.link,
            score: 0,
            numComments: 0,
            createdUtc: rssItem.isoDate ? new Date(rssItem.isoDate) : new Date(),
          },
        });
        newPosts++;
      } catch (err) {
        errors.push(`Failed to save post ${redditId}: ${err}`);
      }
    }

    await prisma.subreddit.update({
      where: { id: subreddit.id },
      data: { lastFetchedAt: new Date() },
    });
  } catch (err) {
    errors.push(`Failed to fetch feed for r/${subredditName}: ${err}`);
  }

  return { fetched, newPosts, errors };
}

export async function collectAll(): Promise<{
  totalFetched: number;
  totalNew: number;
  subredditResults: Record<string, { fetched: number; newPosts: number; errors: string[] }>;
}> {
  console.log("[Collector] Starting collection run...");

  const subreddits = await prisma.subreddit.findMany({
    where: { enabled: true },
  });

  let totalFetched = 0;
  let totalNew = 0;
  const subredditResults: Record<string, { fetched: number; newPosts: number; errors: string[] }> = {};

  for (const subreddit of subreddits) {
    console.log(`[Collector] Fetching r/${subreddit.name}...`);
    const result = await collectFromSubreddit(subreddit.name);
    subredditResults[subreddit.name] = result;
    totalFetched += result.fetched;
    totalNew += result.newPosts;

    if (result.errors.length > 0) {
      console.error(`[Collector] Errors for r/${subreddit.name}:`, result.errors);
    } else {
      console.log(`[Collector] r/${subreddit.name}: ${result.fetched} fetched, ${result.newPosts} new`);
    }

    // Be polite to Reddit - small delay between requests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log(`[Collector] Complete: ${totalFetched} posts fetched, ${totalNew} new posts saved`);

  return { totalFetched, totalNew, subredditResults };
}

export function startCollector(intervalMinutes: number): NodeJS.Timeout {
  console.log(`[Collector] Starting scheduled collector (every ${intervalMinutes} minutes)`);

  // Run immediately on startup
  collectAll().catch(console.error);

  // Then run on interval
  return setInterval(
    () => {
      collectAll().catch(console.error);
    },
    intervalMinutes * 60 * 1000
  );
}
