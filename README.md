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
