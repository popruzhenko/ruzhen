import { Router } from 'express';
import {
    createClusterHandler,
    deleteClusterHandler,
    listClustersHandler,
    updateClusterHandler,
    createClusterFromArticlesHandler,
    updateClusterStatusHandler,
    updateClusterArticlesHandler,
    getClusterByIdHandler,
} from '../controllers/cluster.controller';
import { requireAuth } from '../../../shared/middleware/require-auth';
import { requireAdmin } from '../../../shared/middleware/require-admin';
import {
    previewClusterBulkHandler,
    executeClusterBulkHandler,
} from '../controllers/cluster-bulk.controller';
import {
    startClusterBulkJobHandler,
    listClusterBulkJobsHandler,
    getClusterBulkJobHandler,
    cancelClusterBulkJobHandler,
    retryClusterBulkJobHandler,
} from '../controllers/cluster-bulk-job.controller';

const adminClusterRouter = Router();

adminClusterRouter.post(
    '/bulk/jobs',
    requireAuth,
    requireAdmin,
    startClusterBulkJobHandler,
);
adminClusterRouter.get(
    '/bulk/jobs',
    requireAuth,
    requireAdmin,
    listClusterBulkJobsHandler,
);
adminClusterRouter.get(
    '/bulk/jobs/:jobId',
    requireAuth,
    requireAdmin,
    getClusterBulkJobHandler,
);
adminClusterRouter.post(
    '/bulk/jobs/:jobId/cancel',
    requireAuth,
    requireAdmin,
    cancelClusterBulkJobHandler,
);
adminClusterRouter.post(
    '/bulk/jobs/:jobId/retry',
    requireAuth,
    requireAdmin,
    retryClusterBulkJobHandler,
);

adminClusterRouter.post(
    '/bulk/preview',
    requireAuth,
    requireAdmin,
    previewClusterBulkHandler,
);
adminClusterRouter.post(
    '/bulk/execute',
    requireAuth,
    requireAdmin,
    executeClusterBulkHandler,
);

adminClusterRouter.post(
    '/from-articles',
    requireAuth,
    requireAdmin,
    createClusterFromArticlesHandler,
);
adminClusterRouter.post('/', requireAuth, requireAdmin, createClusterHandler);
adminClusterRouter.get('/', requireAuth, requireAdmin, listClustersHandler);
adminClusterRouter.get(
    '/:id',
    requireAuth,
    requireAdmin,
    getClusterByIdHandler,
);
adminClusterRouter.patch(
    '/:id/articles',
    requireAuth,
    requireAdmin,
    updateClusterArticlesHandler,
);
adminClusterRouter.patch(
    '/:id',
    requireAuth,
    requireAdmin,
    updateClusterHandler,
);
adminClusterRouter.patch(
    '/:clusterId/status',
    requireAuth,
    requireAdmin,
    updateClusterStatusHandler,
);
adminClusterRouter.delete(
    '/:id',
    requireAuth,
    requireAdmin,
    deleteClusterHandler,
);

export default adminClusterRouter;
