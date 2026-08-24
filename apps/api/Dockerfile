FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json

RUN npm ci --workspace apps/api --include-workspace-root=false

COPY apps/api ./apps/api

WORKDIR /app/apps/api

ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ruzhen_dev?schema=public"

RUN npm run prisma:generate
RUN npm run build

EXPOSE 4000

CMD ["npm", "run", "start"]