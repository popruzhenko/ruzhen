import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    executeRawArticleBulk,
    previewRawArticleBulk,
} from '../../../../../../entities/raw-news/api/rawArticles';
import type { RawArticleBulkPreview } from '../../../../../../entities/raw-news/model/rawArticles';
import { useRawArticleBulk } from './useRawArticleBulk';

vi.mock('../../../../../../entities/raw-news/api/rawArticles', () => ({
    previewRawArticleBulk: vi.fn(),
    executeRawArticleBulk: vi.fn(),
}));

const makePreview = (): RawArticleBulkPreview => ({
    action: 'RECHECK',
    total: 3,
    eligible: 2,
    items: [
        {
            id: 'ready',
            title: 'Ready',
            eligible: true,
            updatedAt: '2026-09-01T10:00:00Z',
        },
        { id: 'missing-version', title: null, eligible: true, updatedAt: null },
        {
            id: 'linked',
            title: 'Linked',
            eligible: false,
            updatedAt: '2026-09-01T11:00:00Z',
            reason: 'Already linked to a cluster.',
        },
    ],
});

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
};

let client: QueryClient;
const acquire = vi.fn<() => boolean>();
const release = vi.fn<() => void>();
const mount = () =>
    renderHook(() => useRawArticleBulk(acquire, release), {
        wrapper: ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        ),
    });

beforeEach(() => {
    vi.resetAllMocks();
    client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    acquire.mockReturnValue(true);
    vi.mocked(previewRawArticleBulk).mockResolvedValue(makePreview());
    vi.mocked(executeRawArticleBulk).mockResolvedValue({ results: [] });
});

afterEach(() => client.clear());

describe('raw article bulk lifecycle', () => {
    it('does not preview when another action owns the lock', async () => {
        acquire.mockReturnValue(false);
        const { result } = mount();
        await act(() =>
            result.current.prepare('RECHECK', {
                type: 'FILTERED',
                filters: {},
            }),
        );
        expect(previewRawArticleBulk).not.toHaveBeenCalled();
        expect(result.current.isPreparing).toBe(false);
        expect(release).not.toHaveBeenCalled();
    });

    it('holds the lock through preview and releases it when canceled without any write', async () => {
        const { result } = mount();
        await act(() =>
            result.current.prepare('RECHECK', {
                type: 'SELECTED',
                ids: ['ready'],
            }),
        );
        expect(result.current.preview).toEqual(makePreview());
        expect(previewRawArticleBulk).toHaveBeenCalledWith(
            'RECHECK',
            { type: 'SELECTED', ids: ['ready'] },
            expect.any(AbortSignal),
        );
        expect(release).not.toHaveBeenCalled();
        act(() => result.current.cancelPreview());
        expect(result.current.preview).toBeNull();
        expect(release).toHaveBeenCalledOnce();
        expect(executeRawArticleBulk).not.toHaveBeenCalled();
    });

    it.each([new Error('Preview failed'), 'unexpected response'])(
        'releases the lock on a preview failure: %s',
        async (error) => {
            vi.mocked(previewRawArticleBulk).mockRejectedValue(error);
            const { result } = mount();
            await act(() =>
                result.current.prepare('REJECT', {
                    type: 'FILTERED',
                    filters: {},
                }),
            );
            expect(result.current.error).toBe(
                error instanceof Error
                    ? error.message
                    : 'The request failed. Please try again.',
            );
            expect(result.current.isPreparing).toBe(false);
            expect(result.current.preview).toBeNull();
            expect(release).toHaveBeenCalledOnce();
        },
    );

    it('aborts a pending preview when unmounted and ignores its late result', async () => {
        const pending = deferred<RawArticleBulkPreview>();
        vi.mocked(previewRawArticleBulk).mockReturnValue(pending.promise);
        const { result, unmount } = mount();
        let preparation!: Promise<void>;
        act(() => {
            preparation = result.current.prepare('RECHECK', {
                type: 'FILTERED',
                filters: {},
            });
        });
        const signal = vi.mocked(previewRawArticleBulk).mock.calls[0][2]!;
        expect(result.current.isPreparing).toBe(true);
        act(() => result.current.cancelPreview());
        expect(release).not.toHaveBeenCalled();
        unmount();
        expect(signal.aborted).toBe(true);
        await act(async () => {
            pending.resolve(makePreview());
            await preparation;
        });
        expect(executeRawArticleBulk).not.toHaveBeenCalled();
        expect(result.current.preview).toBeNull();
    });

    it('skips missing versions and ineligible articles and reports omitted server results as errors', async () => {
        const { result } = mount();
        const invalidate = vi
            .spyOn(client, 'invalidateQueries')
            .mockRejectedValue(new Error('Refresh failed'));
        await act(() =>
            result.current.prepare('RECHECK', {
                type: 'FILTERED',
                filters: {},
            }),
        );
        await act(() => result.current.confirm());
        expect(executeRawArticleBulk).toHaveBeenCalledExactlyOnceWith(
            'RECHECK',
            [{ id: 'ready', updatedAt: '2026-09-01T10:00:00Z' }],
        );
        expect(
            result.current.report?.rows.map(({ id, outcome, reason }) => ({
                id,
                outcome,
                reason,
            })),
        ).toEqual([
            {
                id: 'ready',
                outcome: 'ERROR',
                reason: 'The server did not return a result for this article.',
            },
            {
                id: 'missing-version',
                outcome: 'SKIPPED',
                reason: 'Not eligible for this action.',
            },
            {
                id: 'linked',
                outcome: 'SKIPPED',
                reason: 'Already linked to a cluster.',
            },
        ]);
        expect(invalidate).toHaveBeenCalledTimes(5);
        expect(result.current.error).toBeNull();
        expect(result.current.isRunning).toBe(false);
        expect(release).toHaveBeenCalledOnce();
    });

    it('finishes an entirely ineligible selection without sending a batch or invalidating reads', async () => {
        const preview = makePreview();
        preview.items = preview.items.slice(1);
        vi.mocked(previewRawArticleBulk).mockResolvedValue(preview);
        const invalidate = vi.spyOn(client, 'invalidateQueries');
        const { result } = mount();
        await act(() =>
            result.current.prepare('APPROVE', {
                type: 'FILTERED',
                filters: {},
            }),
        );
        await act(() => result.current.confirm());
        expect(executeRawArticleBulk).not.toHaveBeenCalled();
        expect(invalidate).not.toHaveBeenCalled();
        expect(
            result.current.report?.rows.every(
                ({ outcome }) => outcome === 'SKIPPED',
            ),
        ).toBe(true);
        expect(result.current.isRunning).toBe(false);
        expect(release).toHaveBeenCalledOnce();
    });

    it('keeps the report untouched when an error retry cannot acquire the lock', async () => {
        const { result } = mount();
        await act(() =>
            result.current.prepare('RECHECK', {
                type: 'FILTERED',
                filters: {},
            }),
        );
        await act(() => result.current.confirm());
        acquire.mockReturnValue(false);
        const report = result.current.report;
        await act(() => result.current.retry('ERROR'));
        expect(executeRawArticleBulk).toHaveBeenCalledOnce();
        expect(result.current.report).toBe(report);
    });
});
