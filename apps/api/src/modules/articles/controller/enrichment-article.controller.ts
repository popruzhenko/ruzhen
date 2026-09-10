import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../../shared/middleware/require-auth';
import { prisma } from '../../../shared/lib/prismaClient';
import {
    EnrichmentError,
    parseEnrichmentJobRequest,
    parseEnrichmentPagination,
    parseEnrichmentExpectedVersion,
    startEnrichmentJob,
    listEnrichmentJobs,
    getEnrichmentJob,
    stopEnrichmentJob,
    retryEnrichmentJobErrors,
    getEnrichmentProposal,
    applyEnrichmentProposal,
    dismissEnrichmentProposal,
    listArticleContentVersions,
    restoreArticleContentVersion,
} from '../../../core/enrichmentJobs';

function routeId(req: AuthenticatedRequest, key: string): string {
    const id = req.params[key];
    if (typeof id !== 'string' || !id.trim())
        throw new EnrichmentError('Invalid record ID.');
    return id;
}

function parse<T>(read: () => T): T {
    try {
        return read();
    } catch (error) {
        throw new EnrichmentError(
            error instanceof Error ? error.message : 'Invalid request.',
        );
    }
}

function handler(
    run: (req: AuthenticatedRequest) => Promise<unknown>,
    status = 200,
) {
    return async (req: AuthenticatedRequest, res: Response) => {
        try {
            if (!req.user)
                return res.status(401).json({ message: 'Unauthorized' });
            return res.status(status).json(await run(req));
        } catch (error) {
            if (error instanceof EnrichmentError)
                return res
                    .status(error.statusCode)
                    .json({ message: error.message });
            console.error('Article enrichment error:', error);
            return res.status(500).json({
                message: 'The enrichment request could not be completed.',
            });
        }
    };
}

export const startEnrichmentJobHandler = handler(
    (req) =>
        startEnrichmentJob({
            prisma,
            ...parse(() => parseEnrichmentJobRequest(req.body)),
            createdByUserId: req.user!.userId,
        }),
    201,
);
export const listEnrichmentJobsHandler = handler((req) =>
    listEnrichmentJobs({
        prisma,
        limit: parse(() => parseEnrichmentPagination(req.query)).limit,
    }),
);
export const getEnrichmentJobHandler = handler((req) =>
    getEnrichmentJob({
        prisma,
        jobId: routeId(req, 'jobId'),
        ...parse(() => parseEnrichmentPagination(req.query)),
    }),
);
export const stopEnrichmentJobHandler = handler((req) =>
    stopEnrichmentJob({
        prisma,
        jobId: routeId(req, 'jobId'),
    }),
);
export const retryEnrichmentJobHandler = handler((req) =>
    retryEnrichmentJobErrors({
        prisma,
        jobId: routeId(req, 'jobId'),
    }),
);
export const getEnrichmentProposalHandler = handler((req) =>
    getEnrichmentProposal({
        prisma,
        itemId: routeId(req, 'itemId'),
    }),
);
export const applyEnrichmentProposalHandler = handler((req) =>
    applyEnrichmentProposal({
        prisma,
        itemId: routeId(req, 'itemId'),
        actorUserId: req.user!.userId,
        expectedUpdatedAt: parse(() =>
            parseEnrichmentExpectedVersion(req.body),
        ),
    }),
);
export const dismissEnrichmentProposalHandler = handler((req) =>
    dismissEnrichmentProposal({
        prisma,
        itemId: routeId(req, 'itemId'),
    }),
);
export const listArticleVersionsHandler = handler((req) =>
    listArticleContentVersions({
        prisma,
        articleId: routeId(req, 'articleId'),
    }),
);
export const restoreArticleVersionHandler = handler((req) =>
    restoreArticleContentVersion({
        prisma,
        versionId: routeId(req, 'versionId'),
        actorUserId: req.user!.userId,
        expectedUpdatedAt: parse(() =>
            parseEnrichmentExpectedVersion(req.body),
        ),
    }),
);
