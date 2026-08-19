import type { TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    'onChange'
> {
    label?: string;
    requiredMark?: boolean;
    error?: string;
    maxHeight?: number;
    onChange?: (value: string) => void;
}
