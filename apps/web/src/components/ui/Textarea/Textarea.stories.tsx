import { useState, useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Textarea } from './Textarea';

const meta: Meta<typeof Textarea> = {
    title: 'UI/Textarea',
    component: Textarea,
    argTypes: {
        value: { control: 'text' },
        onChange: { action: 'change' },
    },
};

export default meta;

type Story = StoryObj<typeof Textarea>;

export const Filled: Story = {
    args: {
        label: 'Description',
        value: 'Lorem ipsum dolor sit ametLorem ipsum dolor sit ametLorem ipsum dolor sit ametLorem ipsum dolor sit ametLorem ipsum dolor sit ametLorem ipsum dolor sit ametLorem ipsum dolor sit ametLorem ipsum dolor sit amet',
    },
    render: (args) => {
        const [value, setValue] = useState(args.value);

        useEffect(() => {
            setValue(args.value);
        }, [args.value]);

        return (
            <Textarea
                label={args.label}
                value={value}
                onChange={(v) => {
                    setValue(v.toString());
                    args.onChange?.(v.toString());
                }}
            />
        );
    },
};
