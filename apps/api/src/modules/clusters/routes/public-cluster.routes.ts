import { Router } from 'express';
import {
    getPublishedClusterByHumanIdHandler,
    listPublishedClustersHandler
} from '../controllers/cluster.controller';

const publicClusterRouter = Router();

publicClusterRouter.get('/', listPublishedClustersHandler);
publicClusterRouter.get('/:humanId', getPublishedClusterByHumanIdHandler);

export default publicClusterRouter;
