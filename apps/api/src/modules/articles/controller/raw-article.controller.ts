import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../../shared/middleware/require-auth';
import { prisma } from '../../../shared/lib/prismaClient';
import {
    listRawArticles,
    parseRawArticlesListQuery,
    parseRawArticlesBatch,
    parseRawArticlesPreview,
    previewRawArticles,
    runRawArticlesBatch,
} from '../../../core/rawArticles';

export async function listRawArticlesHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    let input;
    try {
        input = parseRawArticlesListQuery(req.query);
    } catch (error) {
        return res.status(400).json({ message: (error as Error).message });
    }
    try {
        return res.json(await listRawArticles({ prisma, ...input }));
    } catch (error) {
        console.error('List raw articles error:', error);
        return res
            .status(500)
            .json({ message: 'Failed to load raw articles.' });
    }
}

export async function previewRawArticlesHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    let input;
    try {
        input = parseRawArticlesPreview(req.body);
    } catch (error) {
        return res.status(400).json({ message: (error as Error).message });
    }
    try {
        return res.json(await previewRawArticles({ prisma, input }));
    } catch (error) {
        console.error('Preview raw articles error:', error);
        return res
            .status(500)
            .json({ message: 'Failed to prepare bulk action.' });
    }
}

export async function runRawArticlesBatchHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    let input;
    try {
        input = parseRawArticlesBatch(req.body);
    } catch (error) {
        return res.status(400).json({ message: (error as Error).message });
    }
    try {
        return res.json(await runRawArticlesBatch({ prisma, input }));
    } catch (error) {
        console.error('Run raw articles batch error:', error);
        return res
            .status(500)
            .json({ message: 'Failed to process bulk action.' });
    }
}
