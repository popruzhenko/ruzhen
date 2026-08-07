import type { TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    'onChange'
> {
    label?: string;
    requiredMark?: boolean;
    error?: string;
    onChange?: (value: string) => void;
}
