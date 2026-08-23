import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './Badge';

const meta: Meta<typeof Badge> = {
    title: 'UI/Badge',
    component: Badge,
};

export default meta;

type Story = StoryObj<typeof Badge>;

export const Fact: Story = {
    args: { type: 'fact' },
};

export const Context: Story = {
    args: { type: 'context' },
};

export const Opinion: Story = {
    args: { type: 'opinion' },
};

export const Pro: Story = {
    args: { type: 'pro' },
};

export const Contra: Story = {
    args: { type: 'contra' },
};

export const Neutral: Story = {
    args: { type: 'neutral' },
};

export const Other: Story = {
    args: { type: 'other', children: 'Custom Label' },
};

export const New: Story = {
    args: { type: 'new' },
};

export const Raw: Story = {
    args: { type: 'raw' },
};

export const NeedsReview: Story = {
    args: { type: 'needs-review' },
};

export const Reviewed: Story = {
    args: { type: 'reviewed' },
};

export const Approved: Story = {
    args: { type: 'approved' },
};

export const Rejected: Story = {
    args: { type: 'rejected' },
};

export const Embedded: Story = {
    args: { type: 'embedded' },
};

export const Clustered: Story = {
    args: { type: 'clustered' },
};

export const Processing: Story = {
    args: { type: 'processing' },
};

export const Error: Story = {
    args: { type: 'error' },
};

export const Primary: Story = {
    args: { type: 'primary' },
};

export const All = () => (
    <div
        style={{
            display: 'flex',
            gap: 8,
            flexDirection: 'column',
            width: 'max-content',
        }}
    >
        <Badge type="fact" />
        <Badge type="context" />
        <Badge type="opinion" />
        <Badge type="pro" />
        <Badge type="contra" />
        <Badge type="neutral" />
        <Badge type="other">Custom Label</Badge>
        <Badge type="new" />
        <Badge type="raw" />
        <Badge type="needs-review" />
        <Badge type="reviewed" />
        <Badge type="approved" />
        <Badge type="rejected" />
        <Badge type="embedded" />
        <Badge type="clustered" />
        <Badge type="processing" />
        <Badge type="error" />
        <Badge type="done" />
        <Badge type="pending" />
        <Badge type="primary" />
        <Badge type="published" />
        <Badge type="draft" />
        <Badge type="archived" />
    </div>
);
