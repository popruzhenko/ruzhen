import './ClusterCard.scss';
import { classesJoined } from '../Utils/classesJoined';
import { Badge } from '../Badge/Badge';
import { Tag } from '../Tag/Tag';
import { OpinionBar } from '../OpinionBar/OpinionBar';
import { type ClusterCardProps } from './TypesClusterCard';

export const ClusterCard = ({
    title,
    summary,
    tags = [],
    badges = [],
    publishedAt,
    country,
    opinions,
    imageUrl,
    onClick,
    className,
}: ClusterCardProps) => {
    const Component = onClick ? 'button' : 'article';

    const clickHandler = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (onClick) {
            console.log('ClusterCard clicked!');
            onClick();
        }
    };

    return (
        <Component
            className={classesJoined([
                className,
                'ui-cluster-card',
                onClick
                    ? 'ui-cluster-card--interactive'
                    : 'ui-cluster-card--interactive',
            ])}
            onClick={clickHandler}
            type={onClick ? 'button' : undefined}
        >
            {imageUrl && (
                <div className="ui-cluster-card__image-wrapper">
                    <img
                        src={imageUrl}
                        alt={title}
                        className="ui-cluster-card__image"
                    />
                </div>
            )}

            <div className="ui-cluster-card__content">
                {(publishedAt || country) && (
                    <div className="ui-cluster-card__meta">
                        {publishedAt && <span>Published: {publishedAt}</span>}
                        {country && <span>{country}</span>}
                    </div>
                )}

                <h3 className="ui-cluster-card__title">{title}</h3>

                {summary && (
                    <p className="ui-cluster-card__summary">{summary}</p>
                )}

                {badges.length > 0 && (
                    <div className="ui-cluster-card__badges">
                        {badges.map((badge) => (
                            <Badge key={badge} type={badge} />
                        ))}
                    </div>
                )}

                {/* {opinions && (
                    <div className='opinionBar'>
                        <OpinionBar
                            pro={opinions.pro}
                            contra={opinions.contra}
                            neutral={opinions.neutral}
                        />
                    </div>
                )} */}

                {tags.length > 0 && (
                    <div className="ui-cluster-card__tags">
                        {tags.map((tag) => (
                            <Tag key={tag.children + 'a'} onClick={tag.onClick}>
                                {tag.children}
                            </Tag>
                        ))}
                    </div>
                )}
            </div>
        </Component>
    );
};
