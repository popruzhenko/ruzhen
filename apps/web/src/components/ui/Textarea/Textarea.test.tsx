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
    });
});
