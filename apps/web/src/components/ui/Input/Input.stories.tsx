import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Input } from './Input';
import { Icon } from '../Icon/Icon';

const meta: Meta<typeof Input> = {
    title: 'UI/Input',
    component: Input,
    args: {
        label: 'Username',
        requiredMark: true,
        placeholder: 'Enter your username',
    },
};

export default meta;

type Story = StoryObj<typeof Input>;

export const Default: Story = {};

export const Filled: Story = {
    args: {
        defaultValue: 'Volodymyr Popruzhenko',
    },
};

export const Active: Story = {
    render: (args) => {
        const [value, setValue] = useState('Volodymyr Popruzhenko');
        return (
            <Input
                {...args}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
            />
        );
    },
    args: {
        defaultValue: 'Volodymyr Popruzhenko',
    },
};

export const Disabled: Story = {
    args: {
        defaultValue: 'Cannot edit this',
        disabled: true,
    },
};

export const Error: Story = {
    args: {
        defaultValue: 'Invalid username',
        error: 'Error message',
    },
};

export const Password: Story = {
    args: {
        label: 'Password',
        requiredMark: true,
        placeholder: 'Enter your password',
        type: 'password',
        rightIcon: <Icon name="eye" size={16} />,
    },
};

export const PasswordFilled: Story = {
    args: {
        label: 'Password',
        requiredMark: true,
        type: 'password',
        defaultValue: 'testpassword123',
        rightIcon: <Icon name="eye" size={16} />,
    },
};
