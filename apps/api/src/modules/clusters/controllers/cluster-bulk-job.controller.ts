import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../../shared/middleware/require-auth';
import { prisma } from '../../../shared/lib/prismaClient';
import {
    cancelClusterBulkJob,
    ClusterBulkJobError,
    getClusterBulkJob,
    listClusterBulkJobs,
    parseClusterJobAction,
    parseClusterJobId,
    parseClusterJobPagination,
    parseRetryClusterJob,
    parseStartClusterJob,
    startClusterBulkJob,
} from '../../../core/clusterBulkJobs';

function fail(res: Response, cause: unknown) {
    return res
        .status(cause instanceof ClusterBulkJobError ? cause.statusCode : 500)
        .json({
            message:
                cause instanceof ClusterBulkJobError
                    ? cause.message
                    : 'Failed to access the server queue. Refresh the job status before trying again.',
        });
}

export async function startClusterBulkJobHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    try {
        return res.json(
            await startClusterBulkJob({
                prisma,
                ...parseStartClusterJob(req.body),
                createdByUserId: req.user.userId,
            }),
        );
    } catch (cause) {
        return fail(res, cause);
    }
}

export async function listClusterBulkJobsHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        if (Object.keys(req.query).some((key) => key !== 'action'))
            throw new ClusterBulkJobError('Unknown cluster job parameter.');
        const action =
            req.query.action === undefined
                ? undefined
                : parseClusterJobAction(req.query.action);
        return res.json(await listClusterBulkJobs({ prisma, action }));
    } catch (cause) {
        return fail(res, cause);
    }
}

export async function getClusterBulkJobHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        return res.json(
            await getClusterBulkJob({
                prisma,
                jobId: parseClusterJobId(req.params.jobId),
                ...parseClusterJobPagination(req.query),
            }),
        );
    } catch (cause) {
        return fail(res, cause);
    }
}

export async function cancelClusterBulkJobHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        return res.json(
            await cancelClusterBulkJob({
                prisma,
                jobId: parseClusterJobId(req.params.jobId),
            }),
        );
    } catch (cause) {
        return fail(res, cause);
    }
}

export async function retryClusterBulkJobHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    try {
        const retryOfJobId = parseClusterJobId(req.params.jobId);
        const input = parseRetryClusterJob(req.body);
        const previous = await prisma.clusterBulkJob.findUnique({
            where: { id: retryOfJobId },
            select: { action: true },
        });
        if (!previous)
            throw new ClusterBulkJobError('Cluster bulk job not found.', 404);
        return res.json(
            await startClusterBulkJob({
                prisma,
                ...input,
                action: previous.action,
                retryOfJobId,
                createdByUserId: req.user.userId,
            }),
        );
    } catch (cause) {
        return fail(res, cause);
    }
}
