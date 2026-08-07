import type { Meta, StoryObj } from '@storybook/react';
import { SignUp } from './SignUp';
import { MemoryRouter } from 'react-router-dom';

const meta: Meta<typeof SignUp> = {
    title: 'Pages/SignUp',
    component: SignUp,
    decorators: [
        (Story) => (
            <MemoryRouter>
                <Story />
            </MemoryRouter>
        ),
    ],
};

export default meta;

type Story = StoryObj<typeof SignUp>;

export const Default: Story = {};