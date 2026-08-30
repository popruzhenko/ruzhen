export type ModalProps = {
    isOpen: boolean;
    title?: string;
    interactiveBlock?: React.ReactNode;
    children: React.ReactNode;
    onClose: () => void;
    closeOnOverlayClick?: boolean;
    closeOnEsc?: boolean;
    className?: string;
    contentClassName?: string;
};
