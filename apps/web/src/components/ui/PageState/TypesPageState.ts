export type PageStateVariant =
    | 'loading'
    | 'empty'
    | 'error'
    | 'not-found'
    | 'unauthorized'
    | 'forbidden';

export interface PageStateProps {
    variant?: PageStateVariant;
    eyebrow?: string;
    title: string;
    description?: string;
    actionLabel?: string;
    actionTo?: string;
    onAction?: () => void;
    className?: string;
}