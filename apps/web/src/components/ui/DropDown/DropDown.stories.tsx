import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DropDown } from './DropDown';
import { options } from './UtilsDropDown';

const meta: Meta<typeof DropDown> = {
    title: 'UI/DropDown',
    component: DropDown,
};
export default meta;

type Story = StoryObj<typeof DropDown>;

export const Default: Story = {
    args: {
        options,
        defaultValue: 'Week',
    },
};

export const Controlled: Story = {
    render: (args) => {
        const [value, setValue] = useState('Week');
        return (
            <DropDown {...args} value={value} onChange={(v) => setValue(v)} />
        );
    },
    args: {
        options,
    },
};

export const AcountMenu: Story = {
    args: {
        options,
        type: 'account_menu',
        label: 'User',
    },
};
