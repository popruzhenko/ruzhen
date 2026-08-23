import { Router } from 'express';
import { requireAuth } from '../../../shared/middleware/require-auth';
import { requireAdmin } from '../../../shared/middleware/require-admin';
import { generateArticleEmbeddingsHandler } from '../controller/article.controller';
import { fetchNewArticlesHandler } from '../controller/article.controller';

const adminArticleRouter = Router();

adminArticleRouter.post(
    '/generate-embeddings',
    requireAuth,
    requireAdmin,
    generateArticleEmbeddingsHandler,
);
adminArticleRouter.post(
    '/fetch-new',
    requireAuth,
    requireAdmin,
    fetchNewArticlesHandler,
);

export default adminArticleRouter;
