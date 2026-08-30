import type { PolymorphicLinkProps } from './TypesLink';
import { classesJoined } from '../Utils/classesJoined';
import './Link.scss';

export const Link = <C extends React.ElementType = 'a'>(
    props: PolymorphicLinkProps<C>,
) => {
    const { as, disabled = true, className, children, ...rest } = props;

    const classes = classesJoined([
        'ui-link',
        disabled && 'ui-link--disabled',
        className,
    ]);

    const Component = as ?? 'a';

    return !disabled ? (
        <Component className={classes} {...rest}>
            {children}
        </Component>
    ) : (
        <span className={classes}>{children}</span>
    );
};
