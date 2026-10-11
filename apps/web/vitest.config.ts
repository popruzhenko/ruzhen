import { defineConfig } from 'vitest/config';

export default defineConfig({
    esbuild: { jsx: 'automatic' },
    test: {
        environment: 'jsdom',
        globals: true,
        maxWorkers: 4,
        setupFiles: ['./src/test/setup.ts'],
        env: {
            TZ: 'Europe/Brussels',
            VITE_API_URL: 'https://api.test.invalid',
        },
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
        coverage: {
            provider: 'v8',
            reporter: ['text-summary', 'html', 'lcov'],
            thresholds: {
                statements: 85,
                lines: 85,
                functions: 85,
                branches: 80,
                'src/shared/api/**': {
                    statements: 100,
                    lines: 100,
                    functions: 100,
                    branches: 90,
                },
                'src/features/auth/lib/**': {
                    statements: 100,
                    lines: 100,
                    functions: 100,
                    branches: 100,
                },
                'src/entities/clustering/lib/**': {
                    statements: 100,
                    lines: 100,
                    functions: 100,
                    branches: 92,
                },
            },
            include: ['src/**/*.{ts,tsx}'],
            exclude: [
                'src/**/*.d.ts',
                'src/**/*.{test,spec,stories}.{ts,tsx}',
                'src/**/index.ts',
                'src/test/**',
                'src/**/*TestFixtures.ts',
                'src/main.tsx',
            ],
        },
    },
});
