import { Router } from 'express';
import {
    createClusterHandler,
    getClusterByIdHandler,
    listClustersHandler,
} from '../controllers/cluster.controller';
import { requireAuth } from '../../../shared/middleware/require-auth';
import { requireAdmin } from '../../../shared/middleware/require-admin';
import {} from '../controllers/cluster.controller';

const clusterRouter = Router();

// clusterRouter.post("/", requireAuth, requireAdmin, createClusterHandler);

export default clusterRouter;
