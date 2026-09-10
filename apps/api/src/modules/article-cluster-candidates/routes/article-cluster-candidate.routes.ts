import { Router } from 'express';
import { requireAuth } from '../../../shared/middleware/require-auth';
import { requireAdmin } from '../../../shared/middleware/require-admin';
import {
    generateArticleClusterCandidatesHandler,
    listArticleClusterCandidatesHandler,
    acceptArticleClusterCandidateHandler,
    rejectArticleClusterCandidateHandler,
} from '../controllers/article-cluster-candidate.controller';

const articleClusterCandidateRouter = Router();
articleClusterCandidateRouter.use(requireAuth, requireAdmin);
articleClusterCandidateRouter.get('/', listArticleClusterCandidatesHandler);
articleClusterCandidateRouter.post(
    '/generate',
    generateArticleClusterCandidatesHandler,
);
articleClusterCandidateRouter.post(
    '/:id/accept',
    acceptArticleClusterCandidateHandler,
);
articleClusterCandidateRouter.post(
    '/:id/reject',
    rejectArticleClusterCandidateHandler,
);

export default articleClusterCandidateRouter;
