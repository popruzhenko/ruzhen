import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    // Every request in a unit/component test must have an explicit response.
    vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new Error('Unexpected network request'))),
    );
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
});
