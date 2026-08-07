import { useEffect } from 'react';

import { Icon } from '../Icon/Icon';
import { classesJoined } from '../Utils/classesJoined';

import type { ToastProps } from './TypesToast';

import './Toast.css';

export const Toast = ({ toast, onClose }: ToastProps) => {
    const autoCloseMs = toast.autoCloseMs ?? 4000;

    useEffect(() => {
        if (!autoCloseMs) {
            return;
        }

        const timerId = window.setTimeout(() => {
            onClose(toast.id);
        }, autoCloseMs);

        return () => {
            window.clearTimeout(timerId);
        };
    }, [autoCloseMs, onClose, toast.id]);

    const toastClasses = classesJoined([
        'ui-toast',
        `ui-toast--${toast.type}`,
    ]);

    return (
        <div className={toastClasses} role="status" aria-live="polite">
            <div className="ui-toast__indicator" />

            <div className="ui-toast__content">
                {toast.title && (
                    <strong className="ui-toast__title">
                        {toast.title}
                    </strong>
                )}

                <div className="ui-toast__text">{toast.message}</div>
            </div>

            <button
                type="button"
                className="ui-toast__close"
                onClick={() => onClose(toast.id)}
                aria-label="Close toast"
            >
                <Icon name="close" size={16} />
            </button>
        </div>
    );
};