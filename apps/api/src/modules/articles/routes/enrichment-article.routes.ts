import { Router } from 'express';
import {
    startEnrichmentJobHandler,
    listEnrichmentJobsHandler,
    getEnrichmentJobHandler,
    stopEnrichmentJobHandler,
    retryEnrichmentJobHandler,
    getEnrichmentProposalHandler,
    applyEnrichmentProposalHandler,
    dismissEnrichmentProposalHandler,
    listArticleVersionsHandler,
    restoreArticleVersionHandler,
} from '../controller/enrichment-article.controller';

// Mounted after the admin article router's authentication and role checks.
const router = Router();
router.post('/jobs', startEnrichmentJobHandler);
router.get('/jobs', listEnrichmentJobsHandler);
router.get('/jobs/:jobId', getEnrichmentJobHandler);
router.post('/jobs/:jobId/stop', stopEnrichmentJobHandler);
router.post('/jobs/:jobId/retry-errors', retryEnrichmentJobHandler);
router.get('/items/:itemId/proposal', getEnrichmentProposalHandler);
router.post('/items/:itemId/apply', applyEnrichmentProposalHandler);
router.post('/items/:itemId/dismiss', dismissEnrichmentProposalHandler);
router.get('/articles/:articleId/versions', listArticleVersionsHandler);
router.post('/versions/:versionId/restore', restoreArticleVersionHandler);
export default router;
