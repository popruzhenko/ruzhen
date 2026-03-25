import { Response } from 'express';
import { AuthenticatedRequest } from '../../../shared/middleware/require-auth';
import { createClusterBlock } from '../services/cluster-block.service';

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

        const { type, title, content, position, sourceName, authorName, stance } = req.body;

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
            message: error instanceof Error ? error.message : 'Cluster block creation failed',
        });
    }
}