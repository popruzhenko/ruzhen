import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config';

export default defineConfig({
    ...baseConfig,
    test: {
        ...baseConfig.test,
        include: [
            'src/components/pages/AdminPage/Dashboard/ClusteringPage/ExistingClusterSuggestions/**/*.test.{ts,tsx}',
            'src/entities/article-cluster-candidate/**/*.test.{ts,tsx}',
        ],
    },
});
