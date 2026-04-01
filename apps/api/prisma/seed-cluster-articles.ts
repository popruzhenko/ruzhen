import 'dotenv/config';
import { ArticleStatus, PrismaClient, SourceType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not defined');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const source = await prisma.source.upsert({
    where: {
      name_baseUrl: {
        name: 'Reuters',
        baseUrl: 'https://www.reuters.com',
      },
    },
    update: {
      isActive: true,
      language: 'en',
      country: 'US',
    },
    create: {
      name: 'Reuters',
      type: SourceType.RSS,
      baseUrl: 'https://www.reuters.com',
      language: 'en',
      country: 'US',
      isActive: true,
    },
  });

  const articles = [
    {
      url: 'https://www.reuters.com/world/test-eth-market-drop-001',
      title: 'Ethereum falls as market sentiment weakens',
      summary: 'Ethereum declined during a broader crypto market pullback.',
      content:
        'Ethereum declined as traders reacted to weaker market sentiment and reduced short-term risk appetite across digital assets.',
      publishedAt: new Date('2026-03-29T08:00:00.000Z'),
      language: 'en',
      country: 'US',
      status: ArticleStatus.NEW,
    },
    {
      url: 'https://www.reuters.com/world/test-eth-analysis-002',
      title: 'Analysts discuss reasons behind Ethereum correction',
      summary: 'Market analysts reviewed the drivers behind the latest Ethereum correction.',
      content:
        'Analysts pointed to macro uncertainty, profit taking, and lower liquidity as major factors behind the recent Ethereum correction.',
      publishedAt: new Date('2026-03-29T09:30:00.000Z'),
      language: 'en',
      country: 'US',
      status: ArticleStatus.NEW,
    },
    {
      url: 'https://www.reuters.com/world/test-eth-recovery-003',
      title: 'Some traders expect Ethereum recovery after sharp decline',
      summary: 'A number of traders believe the recent decline may be temporary.',
      content:
        'Some traders argued that the recent selloff could be temporary and that Ethereum may recover if broader market pressure eases.',
      publishedAt: new Date('2026-03-29T11:00:00.000Z'),
      language: 'en',
      country: 'US',
      status: ArticleStatus.NEW,
    },
  ];

  for (const article of articles) {
    await prisma.article.upsert({
      where: {
        url: article.url,
      },
      update: {
        title: article.title,
        summary: article.summary,
        content: article.content,
        publishedAt: article.publishedAt,
        language: article.language,
        country: article.country,
        status: article.status,
        sourceId: source.id,
      },
      create: {
        sourceId: source.id,
        url: article.url,
        title: article.title,
        summary: article.summary,
        content: article.content,
        publishedAt: article.publishedAt,
        language: article.language,
        country: article.country,
        status: article.status,
      },
    });
  }

  const createdArticles = await prisma.article.findMany({
    where: {
      sourceId: source.id,
      url: {
        in: articles.map((article) => article.url),
      },
    },
    select: {
      id: true,
      title: true,
      url: true,
    },
    orderBy: {
      publishedAt: 'asc',
    },
  });

  console.log('Seed completed successfully.');
  console.log('Source:');
  console.log({
    id: source.id,
    name: source.name,
    baseUrl: source.baseUrl,
  });

  console.log('Articles:');
  for (const article of createdArticles) {
    console.log(article);
  }
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });