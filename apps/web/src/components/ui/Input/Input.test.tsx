import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './Input';

describe('Input', () => {
    it('renders with label and placeholder', () => {
        render(<Input label="Username" placeholder="Enter your username" />);
        expect(screen.getByLabelText('Username')).toBeInTheDocument();
        expect(
            screen.getByPlaceholderText('Enter your username'),
        ).toBeInTheDocument();
    });

    it('displays error message when error prop is provided', () => {
        render(<Input label="Username" error="Invalid username" />);
        expect(screen.getByText('Invalid username')).toBeInTheDocument();
    });

    it('calls onChange when input value changes', async () => {
        const user = userEvent.setup();
        const handleChange = vi.fn();
        render(<Input label="Username" onChange={handleChange} />);
        const input = screen.getByLabelText('Username');
        await user.type(input, 'testuser');
        expect(handleChange).toHaveBeenCalledTimes(8);
    });

    it('is disabled when disabled prop is true', () => {
        render(<Input label="Username" disabled />);
        const input = screen.getByLabelText('Username');
        expect(input).toBeDisabled();
    });

    it('shows and hides password when toggle button is clicked', async () => {
        const user = userEvent.setup();
        render(<Input label="Password" type="password" />);
        const input = screen.getByLabelText('Password') as HTMLInputElement;
        const toggleButton = screen.getByRole('button', {});
        expect(input.type).toBe('password');
        await user.click(toggleButton);
        expect(input.type).toBe('text');
        await user.click(toggleButton);
        expect(input.type).toBe('password');
    });
});
