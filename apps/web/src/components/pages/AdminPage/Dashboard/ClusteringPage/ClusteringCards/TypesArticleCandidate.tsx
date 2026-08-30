import type {
    CandidateArticleItem,
    ClusterArticleItem,
} from '../../../../../../entities/clustering/model/types';

import type { ClusterStatus } from '../../../../../../entities/cluster/model/clusterConstants';
import type { BadgeVariants } from '../../../../../ui/Badge/TypesBadge';

export type ClusterCardBadgeType = BadgeVariants;

export interface ArticleCandidateCardProps {
    article: CandidateArticleItem;
    isSelected: boolean;
    onToggle: (articleId: string) => void;
}

export interface ClusterArticleCardProps {
    article: ClusterArticleItem;
    isSelected: boolean;
    onToggle: (articleId: string) => void;
}

export interface ClusterCardViewModel {
    id: string;
    humanId?: string | null;
    title: string;
    summary?: string | null;
    status?: ClusterStatus | 'CANDIDATE' | string;
    articlesCount: number;
    averageSimilarity?: number | null;
    similarityThreshold?: number | null;
    timeWindowDays?: number | null;
    badgeLabel?: string;
    badgeType?: ClusterCardBadgeType;
}

export interface ClusterCardProps {
    cluster: ClusterCardViewModel;
    isActive: boolean;
    onSelect: (clusterId: string) => void;
}
