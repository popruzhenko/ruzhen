import type { ButtonProps } from './TypesButton';
import { classesJoined } from '../Utils/classesJoined';
import './Button.scss';

export const Button: React.FC<ButtonProps> = ({
    variants = 'primary',
    leftIcon,
    disabled,
    children,
    className,
    ...rest
}) => {
    const classes = classesJoined([
        'ui-button',
        `ui-button--${variants}`,
        disabled ? 'ui-button--disabled' : '',
        className,
    ]);

    return (
        <button className={classes} disabled={disabled} {...rest}>
            {leftIcon && <span className="ui-button__icon">{leftIcon}</span>}
            <span className="ui-button__text">{children}</span>
        </button>
    );
};
