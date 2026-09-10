import { prisma } from '../../../shared/lib/prismaClient';
import {
    generateArticleClusterCandidates as generateSuggestions,
    listArticleClusterCandidates as listSuggestions,
    acceptArticleClusterCandidate as acceptSuggestion,
    rejectArticleClusterCandidate as rejectSuggestion,
} from '../../../core/clustering/articleClusterCandidates';

export function generateArticleClusterCandidates() {
    return generateSuggestions({ prisma });
}

export function listArticleClusterCandidates(input: {
    page?: unknown;
    limit?: unknown;
}) {
    return listSuggestions({ prisma, ...input });
}

export function acceptArticleClusterCandidate(
    candidateId: string,
    reviewedByUserId: string,
) {
    return acceptSuggestion({ prisma, candidateId, reviewedByUserId });
}

export function rejectArticleClusterCandidate(
    candidateId: string,
    reviewedByUserId: string,
) {
    return rejectSuggestion({ prisma, candidateId, reviewedByUserId });
}
