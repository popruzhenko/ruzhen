import type {
    ArticleRetrievalOutcome,
    ArticleRetrievalProvider,
} from '../../../../../../../entities/article-enrichment/model/types';
import { formatEnrichmentReason } from '../formatEnrichmentReason';
import type { EnrichmentRetrievalDetailsProps } from './TypesEnrichmentRetrievalDetails';
import './EnrichmentRetrievalDetails.scss';

const providerLabels: Record<ArticleRetrievalProvider, string> = {
    PUBLISHER_HTTP: 'Publisher page',
    PUBLISHER_BROWSER: 'Publisher page (browser)',
    ARCHIVE_TODAY: 'archive.today / archive.ph',
};
const outcomeLabels: Record<ArticleRetrievalOutcome, string> = {
    FULL_TEXT: 'Full text retrieved',
    PARTIAL_TEXT: 'Partial text retrieved',
    NO_CONTENT: 'No article text found',
    ERROR: 'Retrieval failed',
    SKIPPED: 'Skipped',
};
const formatTimestamp = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? 'Time unavailable'
        : new Intl.DateTimeFormat('en-GB', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZoneName: 'short',
          }).format(date);
};

export function EnrichmentRetrievalDetails({
    retrieval,
    title = 'Text source',
}: EnrichmentRetrievalDetailsProps) {
    if (!retrieval) return null;
    return (
        <div
            className="enrichment_retrieval_details"
            role="group"
            aria-label={title}
        >
            <h4>{title}</h4>
            <dl>
                <div>
                    <dt>Retrieved through</dt>
                    <dd>{providerLabels[retrieval.provider]}</dd>
                </div>
                <div>
                    <dt>Original article</dt>
                    <dd>
                        <a
                            href={retrieval.originalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {retrieval.originalUrl}
                        </a>
                    </dd>
                </div>
                <div>
                    <dt>Text retrieved from</dt>
                    <dd>
                        <a
                            href={retrieval.retrievedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {retrieval.retrievedUrl}
                        </a>
                    </dd>
                </div>
                <div>
                    <dt>Retrieved at</dt>
                    <dd>
                        <time dateTime={retrieval.retrievedAt}>
                            {formatTimestamp(retrieval.retrievedAt)}
                        </time>
                    </dd>
                </div>
                {(retrieval.provider === 'ARCHIVE_TODAY' ||
                    retrieval.archiveCapturedAt) && (
                    <div>
                        <dt>Archive captured at</dt>
                        <dd>
                            {retrieval.archiveCapturedAt ? (
                                <time dateTime={retrieval.archiveCapturedAt}>
                                    {formatTimestamp(
                                        retrieval.archiveCapturedAt,
                                    )}
                                </time>
                            ) : (
                                'Archive capture time unavailable'
                            )}
                        </dd>
                    </div>
                )}
            </dl>
            {retrieval.attempts.length > 0 && (
                <details>
                    <summary>
                        Retrieval attempts ({retrieval.attempts.length})
                    </summary>
                    <ol>
                        {retrieval.attempts.map((attempt, index) => (
                            <li
                                key={`${index}:${attempt.provider}:${attempt.url}`}
                            >
                                <p>
                                    <strong>
                                        {providerLabels[attempt.provider]}
                                    </strong>{' '}
                                    — {outcomeLabels[attempt.outcome]}
                                </p>
                                <a
                                    href={attempt.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {attempt.url}
                                </a>
                                {attempt.reasons.length > 0 && (
                                    <ul>
                                        {attempt.reasons.map(
                                            (reason, reasonIndex) => (
                                                <li
                                                    key={`${reasonIndex}:${reason}`}
                                                >
                                                    {formatEnrichmentReason(
                                                        reason,
                                                    )}
                                                </li>
                                            ),
                                        )}
                                    </ul>
                                )}
                            </li>
                        ))}
                    </ol>
                </details>
            )}
        </div>
    );
}
