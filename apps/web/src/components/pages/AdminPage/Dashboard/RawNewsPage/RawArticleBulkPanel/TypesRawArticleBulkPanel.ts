import type {
    RawArticleBulkAction,
    RawArticleBulkItem,
    RawArticleBulkResult,
} from '../../../../../../entities/raw-news/model/rawArticles';
import type { useRawArticleBulk } from './useRawArticleBulk';

export interface RawArticleBulkPanelProps {
    scope: 'FILTERED' | 'SELECTED';
    onScopeChange: (scope: 'FILTERED' | 'SELECTED') => void;
    total: number;
    selectedCount: number;
    eligibility: Record<RawArticleBulkAction, number>;
    disabled: boolean;
    selectionDisabled: boolean;
    onSelectShown: () => void;
    onClearSelection: () => void;
    onPrepare: (action: RawArticleBulkAction) => void;
    enrichmentEligibleCount?: number;
    onEnrich?: () => void;
    bulk: ReturnType<typeof useRawArticleBulk>;
}

export interface RawArticleReportRow extends RawArticleBulkItem {
    outcome: RawArticleBulkResult['outcome'] | 'PENDING';
    reason: string;
}

export interface RawArticleReport {
    action: RawArticleBulkAction;
    rows: RawArticleReportRow[];
}
