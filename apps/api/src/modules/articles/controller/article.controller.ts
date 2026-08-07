import { Response } from 'express';
import { ArticleStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../../../shared/middleware/require-auth';
import { deleteAllArticles, getArticleById, listArticles, updateArticle } from '../services/atricle.service';
import { reviewArticleContentById } from '../../../core/ingestionNews/review/reviewArticleContent.service';
import { prisma } from '../../../shared/lib/prismaClient';
import { OpenAiEmbeddingProvider } from '../../../core/embedding/openAiEmbeddingProvider';
import { embedApprovedArticlesWithoutEmbedding } from '../../../core/embedding/embedArticle.services';
import { requireEnv } from '../../../shared/lib/requireEnv';
import { runPoliticsIngestionJob } from '../../../core/ingestionNews/runPoliticsIngestionJob';

const openAiApiKey = requireEnv('OPENAI_API_KEY');

export async function listArticlesHandler(
    req: AuthenticatedRequest,
    res: Response
) {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 9999;

        const status =
            typeof req.query.status === 'string' &&
            Object.values(ArticleStatus).includes(req.query.status as ArticleStatus)
                ? (req.query.status as ArticleStatus)
                : undefined;

        const sourceId =
            typeof req.query.sourceId === 'string' ? req.query.sourceId : undefined;

        const result = await listArticles({
            page,
            limit,
            status,
            sourceId,
        });

        res.status(200).json(result);
    } catch (error) {
        console.error('List articles error:', error);

        res.status(400).json({
            message: 'Failed to fetch articles',
        });
    }
}

export async function getArticleByIdHandler(
    req: AuthenticatedRequest,
    res: Response
) {
    try {
        const id = req.params.id;

        if (Array.isArray(id)) {
            return res.status(400).json({ message: 'Invalid article ID' });
        }

        const article = await getArticleById(id);

        res.status(200).json(article);
    } catch (error) {
        console.error('Get article by ID error:', error);

        res.status(404).json({
            message:
                error instanceof Error ? error.message : 'Failed to fetch article',
        });
    }
}

export async function deleteAllArticlesHandler(
    req: AuthenticatedRequest,
    res: Response) {
    try {
        res.status(200).json(await deleteAllArticles());
    } catch (error) {
        console.error('Delete all articles error:', error);

        res.status(400).json({
            message: 'Failed to delete articles',
        });
    }
}

export async function updateArticleHandler(
    req: AuthenticatedRequest,
    res: Response
) {
    try {
        const { id } = req.params;

        if (!id || Array.isArray(id)) {
            return res.status(400).json({
                message: 'Invalid article id',
            });
        }

        const articleData = req.body;

        const article = await updateArticle(id , articleData);

        res.status(200).json(article);
    } catch (error) {
        console.error('Update article error:', error);

        res.status(400).json({
            message: 'Failed to update article',
        });
    }
}

export async function reviewArticleContentHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        const { id } = req.params;

        if (!id || Array.isArray(id)) {
            return res.status(400).json({
                message: 'Invalid article id',
            });
        }

        const result = await reviewArticleContentById(prisma, id);

        res.status(200).json(result);
    } catch (error) {
        console.error('Review article content error:', error);

        res.status(400).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Failed to review article content',
        });
    }
}

export async function generateArticleEmbeddingsHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        const limit = Number(req.body?.limit) || 9999;

        const provider = new OpenAiEmbeddingProvider(openAiApiKey);

        const results = await embedApprovedArticlesWithoutEmbedding(
            prisma,
            provider,
            limit,
        );

        const embedded = results.filter(
            (result) => result.success && result.embedded,
        ).length;

        const skipped = results.filter(
            (result) => result.success && !result.embedded,
        ).length;

        const failed = results.filter((result) => !result.success).length;

        res.status(200).json({
            message: 'Article embeddings generated',
            embedded,
            skipped,
            failed,
            results,
        });
    } catch (error) {
        console.error('Generate article embeddings error:', error);

        res.status(400).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Failed to generate article embeddings',
        });
    }
}

let isIngestionRunning = false;

export async function fetchNewArticlesHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        if (!req.user) {
            return res.status(401).json({
                message: 'Unauthorized',
            });
        }

        if (isIngestionRunning) {
            return res.status(409).json({
                message: 'News ingestion is already running',
            });
        }

        isIngestionRunning = true;

        const result = await runPoliticsIngestionJob(prisma);

        return res.status(200).json({
            message: 'New articles fetched successfully',
            result,
        });
    } catch (error) {
        console.error('Fetch new articles error:', error);

        return res.status(400).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Failed to fetch new articles',
        });
    } finally {
        isIngestionRunning = false;
    }
}