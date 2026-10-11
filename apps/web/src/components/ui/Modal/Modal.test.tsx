import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

describe('Modal', () => {
    it('renders with title and content', () => {
        render(
            <Modal title="Test Modal" isOpen onClose={() => {}}>
                Modal content
            </Modal>,
        );
        expect(screen.getByText('Test Modal')).toBeInTheDocument();
        expect(screen.getByText('Modal content')).toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', async () => {
        const user = userEvent.setup();
        const handleClose = vi.fn();
        render(
            <Modal title="Test Modal" isOpen onClose={handleClose}>
                Modal content
            </Modal>,
        );
        const closeButton = screen.getByRole('button', { name: /close/i });
        await user.click(closeButton);
        expect(handleClose).toHaveBeenCalled();
    });

    it('does not render when isOpen is false', () => {
        render(
            <Modal title="Test Modal" isOpen={false} onClose={() => {}}>
                Modal content
            </Modal>,
        );
        expect(screen.queryByText('Test Modal')).not.toBeInTheDocument();
        expect(screen.queryByText('Modal content')).not.toBeInTheDocument();
    });

    it('portals an accessible dialog and restores body scrolling on close', () => {
        document.body.style.overflow = 'auto';
        const { container, rerender } = render(
            <Modal isOpen title="Review" onClose={vi.fn()}>
                Body
            </Modal>,
        );
        expect(container.querySelector('[role="dialog"]')).toBeNull();
        expect(screen.getByRole('dialog', { name: 'Review' })).toHaveAttribute(
            'aria-modal',
            'true',
        );
        expect(document.body.style.overflow).toBe('hidden');
        rerender(
            <Modal isOpen={false} title="Review" onClose={vi.fn()}>
                Body
            </Modal>,
        );
        expect(document.body.style.overflow).toBe('auto');
        document.body.style.overflow = '';
    });

    it('closes on an enabled overlay or Escape but ignores content clicks', () => {
        const onClose = vi.fn();
        render(
            <Modal isOpen onClose={onClose} closeOnEsc closeOnOverlayClick>
                Inside
            </Modal>,
        );
        fireEvent.mouseDown(screen.getByText('Inside'));
        expect(onClose).not.toHaveBeenCalled();
        fireEvent.mouseDown(screen.getByRole('presentation'));
        expect(onClose).toHaveBeenCalledOnce();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('ignores disabled overlay and keyboard dismissal and removes listeners on unmount', () => {
        const onClose = vi.fn();
        const remove = vi.spyOn(window, 'removeEventListener');
        const { rerender, unmount } = render(
            <Modal isOpen onClose={onClose}>
                Inside
            </Modal>,
        );
        fireEvent.mouseDown(screen.getByRole('presentation'));
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
        rerender(
            <Modal isOpen onClose={onClose} closeOnEsc>
                Inside
            </Modal>,
        );
        unmount();
        expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
    });
});
