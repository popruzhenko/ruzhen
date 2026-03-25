import { Response } from 'express';
import { AuthenticatedRequest } from '../../../shared/middleware/require-auth';
import {
    createCluster,
    deleteCluster,
    listClusters,
    updateCluster,
} from '../services/cluster.service';
import { getClusterById } from '../services/cluster.service';

export async function createClusterHandler(
    req: AuthenticatedRequest,
    res: Response
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
    res: Response
) {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 20;

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
    res: Response
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
    res: Response
) {
    try {
        const id = req.params.id;

        if (Array.isArray(id)) {
            return res.status(400).json({ message: 'Invalid cluster ID' });
        }

        const cluster = await updateCluster(id, req.body);

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
    res: Response
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
