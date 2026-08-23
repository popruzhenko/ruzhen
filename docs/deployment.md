# Ruzhen Deployment Plan

This document describes the planned production deployment architecture for Ruzhen.

## Deployment goal

The goal is to deploy Ruzhen as a production-ready web application with:

- public frontend
- backend API
- PostgreSQL database
- domain routing
- HTTPS
- environment-based configuration
- repeatable deployment process

## Target architecture

```txt
User browser
    ↓
https://ruzhen.org
    ↓
Frontend application

User browser / Frontend
    ↓
https://api.ruzhen.org
    ↓
Backend API
    ↓
PostgreSQL database
```

## Planned domains

### Frontend

```txt
https://ruzhen.org
```

Used for:

- public article pages
- public cluster pages
- login/register pages
- user dashboard
- admin dashboard

### Backend API

```txt
https://api.ruzhen.org
```

Used for:

- authentication
- article API
- cluster API
- publication API
- admin API
- ingestion and processing APIs

## Recommended hosting model

The recommended production setup is a VPS.

VPS means Virtual Private Server. It gives direct control over:

- Node.js runtime
- PostgreSQL
- Nginx
- Docker
- SSL certificates
- environment variables
- background scripts

Shared hosting is not recommended for this project because Ruzhen requires a custom backend API, database access, Prisma, scheduled/background scripts and production process management.

## Main production components

### Frontend

The frontend is located in:

```txt
apps/web
```

Production build command:

```bash
npm run build -w apps/web
```

The build output is expected to be served as static files.

### Backend API

The backend is located in:

```txt
apps/api
```

Current build command:

```bash
npm run build -w apps/api
```

At the current MVP stage, this command runs TypeScript typecheck.

A production build/output strategy still needs to be finalized before deployment.

### Database

Ruzhen uses PostgreSQL.

The production database should be separated from the local development database.

Production `DATABASE_URL` must point to the production PostgreSQL database.

Example format:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
```

## Environment variables

### API environment variables

Production API requires:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
JWT_ACCESS_SECRET="production_jwt_access_secret"
OPENAI_API_KEY="production_openai_api_key"
GOOGLE_CLIENT_ID="production_google_client_id"
GOOGLE_CLIENT_SECRET="production_google_client_secret"
```

### Web environment variables

Production web requires:

```env
VITE_API_URL=https://api.ruzhen.org/api
VITE_GOOGLE_CLIENT_ID=production_google_client_id
```

## Deployment stages

### Stage 1: CI

Already implemented:

- install dependencies
- generate Prisma Client
- check formatting
- build project

GitHub Actions workflow:

```txt
.github/workflows/ci.yml
```

### Stage 2: Manual deployment documentation

Current stage.

The goal is to document:

- production architecture
- domain structure
- environment variables
- deployment assumptions
- future Docker plan

### Stage 3: Docker setup

Planned files:

```txt
apps/api/Dockerfile
apps/web/Dockerfile
docker-compose.yml
docker-compose.prod.yml
```

Docker will allow the project to run in isolated production containers.

### Stage 4: Nginx reverse proxy

Nginx will route external traffic to internal services.

Planned routing:

```txt
ruzhen.org      → frontend
api.ruzhen.org  → backend API
```

Nginx will also handle HTTPS certificates.

### Stage 5: Production deployment

The first production deployment should be manual.

Automatic deployment should be added only after the manual deployment process is stable.

## Deployment strategy

The recommended deployment strategy is:

```txt
CI first
→ manual deployment
→ documented deployment process
→ Docker-based deployment
→ optional automatic deployment
```

This is safer than jumping directly to automatic deployment.

## Production checklist

Before production deployment:

- [ ] CI passes on GitHub
- [ ] production database is created
- [ ] production `.env` values are prepared
- [ ] Google OAuth production redirect settings are configured
- [ ] frontend production API URL is configured
- [ ] API production start command is finalized
- [ ] Prisma migrations are tested
- [ ] domain DNS records are configured
- [ ] SSL certificates are configured
- [ ] admin access is verified
- [ ] public pages are accessible
- [ ] login/register flow works
- [ ] Google login works
- [ ] API CORS settings allow production frontend domain

## Open questions

Before implementing Docker and real production deployment, the following questions must be resolved:

1. Should PostgreSQL run inside Docker or directly on the VPS?
2. Should frontend be served by Nginx as static files or by a Node process?
3. What should be the production API start command?
4. Should ingestion scripts run manually, by cron, or by a background worker?
5. Should uploaded/generated data be backed up automatically?
6. Should admin dashboard be available on the same domain or a separate subdomain?
7. What is the first acceptable MVP production version?

## Current recommendation

For the first production version, use:

```txt
ruzhen.org
→ frontend

api.ruzhen.org
→ backend API

PostgreSQL
→ production database on the VPS or managed database
```

Deployment should stay manual until the project has a stable production runtime.