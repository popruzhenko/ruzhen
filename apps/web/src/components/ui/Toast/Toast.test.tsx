import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { Toast } from './Toast';

describe('Toast', () => {
    it('renders with message', () => {
        const handleClose = vi.fn();
        render(
            <Toast
                message="This is a toast message"
                open={true}
                onClose={handleClose}
            />,
        );
        expect(screen.getByText('This is a toast message')).toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', async () => {
        const user = userEvent.setup();
        const handleClose = vi.fn();
        render(
            <Toast
                message="This is a toast message"
                open={true}
                onClose={handleClose}
            />,
        );
        const closeButton = screen.getByRole('button', { name: /close/i });
        await user.click(closeButton);
        expect(handleClose).toHaveBeenCalled();
    });

    it('does not render when open is false', () => {
        const handleClose = vi.fn();
        render(
            <Toast
                message="This is a toast message"
                open={false}
                onClose={handleClose}
            />,
        );
        expect(
            screen.queryByText('This is a toast message'),
        ).not.toBeInTheDocument();
    });

    it('auto closes after a duration', async () => {
        vi.useFakeTimers();
        const handleClose = vi.fn();
        render(
            <Toast
                message="This is a toast message"
                open={true}
                onClose={handleClose}
                autoCloseMs={3000}
            />,
        );
        await act(async () => {});
        await act(async () => {
            vi.advanceTimersByTime(3000);
        });
        expect(handleClose).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });
});
