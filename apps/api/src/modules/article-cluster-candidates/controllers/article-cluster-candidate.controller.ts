import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../../shared/middleware/require-auth';
import { ArticleClusterCandidateError } from '../../../core/clustering/articleClusterCandidates';
import {
    generateArticleClusterCandidates,
    listArticleClusterCandidates,
    acceptArticleClusterCandidate,
    rejectArticleClusterCandidate,
} from '../services/article-cluster-candidate.service';

function sendError(res: Response, error: unknown, fallback: string) {
    if (error instanceof ArticleClusterCandidateError) {
        return res.status(error.statusCode).json({ message: error.message });
    }
    console.error(fallback, error);
    return res.status(500).json({ message: fallback });
}

function readReviewInput(req: AuthenticatedRequest) {
    const candidateId = req.params.id;
    if (typeof candidateId !== 'string' || !candidateId.trim()) {
        throw new ArticleClusterCandidateError('Candidate ID is required', 400);
    }
    if (!req.user) {
        throw new ArticleClusterCandidateError('Unauthorized', 401);
    }
    return { candidateId, reviewedByUserId: req.user.userId };
}

export async function generateArticleClusterCandidatesHandler(
    _req: AuthenticatedRequest,
    res: Response,
) {
    try {
        const result = await generateArticleClusterCandidates();
        return res.status(201).json({
            message: 'Article suggestions generated successfully',
            ...result,
        });
    } catch (error) {
        return sendError(res, error, 'Failed to generate article suggestions');
    }
}

export async function listArticleClusterCandidatesHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        const result = await listArticleClusterCandidates({
            page: req.query.page,
            limit: req.query.limit,
        });
        return res.status(200).json(result);
    } catch (error) {
        return sendError(res, error, 'Failed to load article suggestions');
    }
}

export async function acceptArticleClusterCandidateHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        const { candidateId, reviewedByUserId } = readReviewInput(req);
        const cluster = await acceptArticleClusterCandidate(
            candidateId,
            reviewedByUserId,
        );
        return res.status(200).json({
            message: 'Article added to the existing cluster',
            cluster,
        });
    } catch (error) {
        return sendError(res, error, 'Failed to accept article suggestion');
    }
}

export async function rejectArticleClusterCandidateHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        const { candidateId, reviewedByUserId } = readReviewInput(req);
        const candidate = await rejectArticleClusterCandidate(
            candidateId,
            reviewedByUserId,
        );
        return res.status(200).json({
            message: 'Article suggestion rejected',
            candidate,
        });
    } catch (error) {
        return sendError(res, error, 'Failed to reject article suggestion');
    }
}
