import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../../shared/middleware/require-auth';
import { prisma } from '../../../shared/lib/prismaClient';
import {
    ClusterBulkInputError,
    parseClusterBulkPreview,
    previewClusterBulk,
} from '../../../core/clusterBulk';

export async function previewClusterBulkHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        const input = parseClusterBulkPreview(req.body);
        return res.json(await previewClusterBulk({ prisma, ...input }));
    } catch (error) {
        return res
            .status(error instanceof ClusterBulkInputError ? 400 : 500)
            .json({
                message:
                    error instanceof ClusterBulkInputError
                        ? error.message
                        : 'Failed to prepare bulk cluster action.',
            });
    }
}

export async function executeClusterBulkHandler(
    _req: AuthenticatedRequest,
    res: Response,
) {
    return res.status(410).json({
        message:
            'Bulk processing now runs as a saved server job. Reload this page to view or start a job.',
    });
}
