export interface DashboardNavItem {
    label: string;
    to: string;
    isActive?: boolean;
    onClick?: () => void;
}

export interface NavigationDashboardProps {
    navItems?: DashboardNavItem[];
    className?: string;
}