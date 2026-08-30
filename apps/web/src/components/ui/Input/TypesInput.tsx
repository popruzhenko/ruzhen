export type InputProps = Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'size'
> & {
    label?: string;
    requiredMark?: boolean;
    error?: string;
    rightIcon?: React.ReactNode;
};
