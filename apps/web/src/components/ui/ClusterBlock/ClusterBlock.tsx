import { classesJoined } from '../Utils/classesJoined';
import { Link } from '../Link/Link';
import { Badge } from '../Badge/Badge';

import type { BadgeVariants } from '../Badge/TypesBadge';
import type { ClusterBlockProps } from './TypesClusterBlock';

import './ClusterBlock.scss';

export const ClusterBlock = ({
    id,
    type,
    title,
    content,
    sourceName,
    sourceUrl,
    stance,
    className,
}: ClusterBlockProps) => {
    const normalizedType = type.toLowerCase();

    return (
        <article
            key={id}
            className={classesJoined([
                'ui-cluster-block',
                `ui-cluster-block--${normalizedType}`,
                className,
            ])}
        >
            <div className="ui-cluster-block__top">
                {title && <h3 className="ui-cluster-block__title">{title}</h3>}

                {normalizedType === 'opinion' && stance && (
                    <Badge type={stance.toLowerCase() as BadgeVariants}>
                        {stance}
                    </Badge>
                )}
            </div>

            <p className="ui-cluster-block__content">{content}</p>

            {sourceName && (
                <div className="ui-cluster-block__source">
                    <span className="ui-cluster-block__source-label">
                        Source:
                    </span>

                    {sourceUrl ? (
                        <Link
                            href={sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            disabled={false}
                        >
                            {sourceName}
                        </Link>
                    ) : (
                        <span className="ui-cluster-block__source-name">
                            {sourceName}
                        </span>
                    )}
                </div>
            )}
        </article>
    );
};
