import { Router } from 'express';
import {
    createClusterHandler,
    deleteClusterHandler,
    listClustersHandler,
    updateClusterHandler,
    createClusterFromArticlesHandler,
    updateClusterStatusHandler,
    updateClusterArticlesHandler,
    getClusterByIdHandler
} from '../controllers/cluster.controller';
import { requireAuth } from '../../../shared/middleware/require-auth';
import { requireAdmin } from '../../../shared/middleware/require-admin';

const adminClusterRouter = Router();

adminClusterRouter.post('/from-articles', requireAuth, requireAdmin, createClusterFromArticlesHandler);
adminClusterRouter.post('/', requireAuth, requireAdmin, createClusterHandler);
adminClusterRouter.get('/', requireAuth, requireAdmin, listClustersHandler);
adminClusterRouter.get('/:id', requireAuth, requireAdmin, getClusterByIdHandler);
adminClusterRouter.patch('/:id/articles', requireAuth, requireAdmin, updateClusterArticlesHandler);
adminClusterRouter.patch('/:id', requireAuth, requireAdmin, updateClusterHandler);
adminClusterRouter.patch('/:clusterId/status', requireAuth, requireAdmin, updateClusterStatusHandler);
adminClusterRouter.delete('/:id', requireAuth, requireAdmin, deleteClusterHandler);


export default adminClusterRouter;
