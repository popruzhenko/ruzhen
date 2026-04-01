import { Response } from "express";
import {  addArticleToCluster, removeArticleFromCluster, listClusterArticles } from '../services/cluster-article.service';
import { AuthenticatedRequest } from "../../../shared/middleware/require-auth";

export async function addArticleToClusterHandler(req: AuthenticatedRequest, res: Response) {
    try {
        const { clusterId, articleId } = req.params as { clusterId: string; articleId: string };
        const userId = req.user?.userId as string;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        await addArticleToCluster({ clusterId, articleId, addedByUserId: userId });

        res.status(200).json({ message: 'Article added to cluster successfully' });
    } catch (error) {
        console.error('Add article to cluster error: ', error);
        res.status(400).json({
            message: error instanceof Error ? error.message : 'Failed to add article to cluster',
        });
    }
}

export async function removeArticleFromClusterHandler(req: AuthenticatedRequest, res: Response) {
    try {
        const { clusterId, articleId } = req.params as { clusterId: string; articleId: string };
        const userId = req.user?.userId as string;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        await removeArticleFromCluster(clusterId, articleId);

        res.status(200).json({ message: 'Article removed from cluster successfully' });
    } catch (error) {
        console.error('Remove article from cluster error: ', error);
        res.status(400).json({
            message: error instanceof Error ? error.message : 'Failed to remove article from cluster',
        });
    }
}

export async function listClusterArticlesHandler(req: AuthenticatedRequest, res: Response) {
    try {
        const { clusterId } = req.params as { clusterId: string };
        const articles = await listClusterArticles(clusterId);
        res.status(200).json({ articles });
    } catch (error) {
        console.error('List cluster articles error: ', error);
        res.status(400).json({
            message: error instanceof Error ? error.message : 'Failed to list cluster articles',
        });
    }   
}


