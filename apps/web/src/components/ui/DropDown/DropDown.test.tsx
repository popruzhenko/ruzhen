import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DropDown } from './DropDown';

const options = [
    { value: 'option1', label: 'Option 1' },
    { value: 'option2', label: 'Option 2' },
    { value: 'option3', label: 'Option 3' },
];

describe('DropDown', () => {
    it('renders with label and default value', () => {
        render(
            <DropDown
                label="Test DropDown"
                options={options}
                defaultValue="option1"
            />,
        );
        const label = screen.getByText('Test DropDown');
        const selectedOption = screen.getByText('Option 1');
        expect(label).toBeInTheDocument();
        expect(selectedOption).toBeInTheDocument();
    });

    it('opens and closes the dropdown on click', async () => {
        const user = userEvent.setup();
        render(<DropDown label="Test DropDown" options={options} />);
        const trigger = screen.getByRole('button');
        await user.click(trigger);
        expect(screen.getByRole('listbox')).toBeInTheDocument();
        await user.click(trigger);
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('selects an option and updates the displayed value', async () => {
        const user = userEvent.setup();
        render(<DropDown label="Test DropDown" options={options} />);
        const trigger = screen.getByRole('button');
        await user.click(trigger);
        const optionToSelect = screen.getByText('Option 2');
        await user.click(optionToSelect);
        const selectedOption = within(trigger).getByText('Option 2');
        expect(selectedOption).toBeInTheDocument();
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('does not open when disabled', async () => {
        const user = userEvent.setup();
        render(<DropDown label="Test DropDown" options={options} disabled />);
        const trigger = screen.getByRole('button');
        await user.click(trigger);
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
});
