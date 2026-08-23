import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Toast } from './Toast';
import { Button } from '../Button/Button';

const meta: Meta<typeof Toast> = {
    title: 'UI/Toast',
    component: Toast,
    args: {
        message: 'Event deleted',
        position: 'bottom',
    },
};

export default meta;

type Story = StoryObj<typeof Toast>;

export const Default: Story = {
    render: (args) => {
        const [open, setOpen] = useState(false);

        return (
            <div>
                <Button onClick={() => setOpen(true)}>Show Toast</Button>
                <Toast {...args} open={open} onClose={() => setOpen(false)} />
            </div>
        );
    },
};

export const AutoClose: Story = {
    render: (args) => {
        const [open, setOpen] = useState(false);

        return (
            <div>
                <Button onClick={() => setOpen(true)}>
                    Show Auto-Close Toast
                </Button>
                <Toast
                    {...args}
                    open={open}
                    onClose={() => setOpen(false)}
                    autoCloseMs={3000}
                />
            </div>
        );
    },
};

export const TopPosition: Story = {
    render: (args) => {
        const [open, setOpen] = useState(false);

        return (
            <div>
                <Button onClick={() => setOpen(true)}>Show Top Toast</Button>
                <Toast
                    {...args}
                    open={open}
                    onClose={() => setOpen(false)}
                    position="top"
                />
            </div>
        );
    },
};
