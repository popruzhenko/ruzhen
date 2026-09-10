import type { EnrichmentContentComparisonProps } from './TypesEnrichmentContentComparison';
import { EnrichmentRetrievalDetails } from '../EnrichmentRetrievalDetails/EnrichmentRetrievalDetails';
import './EnrichmentContentComparison.scss';

export function EnrichmentContentComparison({
    current,
    proposed,
    proposedLabel,
}: EnrichmentContentComparisonProps) {
    return (
        <div className="raw_enrichment__comparison">
            {[
                { label: 'Current saved content', article: current },
                { label: proposedLabel, article: proposed },
            ].map(({ label, article }) => (
                <section key={label}>
                    <h3>{label}</h3>
                    <p>
                        <strong>{article.title || 'Untitled article'}</strong>
                    </p>
                    <p>
                        {article.contentAssessment?.fullText
                            ? 'Full text verified'
                            : article.contentAvailability?.replaceAll(
                                  '_',
                                  ' ',
                              ) || 'Completeness not verified'}
                    </p>
                    <EnrichmentRetrievalDetails
                        retrieval={article.contentProvenance?.retrieval}
                    />
                    <h4>Summary</h4>
                    <div className="raw_enrichment__text raw_enrichment__text--summary">
                        {article.summary || 'No summary saved.'}
                    </div>
                    <h4>Article text</h4>
                    <div className="raw_enrichment__text">
                        {article.content ||
                            article.cleanedAccessibleText ||
                            'No article text saved.'}
                    </div>
                    <p>
                        {(
                            article.content ||
                            article.cleanedAccessibleText ||
                            ''
                        ).length.toLocaleString()}{' '}
                        characters
                    </p>
                </section>
            ))}
        </div>
    );
}
