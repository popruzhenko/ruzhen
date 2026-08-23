import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { enrichLatestArticles } from './enrichArticle.services';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL is not defined');
}

async function main() {
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    try {
        const results = await enrichLatestArticles(prisma);

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
