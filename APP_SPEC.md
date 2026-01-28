# Reddit RSS Collector

A self-hosted service that collects posts from Reddit subreddits via RSS feeds and stores them in a queryable database.

## Overview

- **Purpose:** Collect Reddit posts from specific subreddits for opportunity/idea mining
- **Deployment:** Docker Compose on Unraid server
- **CI/CD:** GitHub Actions → AWS ECR

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Compose                        │
├─────────────────┬───────────────────┬───────────────────┤
│   Web UI (3000) │  Collector (cron) │  PostgreSQL (5432)│
│   - Manage subs │  - Fetch RSS      │  - Store posts    │
│   - View posts  │  - Parse & store  │                   │
└─────────────────┴───────────────────┴───────────────────┘
```

## Tech Stack

- **Backend:** Node.js with Express
- **Database:** PostgreSQL (better for queries than SQLite)
- **Frontend:** Simple HTML + Tailwind CSS (no framework needed)
- **RSS Parsing:** rss-parser npm package
- **ORM:** Prisma (type-safe, easy migrations)

## Database Schema

### Subreddits
```
- id: uuid
- name: string (unique, e.g., "SomebodyMakeThis")
- enabled: boolean (default true)
- created_at: timestamp
- last_fetched_at: timestamp
```

### Posts
```
- id: uuid
- reddit_id: string (unique, the t3_xxx ID)
- subreddit_id: uuid (FK)
- title: string
- body: text (nullable, selftext)
- author: string
- url: string (permalink)
- score: integer
- num_comments: integer
- created_utc: timestamp (Reddit's created time)
- fetched_at: timestamp
- is_flagged: boolean (default false, for marking interesting ones)
```

## API Endpoints

### Subreddits
- `GET /api/subreddits` - List all subreddits
- `POST /api/subreddits` - Add a subreddit `{ name: "SomebodyMakeThis" }`
- `DELETE /api/subreddits/:id` - Remove a subreddit
- `PATCH /api/subreddits/:id` - Update (enable/disable)

### Posts
- `GET /api/posts` - List posts with filters:
  - `?subreddit=name` - Filter by subreddit
  - `?search=keyword` - Search title/body
  - `?minScore=10` - Minimum score
  - `?flagged=true` - Only flagged posts
  - `?since=2024-01-01` - Posts after date
  - `?limit=50&offset=0` - Pagination
- `PATCH /api/posts/:id` - Update post (flag/unflag)

### System
- `GET /api/health` - Health check
- `POST /api/collect` - Trigger manual collection run

## Web UI

Simple single-page app with two views:

### Subreddits View
- List of monitored subreddits with post count
- Toggle enable/disable
- Add new subreddit (input + button)
- Delete subreddit

### Posts View (default)
- Filterable list of posts
- Search box
- Subreddit filter dropdown
- Min score slider
- Flagged only checkbox
- Each post shows: title, subreddit, score, comments, age, flag button
- Click title to open Reddit post in new tab

## RSS Feed Format

Reddit RSS URL: `https://www.reddit.com/r/{subreddit}/new.rss`

Each item contains:
- `title` - Post title
- `link` - Full Reddit URL
- `content` - HTML with selftext
- `author` - Username (in /u/xxx format)
- `published` - ISO date

## Collector Service

Runs on a schedule (configurable, default every 30 minutes):

1. Fetch enabled subreddits from DB
2. For each subreddit:
   - Fetch RSS feed (with timeout)
   - Parse items
   - Upsert posts (skip if reddit_id exists)
   - Update subreddit.last_fetched_at
3. Log results

## Docker Setup

### Dockerfile (multi-stage)
```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
EXPOSE 3000
CMD ["npm", "start"]
```

### docker-compose.yml
```yaml
services:
  app:
    image: ${ECR_REPO:-reddit-rss-collector}:${TAG:-latest}
    ports:
      - "8420:3000"
    environment:
      - DATABASE_URL=postgresql://reddit:reddit@db:5432/reddit
      - COLLECT_INTERVAL_MINUTES=30
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=reddit
      - POSTGRES_PASSWORD=reddit
      - POSTGRES_DB=reddit
    restart: unless-stopped

volumes:
  postgres_data:
```

## GitHub Actions

### .github/workflows/build.yml
```yaml
name: Build and Push

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: reddit-rss-collector

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}
      
      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2
      
      - name: Build, tag, and push image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:latest .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest
```

## Initial Subreddits

Seed these on first run:
- SomebodyMakeThis
- AppIdeas
- Entrepreneur
- startups
- SaaS
- smallbusiness

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| DATABASE_URL | required | PostgreSQL connection string |
| COLLECT_INTERVAL_MINUTES | 30 | How often to fetch RSS feeds |
| PORT | 3000 | Web server port |

## Project Structure

```
reddit-rss-collector/
├── src/
│   ├── index.ts          # Main entry, Express app
│   ├── collector.ts      # RSS collection logic
│   ├── routes/
│   │   ├── subreddits.ts
│   │   ├── posts.ts
│   │   └── system.ts
│   └── lib/
│       └── db.ts         # Prisma client
├── prisma/
│   ├── schema.prisma
│   └── seed.ts           # Seed initial subreddits
├── public/
│   └── index.html        # Single-page UI
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── .github/
    └── workflows/
        └── build.yml
```

## Notes

- Use `rss-parser` for RSS fetching (handles Reddit's format well)
- Reddit RSS feeds return ~25 most recent posts
- Dedupe by `reddit_id` (the t3_xxx identifier)
- Store raw HTML body and strip tags for search
- Don't hammer Reddit - 30 min intervals is polite
