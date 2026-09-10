import type { EnrichmentArticleSnapshot } from '../../../../../../../entities/article-enrichment/model/types';

export interface EnrichmentContentComparisonProps {
    current: EnrichmentArticleSnapshot;
    proposed: EnrichmentArticleSnapshot;
    proposedLabel: string;
}
