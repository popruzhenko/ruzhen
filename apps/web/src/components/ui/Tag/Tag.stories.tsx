import type { Meta, StoryObj } from '@storybook/react';
import { Tag } from './Tag';

const meta: Meta<typeof Tag> = {
    title: 'UI/Tag',
    component: Tag,
    args: {
        children: 'Politics',
    },
    argTypes: {
        onClick: { action: 'clicked' },
    },
};

export default meta;
type Story = StoryObj<typeof Tag>;

export const Default: Story = {};

export const ActiveClickable: Story = {
    args: {
        onClick: () => console.log('Tag clicked!'),
    },
};

export const Group = () => (
    <div style={{ display: 'flex', gap: 8 }}>
        <Tag>Politics</Tag>
        <Tag onClick={() => {}}>Economy</Tag>
        <Tag onClick={() => {}}>War</Tag>
        <Tag>Technology</Tag>
    </div>
);
