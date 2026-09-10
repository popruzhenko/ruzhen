import { defineConfig } from 'vitest/config';

export default defineConfig({
    esbuild: { jsx: 'automatic' },
    test: {
        environment: 'jsdom',
        env: { TZ: 'Europe/Brussels' },
        include: [
            'src/components/ui/Pagination/**/*.test.{ts,tsx}',
            'src/components/pages/AdminPage/Dashboard/RawNewsPage/**/*.test.{ts,tsx}',
            'src/entities/raw-news/**/*.test.{ts,tsx}',
        ],
    },
});
