import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config';

export default defineConfig({
    ...baseConfig,
    test: {
        ...baseConfig.test,
        include: [
            'src/components/ui/Pagination/**/*.test.{ts,tsx}',
            'src/components/pages/AdminPage/Dashboard/RawNewsPage/**/*.test.{ts,tsx}',
            'src/entities/raw-news/**/*.test.{ts,tsx}',
        ],
    },
});
