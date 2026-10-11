import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

    it('uses controlled values without changing them until the parent updates', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const { rerender } = render(
            <DropDown options={options} value="option1" onChange={onChange} />,
        );
        await user.click(screen.getByRole('button'));
        await user.click(screen.getByRole('option', { name: 'Option 2' }));
        expect(onChange).toHaveBeenCalledExactlyOnceWith('option2');
        expect(screen.getByRole('button')).toHaveTextContent('Option 1');
        rerender(
            <DropDown options={options} value="option2" onChange={onChange} />,
        );
        expect(screen.getByRole('button')).toHaveTextContent('Option 2');
    });

    it('opens from the keyboard and closes with Escape or an outside click', async () => {
        const user = userEvent.setup();
        render(
            <>
                <DropDown options={options} />
                <button>Outside</button>
            </>,
        );
        await user.tab();
        await user.keyboard('{Enter}');
        const trigger = screen.getByRole('button', {
            name: 'Select an option',
        });
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await user.keyboard('{Escape}');
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await user.click(trigger);
        await user.click(screen.getByRole('button', { name: 'Outside' }));
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('invokes account actions once and closes the menu without selecting a value', async () => {
        const user = userEvent.setup();
        const onAction = vi.fn();
        const onChange = vi.fn();
        render(
            <DropDown
                type="account_menu"
                accountVariant="user"
                label="Reader"
                options={[
                    { value: 'logout', label: 'Logout', onClick: onAction },
                ]}
                onChange={onChange}
            />,
        );
        await user.click(screen.getByRole('button', { name: /Reader Menu/ }));
        await user.click(screen.getByRole('button', { name: 'Logout' }));
        expect(onAction).toHaveBeenCalledOnce();
        expect(onChange).not.toHaveBeenCalled();
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('removes global close listeners when unmounted while open', () => {
        const docRemove = vi.spyOn(document, 'removeEventListener');
        const windowRemove = vi.spyOn(window, 'removeEventListener');
        const { unmount } = render(<DropDown options={options} />);
        fireEvent.click(screen.getByRole('button'));
        unmount();
        expect(docRemove).toHaveBeenCalledWith(
            'mousedown',
            expect.any(Function),
        );
        expect(windowRemove).toHaveBeenCalledWith(
            'keydown',
            expect.any(Function),
        );
    });
});
