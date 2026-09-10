import type { ArticleContentRetrieval } from '../../../../../../../entities/article-enrichment/model/types';

export interface EnrichmentRetrievalDetailsProps {
    retrieval?: ArticleContentRetrieval | null;
    title?: string;
}
