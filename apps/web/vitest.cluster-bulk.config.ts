import { defineConfig } from 'vitest/config';

export default defineConfig({
    esbuild: { jsx: 'automatic' },
    test: {
        environment: 'jsdom',
        include: [
            'src/components/pages/AdminPage/Dashboard/ClusterBulkPanel/**/*.test.{ts,tsx}',
            'src/components/pages/AdminPage/Dashboard/ContextualizationPage/**/*.test.{ts,tsx}',
            'src/components/pages/AdminPage/Dashboard/PublicationPage/**/*.test.{ts,tsx}',
            'src/entities/cluster/**/*.test.{ts,tsx}',
        ],
    },
});
