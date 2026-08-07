import { Router } from 'express';
import { getClusterBlockByIdHandler, listClusterBlocksHandler } from '../controllers/cluster-block.controller';
const publicClusterBlockRouter = Router();

publicClusterBlockRouter.get('/blocks/:id', getClusterBlockByIdHandler);
publicClusterBlockRouter.get('/:clusterId/blocks', listClusterBlocksHandler);

export default publicClusterBlockRouter;