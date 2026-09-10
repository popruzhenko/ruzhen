import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pagination } from './Pagination';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('Pagination', () => {
    let container: HTMLDivElement;
    let root: Root;
    const onPageChange = vi.fn();

    beforeEach(() => {
        onPageChange.mockClear();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(async () => {
        await act(async () => root.unmount());
        container.remove();
    });

    const render = async (page: number, totalPages: number, compact = true) => {
        await act(async () =>
            root.render(
                <Pagination
                    page={page}
                    totalPages={totalPages}
                    hasNextPage={page < totalPages}
                    hasPreviousPage={page > 1}
                    onPageChange={onPageChange}
                    compact={compact}
                />,
            ),
        );
    };
    const button = (label: string) =>
        container.querySelector<HTMLButtonElement>(
            `button[aria-label="${label}"]`,
        )!;

    it('bounds the controls for a very large result set and navigates to neighbors and the final page', async () => {
        await render(500000, 1000000);
        expect(
            container.querySelectorAll('.ui-pagination__pages > *').length,
        ).toBeLessThanOrEqual(7);
        expect(
            container.querySelector('[aria-current="page"]')?.textContent,
        ).toBe('500000');
        expect(button('Go to page 1')).not.toBeNull();
        await act(async () => button('Next page').click());
        expect(onPageChange).toHaveBeenLastCalledWith(500001);
        await act(async () => button('Previous page').click());
        expect(onPageChange).toHaveBeenLastCalledWith(499999);
        await act(async () => button('Go to page 1000000').click());
        expect(onPageChange).toHaveBeenLastCalledWith(1000000);
    });

    it('keeps first and last page boundaries usable without invalid navigation', async () => {
        await render(1, 100);
        expect(button('Previous page').disabled).toBe(true);
        expect(button('Go to page 2')).not.toBeNull();
        await act(async () => button('Previous page').click());
        expect(onPageChange).not.toHaveBeenCalled();
        await render(100, 100);
        expect(button('Next page').disabled).toBe(true);
        expect(button('Go to page 99')).not.toBeNull();
        expect(button('Go to page 1')).not.toBeNull();
        expect(
            container.querySelectorAll('.ui-pagination__pages > *').length,
        ).toBeLessThanOrEqual(7);
        await act(async () => button('Next page').click());
        expect(onPageChange).not.toHaveBeenCalled();
    });

    it('shows every page for small results and preserves the existing noncompact mode', async () => {
        await render(3, 7);
        expect(container.querySelectorAll('.ui-pagination__page')).toHaveLength(
            7,
        );
        expect(container.querySelector('.ui-pagination__ellipsis')).toBeNull();
        await render(3, 10, false);
        expect(container.querySelectorAll('.ui-pagination__page')).toHaveLength(
            10,
        );
        await render(1, 1);
        expect(button('Previous page').disabled).toBe(true);
        expect(button('Next page').disabled).toBe(true);
    });
});
