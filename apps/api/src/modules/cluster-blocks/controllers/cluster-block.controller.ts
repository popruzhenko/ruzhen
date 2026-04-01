import { Response } from 'express';
import { AuthenticatedRequest } from '../../../shared/middleware/require-auth';
import {
    createClusterBlock,
    deleteClusterBlock,
    getClusterBlockById,
    listClusterBlocks,
    updateClusterBlock,
} from '../services/cluster-block.service';

export async function createClusterBlockHandler(
    req: AuthenticatedRequest,
    res: Response
) {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const clusterId = req.params.clusterId;

        if (Array.isArray(clusterId)) {
            return res.status(400).json({ message: 'Invalid cluster ID' });
        }

        const {
            type,
            title,
            content,
            position,
            sourceName,
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
    res: Response
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
    res: Response
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
    res: Response
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
    res: Response
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
