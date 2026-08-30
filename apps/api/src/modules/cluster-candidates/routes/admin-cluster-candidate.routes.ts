import { Router } from 'express';

import { requireAuth } from '../../../shared/middleware/require-auth';
import { requireAdmin } from '../../../shared/middleware/require-admin';

import {
    acceptClusterCandidateHandler,
    deleteClusterCandidateHandler,
    generateClusterCandidatesHandler,
    listClusterCandidatesHandler,
} from '../controllers/cluster-candidate.controller';

const adminClusterCandidateRouter = Router();

adminClusterCandidateRouter.post(
    '/generate',
    requireAuth,
    requireAdmin,
    generateClusterCandidatesHandler,
);

adminClusterCandidateRouter.get(
    '/',
    requireAuth,
    requireAdmin,
    listClusterCandidatesHandler,
);

adminClusterCandidateRouter.post(
    '/:id/accept',
    requireAuth,
    requireAdmin,
    acceptClusterCandidateHandler,
);

adminClusterCandidateRouter.delete(
    '/:id',
    requireAuth,
    requireAdmin,
    deleteClusterCandidateHandler,
);

export default adminClusterCandidateRouter;
