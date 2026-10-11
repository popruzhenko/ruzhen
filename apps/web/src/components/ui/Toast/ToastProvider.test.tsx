import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './ToastProvider';

const Trigger = () => {
    const { showToast } = useToast();
    return (
        <>
            <button onClick={() => showToast({ message: 'Temporary message' })}>
                Show temporary
            </button>
            <button
                onClick={() =>
                    showToast({
                        type: 'error',
                        title: 'Problem',
                        message: 'Persistent message',
                        autoCloseMs: 0,
                    })
                }
            >
                Show persistent
            </button>
        </>
    );
};

afterEach(() => vi.useRealTimers());

describe('ToastProvider', () => {
    it('renders a portal, defaults to info, and expires after four seconds', () => {
        vi.useFakeTimers();
        const { container } = render(
            <ToastProvider position="top">
                <Trigger />
            </ToastProvider>,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Show temporary' }));
        expect(screen.getByRole('status')).toHaveClass('ui-toast--info');
        expect(container.querySelector('[role="status"]')).toBeNull();
        expect(
            document.querySelector('.ui-toast__viewport--top'),
        ).toBeInTheDocument();
        act(() => vi.advanceTimersByTime(3999));
        expect(screen.getByText('Temporary message')).toBeInTheDocument();
        act(() => vi.advanceTimersByTime(1));
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('keeps multiple independent toasts and dismisses only the chosen one', () => {
        vi.useFakeTimers();
        render(
            <ToastProvider>
                <Trigger />
            </ToastProvider>,
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Show persistent' }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Show temporary' }));
        expect(screen.getAllByRole('status')).toHaveLength(2);
        const persistent = screen
            .getByText('Persistent message')
            .closest('[role="status"]')!;
        expect(persistent).toHaveClass('ui-toast--error');
        act(() => vi.advanceTimersByTime(4000));
        expect(screen.getAllByRole('status')).toHaveLength(1);
        fireEvent.click(
            within(persistent as HTMLElement).getByRole('button', {
                name: 'Close toast',
            }),
        );
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('requires a provider when accessing the toast API', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => render(<Trigger />)).toThrow(
            'useToast must be used inside ToastProvider',
        );
    });
});
