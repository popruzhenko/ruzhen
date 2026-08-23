import type { ArticleCandidateCardProps } from './TypesArticleCandidate';
import './ArticleCandidateCard.scss';

export const ArticleCandidateCard = ({
    article,
    isSelected,
    onToggle,
}: ArticleCandidateCardProps) => {
    const hasEmbedding = Array.isArray(article.embedding);

    const similarityToCluster = article.similarityToCluster as number;

    return (
        <label className="article_candidate_card">
            <input
                className="article_candidate_card__checkbox"
                type="checkbox"
                checked={isSelected}
                disabled={!hasEmbedding}
                onChange={() => onToggle(article.id)}
            />

            <div className="article_candidate_card__content">
                <strong className="article_candidate_card__title">
                    {article.title}
                </strong>

                <span className="article_candidate_card__id">
                    ID: {article.id}
                </span>

                <span className="article_candidate_card__source">
                    {article.sourceName ?? 'Unknown source'}
                </span>
            </div>

            <div className="article_candidate_card__right">
                {!hasEmbedding ? (
                    <span className="article_candidate_card__status">
                        Needs embedding
                    </span>
                ) : (
                    <b
                        className={
                            similarityToCluster >= 0.75
                                ? 'article_candidate_card__similarity_green'
                                : 'article_candidate_card__similarity_red'
                        }
                    >
                        {similarityToCluster?.toFixed(3) ?? '—'}
                    </b>
                )}
            </div>
        </label>
    );
};
