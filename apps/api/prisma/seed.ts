import 'dotenv/config';
import {
  PrismaClient,
  SourceAccessMode,
  SourceType,
  UserRole,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not defined');
}

const pool = new Pool({
  connectionString,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const adminEmail = 'admin@ruzhen.local';
  const adminPassword = 'RuzhenLocalAdmin_2026!dev';

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  const sources = [
    {
      name: 'AP Politics',
      baseUrl: 'https://apnews.com/politics',
      type: SourceType.SCRAPE,
      accessMode: SourceAccessMode.FULL_OPEN,
      language: 'en',
      country: 'US',
      isActive: true,
    },
    {
      name: 'AP Government and Politics',
      baseUrl: 'https://apnews.com/hub/government-and-politics',
      type: SourceType.SCRAPE,
      accessMode: SourceAccessMode.FULL_OPEN,
      language: 'en',
      country: 'US',
      isActive: true,
    },
    {
      name: 'PBS NewsHour Politics',
      baseUrl: 'https://www.pbs.org/newshour/politics',
      type: SourceType.SCRAPE,
      accessMode: SourceAccessMode.FULL_OPEN,
      language: 'en',
      country: 'US',
      isActive: true,
    },
    {
      name: 'ProPublica Politics',
      baseUrl: 'https://www.propublica.org/topics/politics',
      type: SourceType.SCRAPE,
      accessMode: SourceAccessMode.FULL_OPEN,
      language: 'en',
      country: 'US',
      isActive: true,
    },
    {
      name: 'BBC News Politics',
      baseUrl: 'https://feeds.bbci.co.uk/news/politics/rss.xml',
      type: SourceType.RSS,
      accessMode: SourceAccessMode.FULL_OPEN,
      language: 'en',
      country: 'GB',
      isActive: true,
    },
    {
      name: 'Al Jazeera News',
      baseUrl: 'https://www.aljazeera.com/news/',
      type: SourceType.SCRAPE,
      accessMode: SourceAccessMode.FULL_OPEN,
      language: 'en',
      country: 'QA',
      isActive: true,
    },

    {
      name: 'The New York Times Politics',
      baseUrl: 'https://www.nytimes.com/section/politics',
      type: SourceType.SCRAPE,
      accessMode: SourceAccessMode.METADATA_ONLY,
      language: 'en',
      country: 'US',
      isActive: true,
    },
    {
      name: 'Reuters World',
      baseUrl: 'https://www.reuters.com/world/',
      type: SourceType.SCRAPE,
      accessMode: SourceAccessMode.METADATA_ONLY,
      language: 'en',
      country: 'GB',
      isActive: true,
    },
    {
      name: 'Bloomberg Politics',
      baseUrl: 'https://www.bloomberg.com/politics',
      type: SourceType.SCRAPE,
      accessMode: SourceAccessMode.METADATA_ONLY,
      language: 'en',
      country: 'US',
      isActive: true,
    },
    {
      name: 'WSJ Politics',
      baseUrl: 'https://www.wsj.com/politics',
      type: SourceType.SCRAPE,
      accessMode: SourceAccessMode.METADATA_ONLY,
      language: 'en',
      country: 'US',
      isActive: true,
    },
    {
      name: 'Financial Times World',
      baseUrl: 'https://www.ft.com/world',
      type: SourceType.SCRAPE,
      accessMode: SourceAccessMode.METADATA_ONLY,
      language: 'en',
      country: 'GB',
      isActive: true,
    },
  ];

  await prisma.source.updateMany({
    data: {
      isActive: false,
    },
  });

  for (const source of sources) {
    await prisma.source.upsert({
      where: {
        name_baseUrl: {
          name: source.name,
          baseUrl: source.baseUrl,
        },
      },
      update: {
        type: source.type,
        accessMode: source.accessMode,
        language: source.language,
        country: source.country,
        isActive: source.isActive,
      },
      create: source,
    });
  }

  const tags = [
    'Politics',
    'Geopolitics',
    'Elections',
    'Government',
    'Diplomacy',
    'War',
    'Sanctions',
    'Europe',
    'US',
    'Middle East',
    'International Relations',
    'Institutions',
    'Corruption',
    'Public Policy',
    'Democracy',
  ];

  for (const tagName of tags) {
    await prisma.tag.upsert({
      where: { name: tagName },
      update: {},
      create: { name: tagName },
    });
  }

  console.log('Seed complete successfully.');
  console.log(`Admin: ${adminEmail}`);
  console.log(`Password: ${adminPassword}`);
  console.log(`Sources upserted: ${sources.length}`);
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