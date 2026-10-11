import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Textarea } from './Textarea';

describe('Textarea', () => {
    it('renders with label and placeholder', () => {
        render(
            <Textarea
                label="Description"
                placeholder="Enter description here"
            />,
        );
        expect(screen.getByLabelText('Description')).toBeInTheDocument();
        expect(
            screen.getByPlaceholderText('Enter description here'),
        ).toBeInTheDocument();
    });

    it('calls onChange when textarea value changes', async () => {
        const user = userEvent.setup();
        const handleChange = vi.fn();
        render(<Textarea label="Description" onChange={handleChange} />);
        const textarea = screen.getByLabelText('Description');
        await user.type(textarea, 'This is a test description.');
        expect(handleChange).toHaveBeenCalledTimes(27);
        expect(handleChange).toHaveBeenLastCalledWith(
            'This is a test description.',
        );
    });

    it('associates errors with the field and removes them when corrected', () => {
        const { rerender } = render(
            <Textarea
                id="message"
                label="Message"
                error="Message is required"
            />,
        );
        const textarea = screen.getByRole('textbox', { name: 'Message' });
        expect(textarea).toHaveAttribute('aria-invalid', 'true');
        expect(textarea).toHaveAccessibleDescription('Message is required');
        expect(textarea).toHaveAttribute('aria-describedby', 'message-error');
        rerender(<Textarea id="message" label="Message" />);
        expect(textarea).toHaveAttribute('aria-invalid', 'false');
        expect(textarea).not.toHaveAttribute('aria-describedby');
    });

    it('prevents editing and callbacks while disabled', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const onInput = vi.fn();
        render(
            <Textarea
                label="Message"
                disabled
                defaultValue="Draft"
                onChange={onChange}
                onInput={onInput}
            />,
        );
        await user.type(
            screen.getByRole('textbox', { name: 'Message' }),
            'ignored',
        );
        expect(screen.getByRole('textbox')).toHaveValue('Draft');
        expect(onChange).not.toHaveBeenCalled();
        expect(onInput).not.toHaveBeenCalled();
    });
});
