import { defineConfig } from 'vitest/config';

export default defineConfig({
    esbuild: { jsx: 'automatic' },
    test: {
        environment: 'jsdom',
        env: { TZ: 'Europe/Brussels' },
        include: ['src/components/pages/PublicArticlesPage/**/*.test.{ts,tsx}'],
    },
});
