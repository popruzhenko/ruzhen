import { Router } from 'express';
import { createClusterBlockHandler } from '../controllers/cluster-block.controller';
import { requireAuth } from '../../../shared/middleware/require-auth';
import { requireAdmin } from '../../../shared/middleware/require-admin';

const clusterBlockRouter = Router();

clusterBlockRouter.post('/:clusterId/blocks', requireAuth, requireAdmin, createClusterBlockHandler);

export default clusterBlockRouter;