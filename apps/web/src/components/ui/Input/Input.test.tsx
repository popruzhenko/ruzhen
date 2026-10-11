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

    it('associates validation messages with the correct field and removes them when corrected', () => {
        const { rerender } = render(
            <Input id="email" label="Email" error="Enter a valid email" />,
        );
        const input = screen.getByRole('textbox', { name: 'Email' });
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(input).toHaveAccessibleDescription('Enter a valid email');
        expect(input).toHaveAttribute('aria-describedby', 'email-error');
        rerender(<Input id="email" label="Email" />);
        expect(input).toHaveAttribute('aria-invalid', 'false');
        expect(input).not.toHaveAttribute('aria-describedby');
        expect(
            screen.queryByText('Enter a valid email'),
        ).not.toBeInTheDocument();
    });

    it('toggles password visibility without submitting its form or losing its value', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();
        render(
            <form onSubmit={onSubmit}>
                <Input label="Password" type="password" defaultValue="secret" />
            </form>,
        );
        await user.click(screen.getByRole('button', { name: 'Show password' }));
        expect(screen.getByLabelText('Password')).toHaveValue('secret');
        expect(screen.getByLabelText('Password')).toHaveAttribute(
            'type',
            'text',
        );
        await user.click(screen.getByRole('button', { name: 'Hide password' }));
        expect(screen.getByLabelText('Password')).toHaveAttribute(
            'type',
            'password',
        );
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('generates independent label associations for fields without explicit IDs', async () => {
        const user = userEvent.setup();
        render(
            <>
                <Input label="First name" />
                <Input label="Last name" />
            </>,
        );
        const first = screen.getByLabelText('First name');
        const last = screen.getByLabelText('Last name');
        expect(first.id).not.toBe(last.id);
        await user.click(screen.getByText('Last name'));
        expect(last).toHaveFocus();
    });
});
