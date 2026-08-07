import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Modal } from './Modal';
import { Button } from '../Button/Button';

const meta: Meta<typeof Modal> = {
    title: 'UI/Modal',
    component: Modal,
    args: {
        title: 'Title',
        isOpen: true,
    },
};

export default meta;

type Story = StoryObj<typeof Modal>;

export const Default: Story = {
    render: (args) => {
        const [open, setOpen] = useState(true);

        return (
            <>
                <Button onClick={() => setOpen(true)}>Open Modal</Button>
                <Modal {...args} isOpen={open} onClose={() => setOpen(false)}>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed
                    do eiusmod tempor incididunt ut labore et dolore magna
                    aliqua. Ut enim ad minim veniam, quis nostrud exercitation
                    ullamco laboris nisi ut aliquip ex ea commodo consequat.
                    Duis aute irure dolor in reprehenderit in voluptate velit
                    esse cillum dolore eu fugiat nulla pariatur.
                </Modal>
            </>
        );
    },
};
