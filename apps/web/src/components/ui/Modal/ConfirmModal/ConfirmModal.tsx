import { Modal } from '../Modal';
import { Button } from '../../Button/Button';

import type { ConfirmModalProps } from './TypesConfirmModal';

import './ConfirmModal.scss';

export const ConfirmModal = ({
    isOpen,
    title,
    description,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'default',
    isLoading = false,
    onConfirm,
    onCancel,
}: ConfirmModalProps) => {
    return (
        <Modal
            isOpen={isOpen}
            title={title}
            onClose={onCancel}
            closeOnEsc={!isLoading}
            closeOnOverlayClick={!isLoading}
            contentClassName="confirm_modal"
            interactiveBlock={
                <div className="confirm_modal__actions">
                    <Button
                        type="button"
                        variants="secondary"
                        onClick={onCancel}
                        disabled={isLoading}
                    >
                        {cancelLabel}
                    </Button>

                    <Button
                        type="button"
                        variants={variant === 'danger' ? 'secondary' : 'primary'}
                        onClick={onConfirm}
                        disabled={isLoading}
                    >
                        {isLoading ? 'Processing...' : confirmLabel}
                    </Button>
                </div>
            }
        >
            <p className="confirm_modal__description">{description}</p>
        </Modal>
    );
};