export type IconName =
    | 'cart'
    | 'check'
    | 'checkboxFill'
    | 'checkboxLine'
    | 'chevronDown'
    | 'chevronRight'
    | 'chevronLeft'
    | 'chevronUp'
    | 'close'
    | 'default'
    | 'delete'
    | 'downSmall'
    | 'edit'
    | 'eye'
    | 'openEye'
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
    | 'colorSelected';

export type IconProps = {
    name: IconName;
    size?: number;
    color?: string | undefined;
    className?: string;
};
