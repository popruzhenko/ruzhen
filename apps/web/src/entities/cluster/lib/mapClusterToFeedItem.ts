import type { ClusterApiItem, ClusterFeedItem } from '../model/types';

export function mapClusterToFeedItem(cluster: ClusterApiItem): ClusterFeedItem {
    const badges: Array<'fact' | 'context' | 'opinion'> = [];

    if (cluster._count.blocks > 0) {
        badges.push('fact', 'context', 'opinion');
    }

    return {
        id: cluster.id,
        title: cluster.title,
        summary: cluster.summary ?? 'No summary available yet.',
        country: cluster.mainCountry ?? 'Unknown',
        publishedAt: formatClusterDate(
            cluster.publishedAt ?? cluster.createdAt,
        ),
        tags: cluster.clusterTags?.map((tag) => tag.name) ?? [],
        badges,
        imageUrl: undefined,
    };
}

function formatClusterDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}
