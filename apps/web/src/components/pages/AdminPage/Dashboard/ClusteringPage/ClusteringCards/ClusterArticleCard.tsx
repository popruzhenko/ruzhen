import type { ClusterArticleCardProps } from './TypesArticleCandidate';
import './ClusterArticleCard.scss';
import { Badge } from '../../../../../ui/Badge/Badge';

export const ClusterArticleCard = ({
    article,
    isSelected,
    onToggle,
}: ClusterArticleCardProps) => {

    const similarityToCentroid = article.similarityToCentroid as number;

    return (
        <label className="cluster_article_card">
            <input
                className="cluster_article_card__checkbox"
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(article.id)}
            />

            <div className="cluster_article_card__content">
                <div className="cluster_article_card__title-row">
                    <strong className="cluster_article_card__title">
                        {article.title}
                    </strong>

                    {article.isPrimary && (
                        <Badge type='primary' />
                    )}
                </div>

                <span className="cluster_article_card__id">
                    ID: {article.id}
                </span>

                <span className="cluster_article_card__source">
                    {article.sourceName ?? 'Unknown source'}
                </span>
            </div>

            <b className={similarityToCentroid >= 0.75 ? "article_candidate_card__similarity_green" : "article_candidate_card__similarity_red"}>
                {similarityToCentroid !== null
                    ? similarityToCentroid.toFixed(3)
                    : '—'}
            </b>
        </label>
    );
};