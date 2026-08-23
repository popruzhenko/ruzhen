import type { Meta, StoryObj } from '@storybook/react';
import { Header } from './Header';
import { MemoryRouter } from 'react-router-dom';

const meta: Meta<typeof Header> = {
    title: 'UI/Header',
    component: Header,
    decorators: [
        (Story) => (
            <MemoryRouter>
                <Story />
            </MemoryRouter>
        ),
    ],
};

export default meta;

type Story = StoryObj<typeof Header>;

export const Public: Story = {
    args: {
        variant: 'public',
        navItems: [
            { label: 'News', href: '/', isActive: true },
            { label: 'Topics', href: '/topics' },
            { label: 'About', href: '/about' },
        ],
    },
};

export const User: Story = {
    args: {
        variant: 'user',
        userName: 'Vladimir',
        navItems: [
            { label: 'Feed', href: '/', isActive: true },
            { label: 'Saved', href: '/saved' },
            { label: 'Profile', href: '/profile' },
        ],
    },
};

export const Admin: Story = {
    args: {
        variant: 'admin',
        userName: 'admin',
        navItems: [
            { label: 'Dashboard', href: '/dashboard', isActive: true },
            { label: 'Sources', href: '/sources' },
            { label: 'Admin', href: '/admin' },
        ],
    },
};
