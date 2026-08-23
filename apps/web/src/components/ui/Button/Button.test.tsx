import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

const TestIcon = () => <svg data-testid="icon" />;

describe('Button', () => {
    it('renders a button with text', () => {
        render(<Button>Button</Button>);

        const button = screen.getByRole('button', { name: /button/i });
        expect(button).toBeInTheDocument();
    });

    it('renders a button with left icon', () => {
        render(<Button leftIcon={<TestIcon />}>Button</Button>);

        const button = screen.getByRole('button', { name: /button/i });
        expect(within(button).getByTestId('icon')).toBeInTheDocument();
    });

    it('renders a button with disabled state', () => {
        render(<Button disabled>Button</Button>);

        const button = screen.getByRole('button', { name: /button/i });
        expect(button).toBeDisabled();
    });

    it('secondary button has correct class', () => {
        render(<Button variants="secondary">Button</Button>);

        const button = screen.getByRole('button', { name: /button/i });
        expect(button).toHaveClass('ui-button--secondary');
    });

    it('calls onClick handler when clicked', async () => {
        const user = userEvent.setup();
        const handleClick = vi.fn();
        render(<Button onClick={handleClick}>Button</Button>);

        const button = screen.getByRole('button', { name: /button/i });
        await user.click(button);

        expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick handler when disabled', async () => {
        const user = userEvent.setup();
        const handleClick = vi.fn();
        render(
            <Button onClick={handleClick} disabled>
                Button
            </Button>,
        );

        const button = screen.getByRole('button', { name: /button/i });
        await user.click(button);

        expect(handleClick).not.toHaveBeenCalled();
    });

    it('uses primary variant by default', () => {
        render(<Button>Button</Button>);

        const button = screen.getByRole('button', { name: /button/i });
        expect(button).toHaveClass('ui-button--primary');
    });
});
