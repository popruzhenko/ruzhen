import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toast } from './Toast';
import type { ToastItem } from './TypesToast';

const toast: ToastItem = {
    id: 'toast-1',
    type: 'success',
    title: 'Saved',
    message: 'Changes were saved',
    autoCloseMs: 3000,
};

afterEach(() => vi.useRealTimers());

describe('Toast', () => {
    it('announces its title and message and closes by its own id', () => {
        const onClose = vi.fn();
        render(<Toast toast={toast} onClose={onClose} />);
        expect(screen.getByRole('status')).toHaveAttribute(
            'aria-live',
            'polite',
        );
        expect(screen.getByRole('status')).toHaveTextContent('Saved');
        expect(screen.getByRole('status')).toHaveTextContent(
            'Changes were saved',
        );
        fireEvent.click(screen.getByRole('button', { name: 'Close toast' }));
        expect(onClose).toHaveBeenCalledExactlyOnceWith('toast-1');
    });

    it('closes once after its configured duration', () => {
        vi.useFakeTimers();
        const onClose = vi.fn();
        render(<Toast toast={toast} onClose={onClose} />);
        act(() => vi.advanceTimersByTime(2999));
        expect(onClose).not.toHaveBeenCalled();
        act(() => vi.advanceTimersByTime(1));
        expect(onClose).toHaveBeenCalledExactlyOnceWith('toast-1');
    });

    it('supports persistent toasts and clears its timer on unmount', () => {
        vi.useFakeTimers();
        const onClose = vi.fn();
        const { rerender, unmount } = render(
            <Toast toast={{ ...toast, autoCloseMs: 0 }} onClose={onClose} />,
        );
        act(() => vi.advanceTimersByTime(60000));
        expect(onClose).not.toHaveBeenCalled();
        rerender(<Toast toast={toast} onClose={onClose} />);
        unmount();
        act(() => vi.advanceTimersByTime(60000));
        expect(onClose).not.toHaveBeenCalled();
    });
});
