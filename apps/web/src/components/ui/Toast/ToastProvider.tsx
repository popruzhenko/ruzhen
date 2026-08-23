import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
} from 'react';
import { createPortal } from 'react-dom';

import { Toast } from './Toast';

import type {
    ShowToastInput,
    ToastContextValue,
    ToastItem,
    ToastProviderProps,
} from './TypesToast';

const ToastContext = createContext<ToastContextValue | null>(null);

const createToastId = () => {
    return crypto.randomUUID();
};

export const ToastProvider = ({
    children,
    position = 'bottom',
}: ToastProviderProps) => {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const closeToast = useCallback((toastId: string) => {
        setToasts((currentToasts) =>
            currentToasts.filter((toast) => toast.id !== toastId),
        );
    }, []);

    const showToast = useCallback((input: ShowToastInput) => {
        const toast: ToastItem = {
            id: createToastId(),
            type: input.type ?? 'info',
            title: input.title,
            message: input.message,
            autoCloseMs: input.autoCloseMs ?? 4000,
        };

        setToasts((currentToasts) => [...currentToasts, toast]);
    }, []);

    const value = useMemo(
        () => ({
            showToast,
            closeToast,
        }),
        [showToast, closeToast],
    );

    const viewport = (
        <div className={`ui-toast__viewport ui-toast__viewport--${position}`}>
            {toasts.map((toast) => (
                <Toast key={toast.id} toast={toast} onClose={closeToast} />
            ))}
        </div>
    );

    return (
        <ToastContext.Provider value={value}>
            {children}
            {createPortal(viewport, document.body)}
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);

    if (!context) {
        throw new Error('useToast must be used inside ToastProvider');
    }

    return context;
};
