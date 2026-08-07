export type IconName =
    | 'cart'
    | 'check'
    | 'checkbox-fill'
    | 'checkbox-line'
    | 'chevron-down'
    | 'chevron-right'
    | 'chevron-left'
    | 'chevron-up'
    | 'close'
    | 'default'
    | 'delete'
    | 'down-small'
    | 'edit'
    | 'eye'
    | 'open-eye'
    | 'google'
    | 'info'
    | 'logout'
    | 'minus'
    | 'pause'
    | 'play'
    | 'plus'
    | 'trash'
    | 'truck'
    | 'user'
    | 'color'
    | 'color-selected';

export type IconProps = {
    name: IconName;
    size?: number;
    color?: string | undefined;
    className?: string;
};
