import { classesJoined } from '../Utils/classesJoined';
import { LabelMap, type TypesBadgeProps } from './TypesBadge';
import './Badge.scss';

export const Badge: React.FC<TypesBadgeProps> = ({ 
    children, 
    type = 'fact', 
    className,
    ...rest 
}) => {   
    const classes = classesJoined([`ui-badge ui-badge--${type}`, `${className || ''}`]);

    return (
        <div className={classes} {...rest}>
            {children || LabelMap[type]}
        </div>
    );
}