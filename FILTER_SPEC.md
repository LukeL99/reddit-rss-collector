# Reddit Opportunity Filter - Feature Spec

## Overview
Add an LLM-powered filtering system that evaluates new posts and scores them for business opportunity potential. This reduces the dataset from thousands of posts to a curated list of actionable opportunities.

## Goals
1. Automatically evaluate new posts for business opportunity potential
2. Score and tag posts so humans only review high-signal items
3. Keep costs low using Gemini Flash 3 Preview
4. Run as a batch worker (not inline) to avoid slowing collection

## Database Changes

Add fields to the `Post` model in `prisma/schema.prisma`:

```prisma
model Post {
  // ... existing fields ...
  
  // Opportunity filtering
  isEvaluated     Boolean   @default(false) @map("is_evaluated")
  isOpportunity   Boolean?  @map("is_opportunity")
  opportunityScore Int?     @map("opportunity_score")  // 0-10
  opportunityReason String? @map("opportunity_reason")
  evaluatedAt     DateTime? @map("evaluated_at")
}
```

Run migration after changes.

## Environment Variables

Add to `.env`:
```
GEMINI_API_KEY=your_key_here
FILTER_BATCH_SIZE=50
FILTER_MODEL=gemini-2.0-flash
```

## New Files

### `src/filter.ts` - Core filtering logic

```typescript
interface FilterResult {
  isOpportunity: boolean;
  score: number;        // 0-10
  reason: string;       // Brief explanation
}

async function evaluatePost(post: Post): Promise<FilterResult>
async function filterNewPosts(): Promise<{ evaluated: number; opportunities: number }>
```

**Evaluation prompt should assess:**
1. Is this a real problem someone would pay to solve?
2. Could a small team (1-3 people) build a solution?
3. Is there evidence of demand (not just venting)?
4. Is it specific enough to be actionable?
5. Is the market accessible (not requiring huge capital/regulation)?

**Scoring guidelines:**
- 0-3: Not an opportunity (venting, too vague, already solved well)
- 4-6: Maybe interesting (needs more validation)
- 7-10: Strong signal (clear pain, buildable, market exists)

### `src/routes/filter.ts` - API endpoints

```
POST /api/filter          - Trigger manual filter run
GET  /api/filter/status   - Get filter stats (pending, evaluated, opportunities)
```

### `src/jobs/filter-worker.ts` - Background worker

- Runs every hour (or on-demand via API)
- Processes posts where `isEvaluated = false`
- Batch size configurable (default 50)
- Respects rate limits

## API Changes

### Update `GET /api/posts`

Add query params:
- `evaluated=true|false` - Filter by evaluation status
- `opportunity=true|false` - Filter by opportunity status  
- `minOpportunityScore=N` - Minimum score filter

### Update response to include new fields:
```json
{
  "posts": [{
    "id": "...",
    "title": "...",
    "isEvaluated": true,
    "isOpportunity": true,
    "opportunityScore": 8,
    "opportunityReason": "Clear pain point for small business owners..."
  }]
}
```

## UI Changes (public/index.html)

1. Add "Opportunities Only" toggle/filter
2. Show opportunity score badge on posts (color-coded)
3. Show evaluation status indicator
4. Add "Filter Now" button (like "Collect Now")

## Implementation Order

1. [ ] Database schema changes + migration
2. [ ] Core filter logic (`src/filter.ts`)
3. [ ] Gemini API integration
4. [ ] Filter API routes
5. [ ] Background worker
6. [ ] Update posts API with new filters
7. [ ] UI updates
8. [ ] Testing with real data

## Gemini API Integration

Use the Google Generative AI SDK:
```bash
npm install @google/generative-ai
```

Example usage:
```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const result = await model.generateContent(prompt);
```

## Prompt Template

```
You are evaluating Reddit posts for business opportunity potential.

POST TITLE: {title}
POST BODY: {body}
SUBREDDIT: r/{subreddit}
UPVOTES: {score}
COMMENTS: {numComments}

Evaluate this post and respond with JSON only:
{
  "isOpportunity": boolean,
  "score": number (0-10),
  "reason": "Brief 1-2 sentence explanation"
}

Scoring criteria:
- Is this a real problem someone would pay to solve?
- Could a small team build a solution in weeks/months?
- Is there evidence of demand beyond this one person?
- Is it specific and actionable (not vague wishes)?

Be strict. Most posts are NOT opportunities. Score 7+ only for clear, buildable, validated pain points.
```

## Cost Estimate

- Gemini Flash: ~$0.0001 per 1K input tokens
- Average post: ~500 tokens
- 4000 posts: ~$0.20 for full evaluation
- Daily new posts (~500): ~$0.025/day

Very cheap. Don't optimize prematurely.

## Success Criteria

- [ ] Filter correctly identifies 80%+ of obvious non-opportunities
- [ ] High-scoring posts (7+) are genuinely interesting
- [ ] Full evaluation of backlog completes in <10 minutes
- [ ] UI clearly shows opportunity status
- [ ] Worker runs reliably without intervention
