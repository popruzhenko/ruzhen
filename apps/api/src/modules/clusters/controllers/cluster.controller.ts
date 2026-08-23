import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../../shared/middleware/require-auth';
import {
    createCluster,
    deleteCluster,
    listClusters,
    updateCluster,
} from '../services/cluster.service';

import { prisma } from '../../../shared/lib/prismaClient';
import { getClusterById } from '../services/cluster.service';
import { createClusterFromArticles } from '../services/cluster.service';
import { ClusterStatus } from '@prisma/client';
import { updateClusterStatus } from '../services/cluster.service';
import { updateClusterArticles } from '../services/cluster.service';

import {
    getPublishedClusterByHumanId,
    listPublishedClusters,
} from '../services/cluster.service';

export async function updateClusterArticlesHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        if (!req.user) {
            return res.status(401).json({
                message: 'Unauthorized',
            });
        }

        const clusterId = req.params.id;

        if (typeof clusterId !== 'string' || clusterId.trim().length === 0) {
            return res.status(400).json({
                message: 'Cluster ID is required',
            });
        }

        const { articles } = req.body;

        if (!Array.isArray(articles)) {
            return res.status(400).json({
                message: 'Articles must be an array',
            });
        }

        const cluster = await updateClusterArticles({
            prisma,
            clusterId,
            addedByUserId: req.user.userId,
            articles: articles.map((article) => ({
                articleId: String(article.articleId),
                confidence:
                    typeof article.confidence === 'number'
                        ? article.confidence
                        : null,
                isPrimary: Boolean(article.isPrimary),
            })),
        });

        return res.status(200).json({
            message: 'Cluster articles updated successfully',
            cluster,
        });
    } catch (error) {
        console.error('Update cluster articles error:', error);

        return res.status(400).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Failed to update cluster articles',
        });
    }
}

export async function createClusterHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const { title, summary, mainCountry, startDate } = req.body;

        const cluster = await createCluster({
            title,
            summary,
            mainCountry,
            startDate,
            createdByUserId: req.user.userId,
        });

        res.status(201).json({
            message: 'Cluster created successfully',
            cluster,
        });
    } catch (error) {
        console.error('Create cluster error: ', error);

        res.status(400).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Cluster creation failed',
        });
    }
}

export async function listClustersHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);

        const requestedLimit = Number(req.query.limit) || 20;
        const limit = Math.min(Math.max(requestedLimit, 1), 1500);

        const result = await listClusters({
            page,
            limit,
        });

        res.status(200).json(result);
    } catch (error) {
        console.error('List clusters error:', error);

        res.status(400).json({
            message: 'Failed to fetch clusters',
        });
    }
}

export async function getClusterByIdHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        const id = req.params.id;

        if (Array.isArray(id)) {
            return res.status(400).json({ message: 'Invalid cluster ID' });
        }

        const cluster = await getClusterById(id);

        if (!cluster) {
            return res.status(404).json({ message: 'Cluster not found' });
        }

        res.status(200).json(cluster);
    } catch (error) {
        console.error('Get cluster by ID error:', error);

        res.status(400).json({
            message: 'Failed to fetch cluster',
        });
    }
}

export async function updateClusterHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        const blockId = req.params.id;

        if (Array.isArray(blockId)) {
            return res.status(400).json({ message: 'Invalid cluster ID' });
        }

        const cluster = await updateCluster(blockId, req.body);

        res.status(200).json(cluster);
    } catch (error) {
        console.error('Update cluster error:', error);

        res.status(400).json({
            message: 'Failed to update cluster',
        });
    }
}

export async function deleteClusterHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        const id = req.params.id;

        if (Array.isArray(id)) {
            return res.status(400).json({ message: 'Invalid cluster ID' });
        }

        const cluster = await deleteCluster(id);

        res.status(200).json(cluster);
    } catch (error) {
        console.error('Delete cluster error:', error);

        res.status(400).json({
            message: 'Failed to delete cluster',
        });
    }
}

export async function createClusterFromArticlesHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const { articleIds, title, summary, mainCountry, startDate } = req.body;

        const cluster = await createClusterFromArticles({
            articleIds,
            title,
            summary,
            mainCountry,
            startDate,
            createdByUserId: req.user.userId,
        });

        res.status(201).json({
            message: 'Cluster created from articles successfully',
            cluster,
        });
    } catch (error) {
        console.error('Create cluster from articles error:', error);

        res.status(400).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Cluster creation from articles failed',
        });
    }
}

const isClusterStatus = (value: unknown): value is ClusterStatus => {
    return Object.values(ClusterStatus).includes(value as ClusterStatus);
};

export async function updateClusterStatusHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        if (!req.user) {
            return res.status(401).json({
                message: 'Unauthorized',
            });
        }

        const clusterId = req.params.clusterId;

        if (typeof clusterId !== 'string' || clusterId.trim().length === 0) {
            return res.status(400).json({
                message: 'Cluster ID is required',
            });
        }

        const { status } = req.body;

        if (!isClusterStatus(status)) {
            return res.status(400).json({
                message: 'Invalid cluster status',
            });
        }

        const cluster = await updateClusterStatus(clusterId, status);

        return res.status(200).json({
            message: 'Cluster status updated successfully',
            cluster,
        });
    } catch (error) {
        console.error('Update cluster status error:', error);

        return res.status(400).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Failed to update cluster status',
        });
    }
}

export async function listPublishedClustersHandler(
    req: Request,
    res: Response,
) {
    try {
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 10);

        const result = await listPublishedClusters({
            page,
            limit,
        });

        return res.status(200).json(result);
    } catch (error) {
        console.error('List published clusters error:', error);

        return res.status(400).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Failed to list published clusters',
        });
    }
}

export async function getPublishedClusterByHumanIdHandler(
    req: Request,
    res: Response,
) {
    try {
        const humanId = req.params.humanId;

        if (typeof humanId !== 'string' || humanId.trim().length === 0) {
            return res.status(400).json({
                message: 'Cluster humanId is required',
            });
        }

        const cluster = await getPublishedClusterByHumanId(humanId);

        return res.status(200).json({
            cluster,
        });
    } catch (error) {
        console.error('Get published cluster error:', error);

        return res.status(404).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Published cluster not found',
        });
    }
}
