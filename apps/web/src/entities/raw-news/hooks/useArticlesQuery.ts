import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../../../shared/lib/queryKeys';

import { getArticles } from '../api/getArticles';
import type { GetArticlesApiResponse } from '../model/types';

export function useArticlesQuery() {
    return useQuery<GetArticlesApiResponse>({
        queryKey: queryKeys.articles.all,
        queryFn: getArticles,
    });
}