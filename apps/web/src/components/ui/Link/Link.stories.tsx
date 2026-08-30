import type { Meta, StoryObj } from '@storybook/react';
import { Link } from './Link';
import { MemoryRouter, Link as RRLink } from 'react-router-dom';

const meta: Meta<typeof Link> = {
    title: 'UI/Link',
    component: Link,
    decorators: [
        (Story) => (
            <MemoryRouter initialEntries={['/']}>
                <Story />
            </MemoryRouter>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof Link>;

export const RouterLink: Story = {
    args: {
        as: RRLink,
        to: '/',
        children: 'Link',
        disabled: false,
    },
};

export const Default: Story = {
    args: {
        href: '#',
        children: 'Link',
        disabled: false,
    },
};

export const DisabledLink: Story = {
    args: {
        href: '#',
        children: 'Link',
        disabled: true,
    },
};
