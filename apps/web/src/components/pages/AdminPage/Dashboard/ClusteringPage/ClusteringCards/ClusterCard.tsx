import type { ClusterCardProps } from './TypesArticleCandidate';
import './ClusterCard.scss';

export const ClusterCard = ({
    cluster,
    isActive,
    onSelect,
}: ClusterCardProps) => {
    return (
        <button
            type="button"
            className={`cluster_card ${isActive ? 'cluster_card--active' : ''}`}
            onClick={() => onSelect(cluster.id)}
        >
            <span className="cluster_card__id">ID: {cluster.id}</span>

            <strong className="cluster_card__title">{cluster.title}</strong>

            <small className="cluster_card__meta">
                {cluster.articlesCount} articles
            </small>
        </button>
    );
};
