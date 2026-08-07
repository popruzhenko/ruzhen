import type { Meta, StoryObj } from '@storybook/react';

import { ClusterBlock } from './ClusterBlock';

const meta: Meta<typeof ClusterBlock> = {
    title: 'UI/ClusterBlock',
    component: ClusterBlock,
    args: {
        id: 'cluster-block-story',
    },
};

export default meta;

type Story = StoryObj<typeof ClusterBlock>;

export const Fact: Story = {
    args: {
        id: 'fact-block',
        type: 'fact',
        title: 'New sanctions discussed',
        content:
            'EU officials are proposing a new set of sanctions to increase pressure.',
        sourceName: 'Reuters',
        sourceUrl: 'https://www.reuters.com',
    },
};

export const Context: Story = {
    args: {
        id: 'context-block',
        type: 'context',
        title: 'Background on sanctions',
        content:
            'The EU has previously imposed sanctions on Russia over the Ukraine crisis. The new proposal follows several rounds of diplomatic talks.',
        sourceName: 'BBC',
        sourceUrl: 'https://www.bbc.com',
    },
};

export const Opinion: Story = {
    args: {
        id: 'opinion-block',
        type: 'opinion',
        title: 'Mixed reactions to sanctions',
        content:
            'Some member states worry additional sanctions could harm EU economies, while others argue that stronger pressure is necessary.',
        sourceName: 'Politico',
        sourceUrl: 'https://www.politico.eu',
    },
};

export const OpinionPro: Story = {
    args: {
        id: 'opinion-pro-block',
        type: 'opinion',
        title: 'Supporters argue sanctions are necessary',
        content:
            'Supporters say additional sanctions could limit the target country’s ability to finance further escalation.',
        sourceName: 'Financial Times',
        sourceUrl: 'https://www.ft.com',
    },
};

export const OpinionContra: Story = {
    args: {
        id: 'opinion-contra-block',
        type: 'opinion',
        title: 'Critics warn about economic side effects',
        content:
            'Critics argue that additional sanctions could increase costs for European companies and consumers.',
        sourceName: 'The Guardian',
        sourceUrl: 'https://www.theguardian.com',
    },
};

export const WithoutSource: Story = {
    args: {
        id: 'without-source-block',
        type: 'fact',
        title: 'No source attached',
        content:
            'This block demonstrates how the component looks when sourceName and sourceUrl are not provided.',
    },
};

export const SourceWithoutUrl: Story = {
    args: {
        id: 'source-without-url-block',
        type: 'context',
        title: 'Source without URL',
        content:
            'This block demonstrates how the component renders a source name without a clickable source URL.',
        sourceName: 'Internal editorial note',
    },
};

export const LongContent: Story = {
    args: {
        id: 'long-content-block',
        type: 'context',
        title: 'Long contextual explanation',
        content:
            'This is a longer contextual block used to check spacing, line height, and readability. The component should remain visually balanced even when the text spans several lines. This is important for Ruzhen because contextual blocks may contain compact but information-dense explanations.',
        sourceName: 'Associated Press',
        sourceUrl: 'https://apnews.com',
    },
};

export const All: Story = {
    render: () => (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                maxWidth: 680,
            }}
        >
            <ClusterBlock
                id="all-fact-block"
                type="fact"
                title="New sanctions discussed"
                content="EU officials are proposing a new set of sanctions to increase pressure."
                sourceName="Reuters"
                sourceUrl="https://www.reuters.com"
            />

            <ClusterBlock
                id="all-context-block"
                type="context"
                title="Background on sanctions"
                content="The EU has previously imposed sanctions on Russia over the Ukraine crisis. The new proposal follows several rounds of diplomatic talks."
                sourceName="BBC"
                sourceUrl="https://www.bbc.com"
            />

            <ClusterBlock
                id="all-opinion-pro-block"
                type="opinion"
                title="Supporters argue sanctions are necessary"
                content="Supporters say additional sanctions could limit the target country’s ability to finance further escalation."
                sourceName="Financial Times"
                sourceUrl="https://www.ft.com"
            />

            <ClusterBlock
                id="all-opinion-contra-block"
                type="opinion"
                title="Critics warn about economic side effects"
                content="Critics argue that additional sanctions could increase costs for European companies and consumers."
                sourceName="The Guardian"
                sourceUrl="https://www.theguardian.com"
            />

            <ClusterBlock
                id="all-opinion-neutral-block"
                type="opinion"
                title="Analysts describe mixed reactions"
                content="Analysts describe the debate as divided between strategic pressure and concern about domestic economic consequences."
                sourceName="Politico"
                sourceUrl="https://www.politico.eu"
            />
        </div>
    ),
};
