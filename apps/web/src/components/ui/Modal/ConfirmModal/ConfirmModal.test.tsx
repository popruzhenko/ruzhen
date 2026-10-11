import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmModal } from './ConfirmModal';

describe('ConfirmModal', () => {
    it('supports confirmation, cancellation and custom labels', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        render(
            <ConfirmModal
                isOpen
                title="Delete article"
                description="This removes the article."
                confirmLabel="Delete"
                cancelLabel="Keep"
                variant="danger"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />,
        );
        expect(screen.getByRole('dialog')).toHaveTextContent(
            'This removes the article.',
        );
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(onConfirm).toHaveBeenCalledOnce();
        expect(onCancel).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it('prevents every dismissal and duplicate confirmation while processing', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        const props = {
            isOpen: true,
            title: 'Confirm',
            description: 'Wait for completion',
            onConfirm,
            onCancel,
        };
        const { rerender } = render(<ConfirmModal {...props} isLoading />);
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Processing...' }),
        ).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        fireEvent.click(screen.getByRole('button', { name: 'Processing...' }));
        fireEvent.click(screen.getByRole('button', { name: 'Close Modal' }));
        fireEvent.mouseDown(screen.getByRole('presentation'));
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onConfirm).not.toHaveBeenCalled();
        expect(onCancel).not.toHaveBeenCalled();
        rerender(<ConfirmModal {...props} isLoading={false} />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onCancel).toHaveBeenCalledOnce();
    });
});
