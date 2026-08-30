export type HeaderVariant = 'public' | 'user' | 'admin';

export interface HeaderNavItem {
    label: string;
    href?: string;
    to?: string;
    isActive?: boolean;
    onClick?: () => void;
}

export interface HeaderProps {
    variant?: HeaderVariant;
    navItems?: HeaderNavItem[];
    userName?: string;
    onLoginClick?: () => void;
    className?: string;
}
