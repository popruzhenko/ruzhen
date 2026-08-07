import './Tag.scss';
import { classesJoined } from '../Utils/classesJoined';
import { type TagProps } from './TypesTag';

export const Tag: React.FC<TagProps> = 
({ 
    children, 
    onClick,
    className 
}) => {
    const classes = classesJoined([
        'ui-tag',
        onClick ? 'ui-tag--active' : '',
        className,
    ]);

    const clickHandler = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (onClick) {
            e.stopPropagation();
            onClick();
        }
    };

    return (
        onClick ? (
            <button className={classes} onClick={clickHandler} type="button">
                {children}
            </button>
        ) : (
            <div className={classes}>
                {children}
            </div>
        )
    );
};