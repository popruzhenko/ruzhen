import type { PrismaClient } from '@prisma/client';
import { SourceAccessMode, SourceType } from '@prisma/client';
import { POLITICS_SOURCE_CATALOG } from './sourceCatalog';

export async function syncPoliticsSources(prisma: PrismaClient) {
    const results = [];

    for (const source of POLITICS_SOURCE_CATALOG) {
        const saved = await prisma.source.upsert({
            where: {
                name_baseUrl: {
                    name: source.name,
                    baseUrl: source.baseUrl,
                },
            },
            // The catalog supplies defaults for new sources. Existing source
            // settings, including editorial activation and access hints, persist.
            update: {},
            create: {
                name: source.name,
                baseUrl: source.baseUrl,
                type:
                    source.fetchMode === 'RSS'
                        ? SourceType.RSS
                        : SourceType.SCRAPE,
                accessMode:
                    source.accessMode === 'FULL_OPEN'
                        ? SourceAccessMode.FULL_OPEN
                        : SourceAccessMode.METADATA_ONLY,
                language: source.language,
                country: source.country,
                isActive: true,
            },
        });

        results.push(saved);
    }

    return results;
}
