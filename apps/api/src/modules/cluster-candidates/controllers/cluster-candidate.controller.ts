import { Response } from 'express';

import { AuthenticatedRequest } from '../../../shared/middleware/require-auth';

import {
    acceptClusterCandidate,
    deleteClusterCandidate,
    generateClusterCandidateGroups,
    listPendingClusterCandidates,
} from '../services/cluster-candidate.service';

export async function generateClusterCandidatesHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        if (!req.user) {
            return res.status(401).json({
                message: 'Unauthorized',
            });
        }

        const result = await generateClusterCandidateGroups();

        return res.status(201).json({
            message: 'Cluster candidates generated successfully',
            ...result,
        });
    } catch (error) {
        console.error('Generate cluster candidates error:', error);

        return res.status(400).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Failed to generate cluster candidates',
        });
    }
}

export async function listClusterCandidatesHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        if (!req.user) {
            return res.status(401).json({
                message: 'Unauthorized',
            });
        }

        const result = await listPendingClusterCandidates();

        return res.status(200).json(result);
    } catch (error) {
        console.error('List cluster candidates error:', error);

        return res.status(400).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Failed to list cluster candidates',
        });
    }
}

export async function deleteClusterCandidateHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        if (!req.user) {
            return res.status(401).json({
                message: 'Unauthorized',
            });
        }

        const candidateId = req.params.id;

        if (
            typeof candidateId !== 'string' ||
            candidateId.trim().length === 0
        ) {
            return res.status(400).json({
                message: 'Candidate ID is required',
            });
        }

        const result = await deleteClusterCandidate(candidateId);

        return res.status(200).json({
            message: 'Cluster candidate deleted successfully',
            candidate: result,
        });
    } catch (error) {
        console.error('Delete cluster candidate error:', error);

        return res.status(400).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Failed to delete cluster candidate',
        });
    }
}

export async function acceptClusterCandidateHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        if (!req.user) {
            return res.status(401).json({
                message: 'Unauthorized',
            });
        }

        const candidateId = req.params.id;

        if (
            typeof candidateId !== 'string' ||
            candidateId.trim().length === 0
        ) {
            return res.status(400).json({
                message: 'Candidate ID is required',
            });
        }

        const cluster = await acceptClusterCandidate(
            candidateId,
            req.user.userId,
        );

        return res.status(201).json({
            message: 'Cluster candidate accepted successfully',
            cluster,
        });
    } catch (error) {
        console.error('Accept cluster candidate error:', error);

        return res.status(400).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Failed to accept cluster candidate',
        });
    }
}
