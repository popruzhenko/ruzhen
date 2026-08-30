import { Link as RouterLink, useParams } from 'react-router-dom';

import { usePublicClusterByHumanIdQuery } from '../../../entities/public-clusters';

import { ClusterBlock } from '../../ui/ClusterBlock/ClusterBlock';
import { Link } from '../../ui/Link/Link';
import { PageState } from '../../ui/PageState/PageState';

import './PublicArticleDetailsPage.scss';
import { ReadableLayout } from '../../layouts/ReadableLayout/ReadableLayout';

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

export const PublicArticleDetailsPage = () => {
    const { humanId } = useParams<{ humanId: string }>();

    const publicClusterQuery = usePublicClusterByHumanIdQuery(humanId);

    const cluster = publicClusterQuery.data?.cluster ?? null;

    const facts =
        cluster?.blocks
            .filter((block) => block.type === 'FACT')
            .sort((a, b) => a.position - b.position) ?? [];

    const context =
        cluster?.blocks
            .filter((block) => block.type === 'CONTEXT')
            .sort((a, b) => a.position - b.position) ?? [];

    const opinions =
        cluster?.blocks
            .filter((block) => block.type === 'OPINION')
            .sort((a, b) => a.position - b.position) ?? [];

    if (publicClusterQuery.isLoading) {
        return (
            <ReadableLayout>
                <div className="public-article-details__container">
                    <PageState
                        variant="loading"
                        title="Loading article"
                        description="Please wait while Ruzhen loads the article details."
                    />
                </div>
            </ReadableLayout>
        );
    }

    if (publicClusterQuery.isError) {
        return (
            <ReadableLayout>
                <div className="public-article-details__container">
                    <PageState
                        variant="error"
                        title="Failed to load article"
                        description="Please refresh the page or try again later."
                        actionLabel="Back to articles"
                        actionTo="/articles"
                    />
                </div>
            </ReadableLayout>
        );
    }

    if (!cluster) {
        return (
            <ReadableLayout>
                <div className="public-article-details__container">
                    <PageState
                        variant="not-found"
                        eyebrow="Article not found"
                        title="This article is not available"
                        description="This article may not exist, may have been archived, or has not been published yet."
                        actionLabel="Back to articles"
                        actionTo="/articles"
                    />
                </div>
            </ReadableLayout>
        );
    }

    return (
        <ReadableLayout>
            <div className="public-article-details__container">
                <RouterLink
                    to="/articles"
                    className="public-article-details__back-link"
                >
                    ← Back to articles
                </RouterLink>

                <article className="public-article-details__layout">
                    <div className="public-article-details__main">
                        <header className="public-article-details__hero">
                            <div className="public-article-details__meta-line">
                                <span>
                                    Published {formatDate(cluster.publishedAt)}
                                </span>

                                <span>
                                    {cluster.sources.length}{' '}
                                    {cluster.sources.length === 1 ? 'source' : 'sources'}
                                </span>

                                {cluster.mainCountry && (
                                    <span>{cluster.mainCountry}</span>
                                )}
                            </div>

                            <h1>{cluster.title}</h1>

                            {cluster.summary && (
                                <p className="public-article-details__summary">
                                    {cluster.summary}
                                </p>
                            )}
                        </header>

                        <div className="public-article-details__content">
                            <section className="public-article-details__section public-article-details__section--facts">
                                <h2>Facts</h2>

                                {facts.length > 0 ? (
                                    <div className="public-article-details__blocks">
                                        {facts.map((block) => (
                                            <ClusterBlock
                                                key={block.id}
                                                id={block.id}
                                                type={block.type}
                                                title={block.title}
                                                content={block.content}
                                                sourceName={block.sourceName}
                                                sourceUrl={block.sourceUrl}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <PageState
                                        variant="empty"
                                        title="No fact blocks"
                                        description="No fact blocks were added for this article."
                                        className="public-article-details__section-state"
                                    />
                                )}
                            </section>

                            <section className="public-article-details__section public-article-details__section--context">
                                <h2>Context</h2>

                                {context.length > 0 ? (
                                    <div className="public-article-details__blocks">
                                        {context.map((block) => (
                                            <ClusterBlock
                                                key={block.id}
                                                id={block.id}
                                                type={block.type}
                                                title={block.title}
                                                content={block.content}
                                                sourceName={block.sourceName}
                                                sourceUrl={block.sourceUrl}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <PageState
                                        variant="empty"
                                        title="No context blocks"
                                        description="No context blocks were added for this article."
                                        className="public-article-details__section-state"
                                    />
                                )}
                            </section>

                            <section className="public-article-details__section public-article-details__section--opinions">
                                <h2>Opinions</h2>

                                {opinions.length > 0 ? (
                                    <div className="public-article-details__blocks">
                                        {opinions.map((block) => (
                                            <ClusterBlock
                                                key={block.id}
                                                id={block.id}
                                                type={block.type}
                                                title={block.title}
                                                content={block.content}
                                                sourceName={block.sourceName}
                                                sourceUrl={block.sourceUrl}
                                                stance={block.stance}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <PageState
                                        variant="empty"
                                        title="No opinion blocks"
                                        description="No opinion blocks were added for this article."
                                        className="public-article-details__section-state"
                                    />
                                )}
                            </section>
                        </div>
                    </div>

                    <aside className="public-article-details__sidebar">
                        <section className="public-article-details__sources-card">
                            <div className="public-article-details__sources-header">
                                <span>Sources</span>
                                <strong>{cluster.sources.length}</strong>
                            </div>

                            {cluster.sources.length > 0 ? (
                                <div className="public-article-details__sources-list">
                                    {cluster.sources.map((source) => (
                                        <div
                                            key={source.id}
                                            className="public-article-details__source-item"
                                        >
                                            <span>
                                                {source.source?.name ??
                                                    'Unknown source'}
                                            </span>

                                            <p>{source.title}</p>

                                            {source.url && (
                                                <Link
                                                    href={source.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    disabled={false}
                                                >
                                                    Open source
                                                </Link>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <PageState
                                    variant="empty"
                                    title="No sources"
                                    description="No source articles are connected to this material."
                                    className="public-article-details__sidebar-state"
                                />
                            )}
                        </section>
                    </aside>
                </article>
            </div>
        </ReadableLayout>
    );
};
