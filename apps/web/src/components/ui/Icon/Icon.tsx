import type { IconProps } from './TypesIcon';
import { ICONS } from './UtilsIcon';
import { classesJoined } from '../Utils/classesJoined';
import './Icon.css';

export const Icon: React.FC<IconProps> = ({
    name,
    size = 16,
    color,
    className = '',
}) => {
    const SelectedIcon = ICONS[name];
    return (
        <span
            className={classesJoined([
                'ui-icon',
                `ui-icon--${name}`,
                className,
            ])}
        >
            <SelectedIcon size={size} color={color} />
        </span>
    );
};
