export type ButtonVariants = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variants?: ButtonVariants;
    leftIcon?: React.ReactNode;
}
