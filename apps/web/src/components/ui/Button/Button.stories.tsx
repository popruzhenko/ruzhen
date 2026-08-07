import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';
import { Icon } from '../Icon/Icon';

const meta: Meta<typeof Button> = {
    title: 'UI/Button',
    component: Button,
    argTypes: {
        onClick: { action: 'clicked' },
    },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
    args: {
        variants: 'primary',
        children: 'Button',
        disabled: false,
    },
};
export const PrimaryWithIcon: Story = {
    args: {
        variants: 'primary',
        children: 'Button',
        leftIcon: <Icon name="play" size={16} />,
        disabled: false,
    },
};
export const Secondary: Story = {
    args: {
        variants: 'secondary',
        children: 'Button',
        disabled: false,
    },
};
export const SecondaryWithIcon: Story = {
    args: {
        variants: 'secondary',
        children: 'Button',
        leftIcon: <Icon name="play" size={16} color="#323749" />,
        disabled: false,
    },
};

export const Ghost: Story = {
    args: {
        variants: 'ghost',
        children: 'Button',
        disabled: false,
    },
};