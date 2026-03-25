import { Router } from 'express';
import {
    getClusterByIdHandler,
    listClustersHandler,
} from '../controllers/cluster.controller';

const publicClusterRouter = Router();

publicClusterRouter.get('/', listClustersHandler);
publicClusterRouter.get('/:id', getClusterByIdHandler);

export default publicClusterRouter;
