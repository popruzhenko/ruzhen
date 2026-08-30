import { Badge } from '../../../../../ui/Badge/Badge';

import type {
    ClusterCardProps,
    ClusterCardBadgeType,
} from './TypesArticleCandidate';

import './ClusterCard.scss';

const formatSimilarity = (value: number | null | undefined): string => {
    if (typeof value !== 'number') {
        return '—';
    }

    return value.toFixed(3);
};

const getDefaultBadgeType = (
    status: string | null | undefined,
): ClusterCardBadgeType => {
    if (status === 'PUBLISHED') {
        return 'published';
    }

    if (status === 'UPDATED') {
        return 'updated';
    }

    if (status === 'ARCHIVED') {
        return 'archived';
    }

    if (status === 'CANDIDATE' || status === 'PENDING') {
        return 'candidate';
    }

    return 'draft';
};

const getDefaultBadgeLabel = (status: string | null | undefined): string => {
    if (!status) {
        return 'Draft';
    }

    if (status === 'PENDING') {
        return 'Candidate';
    }

    return status;
};

export const ClusterCard = ({
    cluster,
    isActive,
    onSelect,
}: ClusterCardProps) => {
    const badgeType = cluster.badgeType ?? getDefaultBadgeType(cluster.status);
    const badgeLabel =
        cluster.badgeLabel ?? getDefaultBadgeLabel(cluster.status);

    return (
        <button
            type="button"
            className={`cluster_card ${isActive ? 'cluster_card--active' : ''}`}
            onClick={() => onSelect(cluster.id)}
        >
            <div className="cluster_card__top">
                <Badge type={badgeType}>{badgeLabel}</Badge>

                {cluster.humanId ? (
                    <span className="cluster_card__human-id">
                        {cluster.humanId}
                    </span>
                ) : null}
            </div>

            <strong className="cluster_card__title">{cluster.title}</strong>

            {cluster.summary ? (
                <p className="cluster_card__summary">{cluster.summary}</p>
            ) : null}

            <div className="cluster_card__meta">
                <span>{cluster.articlesCount} article(s)</span>

                <span>
                    avg sim {formatSimilarity(cluster.averageSimilarity)}
                </span>
            </div>

            {typeof cluster.similarityThreshold === 'number' ||
            typeof cluster.timeWindowDays === 'number' ? (
                <div className="cluster_card__meta cluster_card__meta--secondary">
                    {typeof cluster.similarityThreshold === 'number' ? (
                        <span>
                            threshold{' '}
                            {formatSimilarity(cluster.similarityThreshold)}
                        </span>
                    ) : null}

                    {typeof cluster.timeWindowDays === 'number' ? (
                        <span>{cluster.timeWindowDays}d window</span>
                    ) : null}
                </div>
            ) : null}
        </button>
    );
};
