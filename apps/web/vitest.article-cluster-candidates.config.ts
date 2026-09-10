import { defineConfig } from 'vitest/config';

export default defineConfig({
    esbuild: { jsx: 'automatic' },
    test: {
        environment: 'jsdom',
        include: [
            'src/components/pages/AdminPage/Dashboard/ClusteringPage/ExistingClusterSuggestions/**/*.test.{ts,tsx}',
            'src/entities/article-cluster-candidate/**/*.test.{ts,tsx}',
        ],
    },
});
