export type DropDownType = 'default' | 'account_menu';

export type AccountMenuVariant = 'admin' | 'user';

export interface DropDownOption {
    value: string;
    label: string;
    onClick?: () => void;
}

export interface DropDownProps {
    options: DropDownOption[];
    label?: string;
    value?: string;
    defaultValue?: string;
    type?: DropDownType;
    accountVariant?: AccountMenuVariant;
    onChange?: (value: string) => void;
    disabled?: boolean;
    className?: string;
}