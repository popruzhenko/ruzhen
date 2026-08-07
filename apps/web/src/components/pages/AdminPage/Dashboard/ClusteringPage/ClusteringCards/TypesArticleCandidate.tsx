import type {
    CandidateArticleItem,
    ClusterArticleItem,
    ClusterListItem,
} from '../../../../../../entities/clustering/model/types';

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

export interface ClusterCardProps {
    cluster: ClusterListItem;
    isActive: boolean;
    onSelect: (clusterId: string) => void;
}