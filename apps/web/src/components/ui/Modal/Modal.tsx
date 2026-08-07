    import { useEffect } from 'react';
    import { createPortal } from 'react-dom';
    import { Icon } from '../Icon/Icon';
    import type { ModalProps } from './TypesModal';
    import { classesJoined } from '../Utils/classesJoined';
    import './Modal.scss';

    const useLockBodyScroll = (isLocked: boolean) => {
        useEffect(() => {
            if (isLocked) {
                const originalStyle = window.getComputedStyle(
                    document.body,
                ).overflow;
                document.body.style.overflow = 'hidden';
                return () => {
                    document.body.style.overflow = originalStyle;
                };
            }
        }, [isLocked]);
    };

    export const Modal: React.FC<ModalProps> = ({
        isOpen,
        title,
        interactiveBlock,
        children,
        onClose,
        closeOnOverlayClick,
        closeOnEsc,
        className,
        contentClassName,
    }) => {
        useLockBodyScroll(isOpen);

        useEffect(() => {
            if (!isOpen || !closeOnEsc) return;

            const onKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    onClose();
                }
            };

            window.addEventListener('keydown', onKeyDown);

            return () => {
                window.removeEventListener('keydown', onKeyDown);
            };
        }, [isOpen, closeOnEsc, onClose]);

        if (!isOpen) return null;

        const overlayClasses = classesJoined(['ui-modal__overlay', className]);

        const contentClasses = classesJoined([
            'ui-modal__content',
            contentClassName,
        ]);

        const handleOverlayMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
            if (!closeOnOverlayClick) return;

            if (e.target === e.currentTarget) {
                onClose();
            }
        };

        const modal = (
            <div
                className={overlayClasses}
                onMouseDown={handleOverlayMouseDown}
                role="presentation"
            >
                <div
                    className={contentClasses}
                    role="dialog"
                    aria-modal="true"
                    aria-label={title ? title : 'Modal Dialog'}
                >
                    <div className="ui-modal__header">
                        {title && <h2 className="ui-modal__title">{title}</h2>}
                        <button
                            type="button"
                            className="ui-modal__close-button"
                            onClick={onClose}
                            aria-label="Close Modal"
                        >
                            <Icon name="close" size={16} />
                        </button>
                    </div>

                    <div className="ui-modal__body">{children}</div>

                    {interactiveBlock && (
                        <div className="ui-modal__footer">
                            {interactiveBlock}
                        </div>
                    )}
                </div>
            </div>
        );

        return createPortal(modal, document.body);
    };
