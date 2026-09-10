import type { QueryClient } from '@tanstack/react-query';

export async function invalidateRawArticleQueries(queryClient: QueryClient) {
    await Promise.allSettled(
        [
            'articles',
            'clusters',
            'cluster-candidates',
            'article-cluster-candidates',
            'public-clusters',
        ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
}
