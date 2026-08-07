import { useQuery } from '@tanstack/react-query';
import { getArticles } from '../api/getArticles';
import type { GetArticlesApiResponse } from '../model/types';

export function useArticlesQuery() {
    return useQuery<GetArticlesApiResponse>({
        queryKey: ['articles'],
        queryFn: getArticles,
    });
}