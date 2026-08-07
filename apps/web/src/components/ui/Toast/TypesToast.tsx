export type ToastType = 'success' | 'error' | 'warning' | 'info';

export type ToastPosition = 'top' | 'bottom';

export interface ToastItem {
    id: string;
    type: ToastType;
    title?: string;
    message: string;
    autoCloseMs?: number;
}

export interface ToastProps {
    toast: ToastItem;
    onClose: (toastId: string) => void;
}

export interface ToastProviderProps {
    children: React.ReactNode;
    position?: ToastPosition;
}

export interface ShowToastInput {
    type?: ToastType;
    title?: string;
    message: string;
    autoCloseMs?: number;
}

export interface ToastContextValue {
    showToast: (toast: ShowToastInput) => void;
    closeToast: (toastId: string) => void;
}