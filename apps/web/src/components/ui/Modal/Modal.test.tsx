import { render, screen } from '@testing-library/react';
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
});
