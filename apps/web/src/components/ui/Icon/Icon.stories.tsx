import type { Meta, StoryObj } from '@storybook/react';
import { Icon } from './Icon';
import { ICON_NAMES } from './UtilsIcon';

const meta: Meta<typeof Icon> = {
    title: 'UI/Icon',
    component: Icon,
    args: {
        size: 16,
        color: 'default',
    },
};

export default meta;

type Story = StoryObj<typeof Icon>;

export const Gallery: Story = {
    args: {
        name: 'cart',
    },

    render: (args) => (
        <div className="icons-display">
            {ICON_NAMES.map((name) => (
                <div
                    key={name}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '15px',
                    }}
                >
                    <Icon {...args} name={name} />
                </div>
            ))}
        </div>
    ),
};

export const SingleIcon: Story = {
    args: {
        name: 'chevron-left',
    },
};
