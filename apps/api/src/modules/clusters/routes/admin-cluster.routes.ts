import { Router } from 'express';
import {
    createClusterHandler,
    deleteClusterHandler,
    listClustersHandler,
    updateClusterHandler,
} from '../controllers/cluster.controller';
import { requireAuth } from '../../../shared/middleware/require-auth';
import { requireAdmin } from '../../../shared/middleware/require-admin';

const adminClusterRouter = Router();

adminClusterRouter.post('/', requireAuth, requireAdmin, createClusterHandler);
adminClusterRouter.get('/', requireAuth, requireAdmin, listClustersHandler);
adminClusterRouter.patch(
    '/:id',
    requireAuth,
    requireAdmin,
    updateClusterHandler
);
adminClusterRouter.delete(
    '/:id',
    requireAuth,
    requireAdmin,
    deleteClusterHandler
);

export default adminClusterRouter;
