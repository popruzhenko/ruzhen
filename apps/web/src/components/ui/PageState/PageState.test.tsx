import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PageState } from './PageState';

describe('PageState', () => {
    it('shows retry feedback and invokes a callback on demand', () => {
        const retry = vi.fn();
        render(
            <PageState
                variant="error"
                eyebrow="Request failed"
                title="Could not load"
                description="Please retry."
                actionLabel="Retry"
                onAction={retry}
            />,
        );
        expect(
            screen.getByRole('heading', { name: 'Could not load' }),
        ).toBeInTheDocument();
        expect(screen.getByText('Please retry.')).toBeInTheDocument();
        expect(retry).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(retry).toHaveBeenCalledOnce();
    });

    it('provides the recovery route when configured and omits incomplete actions', () => {
        const { rerender } = render(
            <MemoryRouter>
                <PageState title="Missing" actionLabel="Home" actionTo="/" />
            </MemoryRouter>,
        );
        expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
            'href',
            '/',
        );
        rerender(
            <MemoryRouter>
                <PageState title="Missing" actionLabel="Home" />
            </MemoryRouter>,
        );
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
});
