export type ConfirmModalVariant = 'default' | 'warning' | 'danger';

export interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: ConfirmModalVariant;
    isLoading?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}
