import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { runPoliticsIngestionJob } from '../runPoliticsIngestionJob';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL is not defined');
}

async function main() {
    const actorId = process.env.INGESTION_ACTOR_USER_ID?.trim();
    if (!actorId)
        throw new Error(
            'Set INGESTION_ACTOR_USER_ID to an existing administrator ID before running parse:politics.',
        );
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    try {
        const result = await runPoliticsIngestionJob(prisma, {
            createdByUserId: actorId,
        });

        console.log(JSON.stringify(result, null, 2));
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
