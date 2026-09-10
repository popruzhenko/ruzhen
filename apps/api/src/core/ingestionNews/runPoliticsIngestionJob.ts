import { randomUUID } from 'node:crypto';
import type { EnrichmentJobStatus, PrismaClient } from '@prisma/client';
import { syncPoliticsSources } from './parse/syncSources';
import { runParseForSource } from './parse/runParseForSource';
import type { AutomaticEnrichmentContext } from '../enrichmentJobs/automaticEnrichment';

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
    enrichment: {
        jobId: string | null;
        total: number;
        status: EnrichmentJobStatus | null;
    };
}

interface IngestionDependencies {
    syncSources?: typeof syncPoliticsSources;
    parseSource?: typeof runParseForSource;
}

export async function runPoliticsIngestionJob(
    prisma: PrismaClient,
    options: { createdByUserId: string },
    dependencies: IngestionDependencies = {},
): Promise<PoliticsIngestionResult> {
    const actorId = options.createdByUserId.trim();
    if (!actorId)
        throw new Error(
            'An administrator is required to start article ingestion.',
        );
    const actor = await prisma.user.findUnique({
        where: { id: actorId },
        select: { role: true },
    });
    if (actor?.role !== 'ADMIN')
        throw new Error(
            'Article ingestion requires an existing administrator.',
        );
    const automaticEnrichment: AutomaticEnrichmentContext = {
        jobId: randomUUID(),
        createdByUserId: actorId,
    };
    await (dependencies.syncSources ?? syncPoliticsSources)(prisma);

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
            const result = await (
                dependencies.parseSource ?? runParseForSource
            )(
                prisma,
                {
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
                },
                automaticEnrichment,
            );

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

    // Articles enter the durable queue in their own save transactions. Fetch
    // waits only for source parsing; the API worker owns all article retrieval.
    const job = await prisma.enrichmentJob.findUnique({
        where: { id: automaticEnrichment.jobId },
        select: { id: true, total: true, status: true },
    });

    return {
        parseResults,
        enrichment: {
            jobId: job?.id ?? null,
            total: job?.total ?? 0,
            status: job?.status ?? null,
        },
    };
}
