import { Router } from 'express';
import { listClusterArticlesHandler } from '../controllers/cluster-article.controller';

const publicClusterArticleRouter = Router();

publicClusterArticleRouter.get('/:clusterId/articles', listClusterArticlesHandler);

export default publicClusterArticleRouter;
