import { Router } from 'express';
import {
    saveContextDraftHandler,
    generateAnalyzedNewsHandler,
    createClusterBlockHandler,
    updateClusterBlockHandler,
    deleteClusterBlockHandler,
    getClusterBlockByIdHandler,
    listClusterBlocksHandler,
} from '../controllers/cluster-block.controller';
import { requireAuth } from '../../../shared/middleware/require-auth';
import { requireAdmin } from '../../../shared/middleware/require-admin';

const adminClusterBlockRouter = Router();

adminClusterBlockRouter.post(
    '/:clusterId/blocks',
    requireAuth,
    requireAdmin,
    createClusterBlockHandler,
);
adminClusterBlockRouter.patch(
    '/blocks/:id',
    requireAuth,
    requireAdmin,
    updateClusterBlockHandler,
);
adminClusterBlockRouter.delete(
    '/blocks/:id',
    requireAuth,
    requireAdmin,
    deleteClusterBlockHandler,
);
adminClusterBlockRouter.get(
    '/blocks/:id',
    requireAuth,
    requireAdmin,
    getClusterBlockByIdHandler,
);
adminClusterBlockRouter.get(
    '/:clusterId/blocks',
    requireAuth,
    requireAdmin,
    listClusterBlocksHandler,
);
adminClusterBlockRouter.post(
    '/:clusterId/generate-analyzed-news',
    requireAuth,
    requireAdmin,
    generateAnalyzedNewsHandler,
);
adminClusterBlockRouter.patch(
    '/:clusterId/context-draft',
    requireAuth,
    requireAdmin,
    saveContextDraftHandler,
);

export default adminClusterBlockRouter;
