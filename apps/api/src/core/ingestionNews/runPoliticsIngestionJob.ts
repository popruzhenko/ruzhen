import type { PrismaClient } from '@prisma/client';
import { syncPoliticsSources } from './parse/syncSources';
import { runParseForSource } from './parse/runParseForSource';
import { enrichLatestArticles } from './enrich/enrichArticle.services';

export interface PoliticsIngestionSourceResult {
    success: boolean;
    sourceId: string;
    sourceName: string;
    fetchedItems: number;
    created: number;
    updated: number;
    skippedDuplicates: number;
    skippedInvalid: number;
    error?: string;
}

export interface PoliticsIngestionResult {
    parseResults: PoliticsIngestionSourceResult[];
    enrichResults: unknown;
}

export async function runPoliticsIngestionJob(
    prisma: PrismaClient,
): Promise<PoliticsIngestionResult> {
    await syncPoliticsSources(prisma);

    const sources = await prisma.source.findMany({
        where: {
            isActive: true,
        },
        orderBy: {
            name: 'asc',
        },
    });

    const parseResults: PoliticsIngestionSourceResult[] = [];

    for (const dbSource of sources) {
        const fetchMode = dbSource.type === 'RSS' ? 'RSS' : 'SECTION_HTML';

        try {
            const result = await runParseForSource(prisma, {
                id: dbSource.id,
                name: dbSource.name,
                baseUrl: dbSource.baseUrl,
                language: dbSource.language,
                country: dbSource.country,
                fetchMode,
                accessMode:
                    dbSource.accessMode === 'FULL_OPEN'
                        ? 'FULL_OPEN'
                        : 'METADATA_ONLY',
                politicsOnly: true,
            });

            parseResults.push({
                success: true,
                ...result,
            });
        } catch (error) {
            parseResults.push({
                success: false,
                sourceId: dbSource.id,
                sourceName: dbSource.name,
                fetchedItems: 0,
                created: 0,
                updated: 0,
                skippedDuplicates: 0,
                skippedInvalid: 0,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    const enrichResults = await enrichLatestArticles(prisma, 50);

    return {
        parseResults,
        enrichResults,
    };
}