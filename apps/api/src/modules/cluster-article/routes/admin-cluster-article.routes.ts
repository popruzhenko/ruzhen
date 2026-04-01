import { Router } from 'express';
import { requireAuth } from '../../../shared/middleware/require-auth';
import { requireAdmin } from '../../../shared/middleware/require-admin';
import { addArticleToClusterHandler, removeArticleFromClusterHandler, } from '../controllers/cluster-article.controller';

const adminClusterArticleRouter = Router();

adminClusterArticleRouter.post('/:clusterId/articles/:articleId', requireAuth, requireAdmin, addArticleToClusterHandler);
adminClusterArticleRouter.delete('/:clusterId/articles/:articleId', requireAuth, requireAdmin, removeArticleFromClusterHandler);

export default adminClusterArticleRouter;