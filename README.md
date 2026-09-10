# Ruzhen

Ruzhen is a structured news intelligence platform.

The goal of the project is to process raw news articles, group related articles into clusters, and publish clearer analytical reading blocks where facts, context and opinions are separated.

## Core idea

Modern news consumption often mixes:

- facts
- interpretations
- opinions
- emotional framing
- missing context

Ruzhen is designed to make news easier to analyze by separating these layers and showing related articles as structured clusters.

## Current MVP

The current MVP includes:

- raw news ingestion
- article review flow
- article enrichment
- embedding generation
- clustering workflow
- contextual blocks
- publication workflow
- public article pages
- user authentication
- Google authentication
- admin dashboard

## Tech stack

### Frontend

- React
- TypeScript
- Vite
- React Router
- TanStack React Query
- SCSS
- Storybook

### Backend

- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL
- OpenAI API
- Google Auth Library

### Tooling

- npm workspaces
- Prettier
- ESLint
- Prisma CLI

## Project structure

```txt
ruzhen/
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   └── src/
│   └── web/
│       └── src/
├── packages/
├── package.json
└── README.md
```

## Requirements

Before running the project locally, make sure you have installed:

- Node.js
- npm
- PostgreSQL

## Environment variables

Create local `.env` files from the example files.

### API

Create:

```txt
apps/api/.env
```

Based on:

```txt
apps/api/.env.example
```

Example:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/ruzhen_dev?schema=public"
JWT_ACCESS_SECRET="your_jwt_access_secret"
OPENAI_API_KEY="your_openai_api_key"
GOOGLE_CLIENT_ID="your_google_client_id"
GOOGLE_CLIENT_SECRET="your_google_client_secret"
```

### Web

Create:

```txt
apps/web/.env
```

Based on:

```txt
apps/web/.env.example
```

Example:

```env
VITE_API_URL=http://localhost:4000/api
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

## Install dependencies

From the project root:

```bash
npm install
```

## Database setup

Go to the API app:

```bash
cd apps/api
```

Generate Prisma Client:

```bash
npx prisma generate
```

Run database migrations:

```bash
npx prisma migrate dev
```

Seed the database:

```bash
npm run prisma:seed
```

The seed creates:

- admin user
- initial sources
- initial tags

## Run locally

From the project root:

```bash
npm run dev
```

This starts both applications:

- API server
- Web application

## Build

From the project root:

```bash
npm run build
```

This runs:

```txt
apps/api: TypeScript typecheck
apps/web: TypeScript build + Vite build
```

## Formatting

Format all supported files:

```bash
npm run format
```

Check formatting:

```bash
npm run format:check
```

Format Prisma schema:

```bash
npm run prisma:format
```

## API scripts

From `apps/api`:

```bash
npm run parse:politics
npm run enrich:articles
npm run embed:articles
npm run run:clustering
```

These scripts are used for the news processing pipeline.

### Raw article pagination

RawArticles loads 50 articles per page by default, with 25, 50 and 100 available
in the page-size selector. Filters and page-size changes return to page 1;
changing pages clears manual selection. **Select all shown** selects the current
page, while **All articles matching filters** applies bulk actions and Enrich to
the complete filtered selection. Action counts also cover that whole selection.
The API bounds article loading before retrieving text and returns the last
available page if processing has reduced the results.

### Full article enrichment

RawArticles **Fetch new articles** automatically queues newly saved articles
that do not have verified full text. Saving the article and its queue item is
atomic, so a server restart cannot leave a new article without its enrichment
task. One job groups each Fetch run and appears in Article enrichment; it can
be stopped or its errors retried there. Fetch returns after parsing the sources
while article retrieval continues in the API worker. Repeated URLs and already
verified articles do not create duplicate tasks.
Stopping a job also cancels articles discovered later in that Fetch run;
retrying errors retries only failed items.

RawArticles **Enrich articles** runs as a persistent background job in the API.
It tries the publisher's HTML, a fresh Chromium browser context for JavaScript
pages, then existing archive.today / archive.ph snapshots. Each result keeps its
retrieval source and attempts; archive capture time is separate from the article's
publication date. Existing manual text is offered as a comparison before replacement.

For the `parse:politics` CLI, set `INGESTION_ACTOR_USER_ID` in `apps/api/.env`
to an existing administrator's ID. The API must be running to process the saved
queue; the CLI itself only parses sources and schedules article enrichment.

Enrichment saves the article's plain text with paragraph boundaries, subheadings
and lists. It removes page controls, advertisements, recommendations, bylines,
publication timestamps and image credits. Names and times within the reporting
remain intact. Body recognition supports different publisher layouts and checks
the article's own heading when a page contains multiple stories.

Install the Chromium version matching the API's Playwright dependency once after
installing npm dependencies:

```bash
npx playwright install chromium
```

Both fallbacks are enabled by default. Set `ENRICH_BROWSER_ENABLED=false` or
`ENRICH_ARCHIVE_ENABLED=false` in `apps/api/.env` to disable an adapter. The API
must remain running for background jobs; reopening RawArticles restores their
saved progress. Missing Chromium, request failures and verification challenges
are reported in the job instead of being treated as complete article text.

The archive adapter reads existing snapshots; it does not submit new captures.
Every candidate must match the original article and pass the same completeness
checks. A snapshot, a long excerpt or a rendered page alone does not establish
that the article is complete. Failed fallback attempts keep the best usable text
found by earlier attempts.

Browser setup and isolated contexts follow the
[Playwright browser installation](https://playwright.dev/docs/browsers) and
[BrowserContext](https://playwright.dev/docs/api/class-browsercontext) documentation.

### Frontend component layout

Each React component has its own named directory. Keep its component, styles,
`TypesComponentName.ts` and component tests together. Place hooks and helpers
with the component that owns them; page integration tests and page styles stay
in the page directory. Reuse the existing tokens and panel styles when adding UI.

## Web scripts

From `apps/web`:

```bash
npm run dev
npm run build
npm run lint
npm run storybook
npm run build-storybook
```

## Main application flows

### Admin flow

```txt
Raw News
→ Review
→ Enrichment
→ Embedding
→ Clustering
→ Contextualization
→ Publication
```

### Public flow

```txt
Published clusters
→ Public articles
→ Article detail pages
```

## Status

Ruzhen is currently in MVP stage.
