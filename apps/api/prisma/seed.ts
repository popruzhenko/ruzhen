import 'dotenv/config';
import { PrismaClient, SourceType, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    const adminEmail = 'admin@ruzhen.local';
    const adminPassword = 'admin123';

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

    await prisma.source.upsert({
        where: {
            name_baseUrl: {
                name: 'BBC',
                baseUrl: 'https://www.bbc.com',
            },
        },
        update: {},
        create: {
            name: 'BBC',
            baseUrl: 'https://www.bbc.com',
            type: SourceType.RSS,
            language: 'en',
            country: 'UK',
            isActive: true,
        },
    });

    await prisma.source.upsert({
        where: {
            name_baseUrl: {
                name: 'Reuters',
                baseUrl: 'https://www.reuters.com',
            },
        },
        update: {},
        create: {
            name: 'Reuters',
            baseUrl: 'https://www.reuters.com',
            type: SourceType.RSS,
            language: 'en',
            country: 'Global',
            isActive: true,
        },
    });

    await prisma.source.upsert({
        where: {
            name_baseUrl: {
                name: 'Politico',
                baseUrl: 'https://www.politico.com',
            },
        },
        update: {},
        create: {
            name: 'Politico',
            baseUrl: 'https://www.politico.com',
            type: SourceType.RSS,
            language: 'en',
            country: 'US',
            isActive: true,
        },
    });

    const tags = [
        'Politics',
        'Economy',
        'Technology',
        'Health',
        'Sports',
        'Entertainment',
        'War',
        'Europe',
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
}

main()
    .catch((e) => {
        console.error('Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
