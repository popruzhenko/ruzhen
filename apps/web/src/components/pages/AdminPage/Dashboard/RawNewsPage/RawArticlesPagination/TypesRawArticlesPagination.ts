import type {
    RawArticlesPageSize,
    RawArticlesPagination,
} from '../../../../../../entities/raw-news/model/rawArticles';

export interface RawArticlesPaginationProps {
    pagination: RawArticlesPagination;
    disabled: boolean;
    onPageChange: (page: number) => void;
    onPageSizeChange?: (limit: RawArticlesPageSize) => void;
}
