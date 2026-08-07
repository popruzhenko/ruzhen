import { Response } from 'express';
import { AuthenticatedRequest } from '../../../shared/middleware/require-auth';
import {
    createClusterBlock,
    deleteClusterBlock,
    getClusterBlockById,
    listClusterBlocks,
    updateClusterBlock,
} from '../services/cluster-block.service';

import { prisma } from '../../../shared/lib/prismaClient';
import { requireEnv } from '../../../shared/lib/requireEnv';

import { OpenAiAnalyzedNewsProvider } from '../../../core/contextualization/openAiAnalyzedNewsProvider';
import { generateAnalyzedNewsForCluster } from '../../../core/contextualization/generateAnalyzedNewsForCluster';

import { BlockType, OpinionStance } from '@prisma/client';

import { saveContextDraft } from '../services/cluster-block.service';

const openAiApiKey = requireEnv('OPENAI_API_KEY');

export async function saveContextDraftHandler(
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

        const { title, summary, blocks } = req.body;

        if (typeof title !== 'string') {
            return res.status(400).json({
                message: 'Title must be a string',
            });
        }

        if (typeof summary !== 'string') {
            return res.status(400).json({
                message: 'Summary must be a string',
            });
        }

        if (!Array.isArray(blocks)) {
            return res.status(400).json({
                message: 'Blocks must be an array',
            });
        }

        const result = await saveContextDraft({
            prisma,
            clusterId,
            createdByUserId: req.user.userId,
            title,
            summary,
            blocks: blocks.map((block) => ({
                type: block.type as BlockType,
                title: block.title ?? null,
                content: block.content ?? '',
                position: Number(block.position),
                sourceName: block.sourceName ?? null,
                sourceUrl: block.sourceUrl ?? null,
                authorName: block.authorName ?? null,
                stance: block.stance as OpinionStance | null,
            })),
        });

        return res.status(200).json({
            message: 'Context draft saved successfully',
            cluster: result.cluster,
            blocks: result.blocks,
        });
    } catch (error) {
        console.error('Save context draft error:', error);

        return res.status(400).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Failed to save context draft',
        });
    }
}

export async function generateAnalyzedNewsHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        if (!req.user) {
            return res.status(401).json({
                message: 'Unauthorized',
            });
        }

        const clusterIdParam = req.params.clusterId;

        if (
            typeof clusterIdParam !== 'string' ||
            clusterIdParam.trim().length === 0
        ) {
            return res.status(400).json({
                message: 'Cluster ID is required',
            });
        }

        const clusterId = clusterIdParam;

        const provider = new OpenAiAnalyzedNewsProvider(openAiApiKey);

        const result = await generateAnalyzedNewsForCluster({
            prisma,
            provider,
            clusterId,
            createdByUserId: req.user.userId,
            replaceExistingBlocks: true,
        });

        res.status(200).json({
            message: 'Analyzed news generated successfully',
            cluster: result.cluster,
            blocks: result.blocks,
        });
    } catch (error) {
        console.error('Generate analyzed news error:', error);

        res.status(400).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Failed to generate analyzed news',
        });
    }
}

export async function createClusterBlockHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const clusterId = req.params.clusterId;

        if (typeof clusterId !== 'string' || clusterId.trim().length === 0) {
            return res.status(400).json({
                message: 'Cluster ID is required',
            });
        }

        if (Array.isArray(clusterId)) {
            return res.status(400).json({ message: 'Invalid cluster ID' });
        }

        const {
            type,
            title,
            content,
            position,
            sourceName,
            sourceUrl,
            authorName,
            stance,
        } = req.body;

        const block = await createClusterBlock({
            clusterId,
            type,
            title,
            content,
            position,
            sourceName,
            sourceUrl,
            authorName,
            stance,
            createdByUserId: req.user.userId,
        });

        res.status(201).json({
            message: 'Cluster block created successfully',
            block,
        });
    } catch (error) {
        console.error('Create cluster block error: ', error);

        res.status(400).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Cluster block creation failed',
        });
    }
}

export async function updateClusterBlockHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        const blockId = req.params.id as string;
        const block = await updateClusterBlock(req.body, blockId);

        res.status(200).json({
            message: 'Cluster block updated successfully',
            block,
        });
    } catch (error) {
        console.error('Update cluster block error: ', error);

        res.status(400).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Cluster block update failed',
        });
    }
}

export async function deleteClusterBlockHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        const blockId = req.params.id as string;
        await deleteClusterBlock(blockId);
        res.status(200).json({
            message: 'Cluster block deleted successfully',
        });
    } catch (error) {
        console.error('Delete cluster block error: ', error);

        res.status(400).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Cluster block deletion failed',
        });
    }
}

export async function getClusterBlockByIdHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        const blockId = req.params.id as string;
        const block = await getClusterBlockById(blockId);
        res.status(200).json({
            message: 'Cluster block retrieved successfully',
            block,
        });
    } catch (error) {
        console.error('Get cluster block error: ', error);
        res.status(400).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Failed to retrieve cluster block',
        });
    }
}

export async function listClusterBlocksHandler(
    req: AuthenticatedRequest,
    res: Response,
) {
    try {
        const clusterId = req.params.clusterId as string;
        const blocks = await listClusterBlocks(clusterId);
        res.status(200).json({
            message: 'Cluster blocks retrieved successfully',
            blocks,
        });
    } catch (error) {
        console.error('List cluster blocks error: ', error);
        res.status(400).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Failed to retrieve cluster blocks',
        });
    }
}
