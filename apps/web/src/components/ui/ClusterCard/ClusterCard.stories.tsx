import type { Meta, StoryObj } from '@storybook/react';
import { ClusterCard } from './ClusterCard';

const meta: Meta<typeof ClusterCard> = {
    title: 'UI/ClusterCard',
    component: ClusterCard,
    args: {
        title: 'Trump says new tariff plan will strengthen US manufacturing',
        summary:
        'The proposal includes expanded tariffs on selected imports, while critics argue it may raise prices and increase pressure on supply chains.',
        tags: [ {children: 'Politics', onClick: () => console.log('Politics clicked!')}, 
                {children: 'Economy', onClick: () => console.log('Economy clicked!')}, 
                {children: 'US', onClick: () => console.log('US clicked!')}
            ],
        badges: ['fact', 'context', 'opinion'],
        publishedAt: '2026-04-07',
        country: 'USA',
        opinions: {
            pro: 12,
            contra: 7,
            neutral: 3,
        },  
    },
    argTypes: {
        onClick: { action: 'clicked' },
    },
};

export default meta;

type Story = StoryObj<typeof ClusterCard>;

export const Default: Story = {};


export const WithImage: Story = {
    args: {
        imageUrl:
        'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?auto=format&fit=crop&w=1200&q=80',
    },
};

export const Minimal: Story = {
    args: {
        title: 'European leaders meet to discuss energy security',
        summary: 'A short summary of the cluster event.',
        tags: [{children: 'Europe'}],
        badges: ['fact'],
        opinions: undefined,
    },
};