import { useState } from 'react';

import type { RawNewsFeedItem } from '../../../../../../entities/raw-news/model/types';

import { Badge } from '../../../../../ui/Badge/Badge';
import { Button } from '../../../../../ui/Button/Button';
import { Textarea } from '../../../../../ui/Textarea/Textarea';
import { Input } from '../../../../../ui/Input/Input';
import { Link } from '../../../../../ui/Link/Link';
import { Modal } from '../../../../../ui/Modal/Modal';
import { useToast } from '../../../../../ui/Toast/ToastProvider';

import { useUpdateArticleMutation } from '../../../../../../entities/raw-news/hooks/useUpdateArticleMutation';
import { useReviewArticleContentMutation } from '../../../../../../entities/raw-news/hooks/useReviewArticleContentMutation';

import './RawArticleCard.scss';
import { ARTICLE_STATUS, CONTENT_AVAILABILITY, type ContentAvailability } from '../../../../../../entities/raw-news/model/articleConstants';
import { TOAST_TYPE } from '../../../../../ui/Toast/ToastConstants';

interface RawArticleCardProps {
    article: RawNewsFeedItem;
}

interface RawArticleValidationInput {
    title: string | null;
    summary: string | null;
    content: string | null;
    preview: string | null;
    url: string | null;
    sourceName: string | null;
    contentAvailability: ContentAvailability | null;
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

const isValidHttpUrl = (value: string) => {
    try {
        const url = new URL(value);

        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
};

const getSaveReviewValidationErrors = ({
    title,
    url,
}: RawArticleValidationInput) => {
    const errors: string[] = [];

    if (!title?.trim()) {
        errors.push('Title is required.');
    }

    if (!url?.trim()) {
        errors.push('Original article URL is required.');
    }

    if (url?.trim() && !isValidHttpUrl(url.trim())) {
        errors.push('Original article URL must be a valid http or https URL.');
    }

    return errors;
};

const getSaveReviewWarnings = ({
    summary,
    preview,
    content,
}: RawArticleValidationInput) => {
    const warnings: string[] = [];

    if (!summary?.trim()) {
        warnings.push('Summary is empty.');
    }

    if (!preview?.trim()) {
        warnings.push('Preview is empty.');
    }

    if (!content?.trim()) {
        warnings.push('Content is empty.');
    }

    return warnings;
};

const getApproveValidationErrors = ({
    title,
    summary,
    content,
    url,
    sourceName,
    contentAvailability,
}: RawArticleValidationInput) => {
    const errors: string[] = [];

    if (!title?.trim()) {
        errors.push('Title is required.');
    }

    if (!url?.trim()) {
        errors.push('Original article URL is required.');
    }

    if (url?.trim() && !isValidHttpUrl(url.trim())) {
        errors.push('Original article URL must be a valid http or https URL.');
    }

    if (!sourceName?.trim()) {
        errors.push('Source is required.');
    }

    if (!summary?.trim()) {
        errors.push('Summary is required before approval.');
    }

    if (!content?.trim()) {
        errors.push('Content is required before approval.');
    }

    if (contentAvailability && contentAvailability !== CONTENT_AVAILABILITY.FULL_TEXT) {
        errors.push('Article must have FULL_TEXT content before approval.');
    }

    return errors;
};

export const RawArticleCard = ({ article }: RawArticleCardProps) => {
    const updateArticleMutation = useUpdateArticleMutation();
    const reviewArticleContentMutation = useReviewArticleContentMutation();

    const { showToast } = useToast();

    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

    const [title, setTitle] = useState(article.title ?? '');
    const [summary, setSummary] = useState(article.summary ?? '');
    const [content, setContent] = useState(article.content ?? '');
    const [preview, setPreview] = useState(article.preview ?? '');

    const isSavingReview =
        updateArticleMutation.isPending ||
        reviewArticleContentMutation.isPending;

    const validationInput: RawArticleValidationInput = {
        title,
        summary,
        content,
        preview,
        url: article.url ?? null,
        sourceName: article.sourceName ?? null,
        contentAvailability: article.contentAvailability ?? null,
    };

    const handleReviewClick = () => {
        setIsReviewModalOpen(true);
    };

    const handleRejectClick = async () => {
        try {
            await updateArticleMutation.mutateAsync({
                id: article.id,
                status: ARTICLE_STATUS.REJECTED,
            });

            showToast({
                type: TOAST_TYPE.SUCCESS,
                title: 'Article rejected',
                message: 'The article was rejected successfully.',
            });
        } catch (error) {
            showToast({
                type: TOAST_TYPE.ERROR,
                title: 'Failed to reject article',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error occurred.',
            });
        }
    };

    const handleApproveClick = async () => {
        const errors = getApproveValidationErrors(validationInput);

        if (errors.length > 0) {
            showToast({
                type: TOAST_TYPE.ERROR,
                title: 'Article is not ready for approval',
                message: errors.join(' '),
                autoCloseMs: 7000,
            });

            return;
        }

        try {
            await updateArticleMutation.mutateAsync({
                id: article.id,
                title: title.trim(),
                summary: summary.trim(),
                content: content.trim(),
                preview: preview.trim(),
                cleanedAccessibleText: content.trim(),
                status: ARTICLE_STATUS.APPROVED,
            });

            showToast({
                type: TOAST_TYPE.SUCCESS,
                title: 'Article approved',
                message: 'The article was approved and moved to clustering.',
            });
        } catch (error) {
            showToast({
                type: TOAST_TYPE.ERROR,
                title: 'Failed to approve article',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error occurred.',
            });
        }
    };

    const handleCloseReviewModal = () => {
        if (isSavingReview) {
            return;
        }

        setIsReviewModalOpen(false);
    };

    const handleSaveReview = async () => {
        const errors = getSaveReviewValidationErrors(validationInput);

        if (errors.length > 0) {
            showToast({
                type: TOAST_TYPE.ERROR,
                title: 'Article review is not ready to save',
                message: errors.join(' '),
                autoCloseMs: 7000,
            });

            return;
        }

        const warnings = getSaveReviewWarnings(validationInput);

        if (warnings.length > 0) {
            showToast({
                type: TOAST_TYPE.WARNING,
                title: 'Article quality warning',
                message: `${warnings.join(' ')} You can still save this review.`,
                autoCloseMs: 7000,
            });
        }

        try {
            await updateArticleMutation.mutateAsync({
                id: article.id,
                title: title.trim(),
                summary: summary.trim(),
                content: content.trim(),
                preview: preview.trim(),
                cleanedAccessibleText: content.trim(),
                status: ARTICLE_STATUS.REVIEWED,
            });

            await reviewArticleContentMutation.mutateAsync(article.id);

            setIsReviewModalOpen(false);

            showToast({
                type: TOAST_TYPE.SUCCESS,
                title: 'Article saved',
                message: 'The article review was saved successfully.',
            });
        } catch (error) {
            showToast({
                type: TOAST_TYPE.ERROR,
                title: 'Failed to save article',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error occurred.',
            });
        }
    };

    const interactiveBlock = () => {
        return (
            <div className="review_modal__actions">
                <Button
                    variants="secondary"
                    onClick={handleCloseReviewModal}
                    disabled={isSavingReview}
                >
                    Cancel
                </Button>

                <Button
                    variants="primary"
                    onClick={handleSaveReview}
                    disabled={isSavingReview}
                >
                    {isSavingReview ? 'Saving...' : 'Save'}
                </Button>
            </div>
        );
    };

    return (
        <>
            <article className="raw_article_card">
                <div className="raw_article_card__header">
                    <div>
                        <div className="raw_article_card__meta">
                            Created: {formatDate(article.createdAt)}
                        </div>

                        <h2 className="raw_article_card__title">
                            {article.title}
                        </h2>
                    </div>

                    <Badge type={article.status.toLowerCase() as any} />
                </div>

                <div className="raw_article_card__id">
                    ID: <span>{article.id}</span>
                </div>

                <p className="raw_article_card__preview">{article.preview}</p>

                <div className="raw_article_card__details">
                    <div className="raw_article_card__detail">
                        <span>Published</span>
                        <strong>{formatDate(article.publishedAt)}</strong>
                    </div>

                    <div className="raw_article_card__detail">
                        <span>Fetched</span>
                        <strong>{formatDate(article.fetchedAt)}</strong>
                    </div>

                    <div className="raw_article_card__detail">
                        <span>Source</span>
                        <strong>{article.sourceName}</strong>
                    </div>

                    <div className="raw_article_card__detail">
                        <span>Country</span>
                        <strong>{article.country}</strong>
                    </div>

                    <div className="raw_article_card__detail">
                        <span>Language</span>
                        <strong>{article.language}</strong>
                    </div>

                    <div className="raw_article_card__detail">
                        <span>Content</span>
                        <strong>{article.contentAvailability}</strong>
                    </div>

                    <div className="raw_article_card__detail">
                        <span>Cleaning</span>
                        <strong>{article.cleaningMethod}</strong>
                    </div>

                    <div className="raw_article_card__detail">
                        <span>Embedding basis</span>
                        <strong>{article.embeddingBasis}</strong>
                    </div>

                    <div className="raw_article_card__detail">
                        <span>Embedding model</span>
                        <strong>{article.embeddingModel}</strong>
                    </div>

                    <div className="raw_article_card__detail">
                        <span>Parser</span>
                        <strong>{article.parserVersion}</strong>
                    </div>

                    <div className="raw_article_card__detail">
                        <span>Cluster links</span>
                        <strong>{article.clusterLinksCount}</strong>
                    </div>

                    <div className="raw_article_card__detail">
                        <span>Candidates</span>
                        <strong>{article.clusterCandidatesCount}</strong>
                    </div>
                </div>

                <div className="raw_article_card__pipeline">
                    <Badge type={article.pipeline.fetched ? 'done' : 'pending'}>
                        Fetched
                    </Badge>

                    <Badge type={article.pipeline.cleaned ? 'done' : 'pending'}>
                        Cleaned
                    </Badge>

                    <Badge
                        type={article.pipeline.embedded ? 'done' : 'pending'}
                    >
                        Embedded
                    </Badge>

                    <Badge
                        type={article.pipeline.clustered ? 'done' : 'pending'}
                    >
                        Clustered
                    </Badge>
                </div>

                <div className="raw_article_card__bottom">
                    <Link
                        className="raw_article_card__link"
                        href={article.url}
                        target="_blank"
                        disabled={!article.url}
                    >
                        Open original article...
                    </Link>

                    <div className="raw_article_card__interactive-block">
                        <Button
                            variants="primary"
                            disabled={false}
                            onClick={handleReviewClick}
                        >
                            Review
                        </Button>

                        <Button
                            variants="secondary"
                            disabled={
                                article.status === ARTICLE_STATUS.NEEDS_REVIEW ||
                                article.status === ARTICLE_STATUS.NEW ||
                                updateArticleMutation.isPending
                            }
                            onClick={handleRejectClick}
                        >
                            Reject
                        </Button>

                        <Button
                            variants="secondary"
                            disabled={
                                article.status === ARTICLE_STATUS.NEEDS_REVIEW ||
                                article.status === ARTICLE_STATUS.NEW ||
                                updateArticleMutation.isPending
                            }
                            onClick={handleApproveClick}
                        >
                            Approve
                        </Button>
                    </div>
                </div>
            </article>

            <Modal
                title={title}
                isOpen={isReviewModalOpen}
                onClose={handleCloseReviewModal}
                interactiveBlock={interactiveBlock()}
                closeOnEsc={!isSavingReview}
                closeOnOverlayClick={!isSavingReview}
            >
                <div className="review_modal__meta">
                    <div>ID: {article.id}</div>

                    <div>
                        Status:{' '}
                        <Badge type={article.status.toLowerCase() as any} />
                    </div>

                    <div>Created: {formatDate(article.createdAt)}</div>

                    <div className="review_modal__link">
                        Source:
                        <Link
                            disabled={!article.url}
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {article.sourceName}
                        </Link>
                    </div>

                    <div>Fetched: {formatDate(article.fetchedAt)}</div>

                    <div className="review_modal__link">
                        Archive:
                        <Link
                            disabled={!article.url}
                            href={'https://archive.is/' + article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            https://archive.is/
                        </Link>
                    </div>

                    <div>Parser: {article.parserVersion}</div>
                </div>

                <div className="review_modal__fields">
                    <Input
                        label="Title"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                    />

                    <Textarea
                        label="Summary"
                        value={summary}
                        onChange={(value) => setSummary(value.toString())}
                    />

                    <Textarea
                        label="Preview"
                        value={preview}
                        onChange={(value) => setPreview(value.toString())}
                    />

                    <Textarea
                        label="Content"
                        value={content}
                        maxHeight={400}
                        onChange={(value) => setContent(value.toString())}
                    />
                </div>
            </Modal>
        </>
    );
};
