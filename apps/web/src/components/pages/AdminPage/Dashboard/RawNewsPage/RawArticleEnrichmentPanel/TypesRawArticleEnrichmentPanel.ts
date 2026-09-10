import type { RawArticleBulkScope } from '../../../../../../entities/raw-news/model/rawArticles';

export interface RawArticleEnrichmentHandle {
    start: (scope: RawArticleBulkScope) => void;
    openHistory: (articleId: string, currentUpdatedAt: string) => void;
}

export interface RawArticleEnrichmentPanelProps {
    disabled: boolean;
    preferredJobId?: string | null;
    onAcquireInteraction: () => boolean;
    onReleaseInteraction: () => void;
}

export type EnrichmentDialog =
    | { type: 'PROPOSAL'; id: string }
    | { type: 'HISTORY'; articleId: string; fallbackUpdatedAt: string };
