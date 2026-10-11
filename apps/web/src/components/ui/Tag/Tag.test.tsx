import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Tag } from './Tag';

describe('Tag', () => {
    it('invokes its action without selecting the enclosing card or submitting a form', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        const onParentClick = vi.fn();
        const onSubmit = vi.fn();
        render(
            <form onSubmit={onSubmit}>
                <div onClick={onParentClick}>
                    <Tag onClick={onClick}>Remove Belgium filter</Tag>
                </div>
            </form>,
        );
        await user.click(
            screen.getByRole('button', { name: 'Remove Belgium filter' }),
        );
        expect(onClick).toHaveBeenCalledOnce();
        expect(onParentClick).not.toHaveBeenCalled();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('allows keyboard activation and displays noninteractive tags as text', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        const { rerender } = render(<Tag onClick={onClick}>Belgium</Tag>);
        await user.tab();
        await user.keyboard('{Enter}');
        expect(onClick).toHaveBeenCalledOnce();
        rerender(<Tag>Belgium</Tag>);
        expect(screen.getByText('Belgium')).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
