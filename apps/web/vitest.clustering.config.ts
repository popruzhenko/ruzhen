import { defineConfig } from 'vitest/config';

export default defineConfig({
    esbuild: { jsx: 'automatic' },
    test: {
        environment: 'jsdom',
        include: [
            'src/components/pages/AdminPage/Dashboard/ClusteringPage/ClusteringPage.test.tsx',
        ],
    },
});
