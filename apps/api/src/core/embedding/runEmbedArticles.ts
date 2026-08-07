import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OpenAiEmbeddingProvider } from './openAiEmbeddingProvider';
import { requireEnv } from '../../shared/lib/requireEnv';
import { embedApprovedArticlesWithoutEmbedding } from './embedArticle.services';

const connectionString = requireEnv('DATABASE_URL');
const openAiApiKey = requireEnv('OPENAI_API_KEY');

if (!connectionString) {
  throw new Error('DATABASE_URL is not defined');
}

if (!openAiApiKey) {
  throw new Error('OPENAI_API_KEY is not defined');
}

async function main() {
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const provider = new OpenAiEmbeddingProvider(openAiApiKey);

    const results = await embedApprovedArticlesWithoutEmbedding(prisma, provider);

    console.log(JSON.stringify(results, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});