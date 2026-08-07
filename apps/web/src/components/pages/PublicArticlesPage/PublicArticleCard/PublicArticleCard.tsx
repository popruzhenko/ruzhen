import { Link as RouterLink } from 'react-router-dom';

import type { PublicClusterListItem } from '../../../../entities/public-clusters';

import './PublicArticleCard.scss';
import { Badge } from '../../../ui/Badge/Badge';

interface PublicArticleCardProps {
    article: PublicClusterListItem;
    detailsBasePath?: string;
}

const formatDate = (value?: string | null) => {
    if (!value) {
        return '—';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '—';
    }

    return new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date);
};

const getBlocksCountByType = (
    article: PublicClusterListItem,
    type: 'FACT' | 'CONTEXT' | 'OPINION',
) => {
    return article.blocks.filter((block) => block.type === type).length;
};

const formatBlockCount = (count: number, label: string) => {
    if (count === 0) {
        return null;
    }
    if(label === 'Context') {
        return `${label}: ${count}`;
    }

    return `${label}${count > 1 ? 's:' : ':'} ${count}`;
};

export const PublicArticleCard = ({
    article,
    detailsBasePath = '/articles',
}: PublicArticleCardProps) => {
    const detailsPath = `${detailsBasePath}/${article.humanId}`;

    const factsCount = getBlocksCountByType(article, 'FACT');
    const contextCount = getBlocksCountByType(article, 'CONTEXT');
    const opinionsCount = getBlocksCountByType(article, 'OPINION');

    return (
        <article className="public-article-card">
            <div className="public-article-card__content">
                <div className="public-article-card__id">
                    <span>{article.humanId}</span>
                </div>
                <div className="public-article-card__meta">
                    <span>{formatDate(article.publishedAt)}</span>
                    <span>{article._count.articleLinks} sources</span>
                </div>

                <RouterLink
                    className="public-article-card__title-link"
                    to={detailsPath}
                >
                    <h2>{article.title}</h2>
                </RouterLink>

                {article.summary && (
                    <p className="public-article-card__summary">
                        {article.summary}
                    </p>
                )}

                <div className="public-article-card__taxonomy">
                    {formatBlockCount(factsCount, 'Fact') && (
                        <Badge type="fact">
                            {formatBlockCount(factsCount, 'Fact')}
                        </Badge>
                    )}

                    {formatBlockCount(contextCount, 'Context') && (
                        <Badge type="context">
                            {formatBlockCount(contextCount, 'Context')}
                        </Badge>
                    )}

                    {formatBlockCount(opinionsCount, 'Opinion') && (
                        <Badge type="opinion">
                            {formatBlockCount(opinionsCount, 'Opinion')}
                        </Badge>
                    )}
                </div>
            </div>

            <RouterLink
                className="public-article-card__read-more"
                to={detailsPath}
                aria-label={`Read article: ${article.title}`}
            >
                Read
                <span>→</span>
            </RouterLink>
        </article>
    );
};