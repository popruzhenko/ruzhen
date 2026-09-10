import { Router } from 'express';
import { requireAuth } from '../../../shared/middleware/require-auth';
import { requireAdmin } from '../../../shared/middleware/require-admin';
import enrichmentArticleRouter from './enrichment-article.routes';
import { generateArticleEmbeddingsHandler } from '../controller/article.controller';
import { fetchNewArticlesHandler } from '../controller/article.controller';
import {
    listRawArticlesHandler,
    previewRawArticlesHandler,
    runRawArticlesBatchHandler,
} from '../controller/raw-article.controller';

const adminArticleRouter = Router();
adminArticleRouter.use(requireAuth, requireAdmin);
adminArticleRouter.use('/enrichment', enrichmentArticleRouter);

adminArticleRouter.get('/raw', listRawArticlesHandler);
adminArticleRouter.post('/bulk/preview', previewRawArticlesHandler);
adminArticleRouter.post('/bulk', runRawArticlesBatchHandler);

adminArticleRouter.post(
    '/generate-embeddings',
    generateArticleEmbeddingsHandler,
);
adminArticleRouter.post('/fetch-new', fetchNewArticlesHandler);

export default adminArticleRouter;
