import type { IconName } from './TypesIcon';
import { CartIcon } from './icons/Cart';
import { CheckIcon } from './icons/Check';
import { CheckboxFillIcon } from './icons/CheckboxFill';
import { CheckboxLineIcon } from './icons/CheckboxLine';
import { ChevronDownIcon } from './icons/ChevronDown';
import { ChevronRightIcon } from './icons/ChevronRight';
import { ChevronLeftIcon } from './icons/ChevronLeft';
import { ChevronUpIcon } from './icons/ChevronUp';
import { CloseIcon } from './icons/Close';
import { DefaultIcon } from './icons/Default';
import { DeleteIcon } from './icons/Delete';
import { DownSmallIcon } from './icons/DownSmall';
import { EditIcon } from './icons/Edit';
import { EyeIcon } from './icons/Eye';
import { OpenEyeIcon } from './icons/OpenEye';
import { GoogleIcon } from './icons/Google';
import { InfoIcon } from './icons/Info';
import { LogoutIcon } from './icons/Logout';
import { MinusIcon } from './icons/Minus';
import { PauseIcon } from './icons/Pause';
import { PlayIcon } from './icons/Play';
import { PlusIcon } from './icons/Plus';
import { TrashIcon } from './icons/Trash';
import { TruckIcon } from './icons/Truck';
import { UserIcon } from './icons/User';
import { ColorIcon } from './icons/Color';
import { ColorSelectedIcon } from './icons/ColorSelected';

export const ICONS: Record<
    IconName,
    React.FC<{ size?: number; color?: string }>
> = {
    cart: CartIcon,
    check: CheckIcon,
    'checkbox-fill': CheckboxFillIcon,
    'checkbox-line': CheckboxLineIcon,
    'chevron-down': ChevronDownIcon,
    'chevron-right': ChevronRightIcon,
    'chevron-left': ChevronLeftIcon,
    'chevron-up': ChevronUpIcon,
    close: CloseIcon,
    default: DefaultIcon,
    delete: DeleteIcon,
    'down-small': DownSmallIcon,
    edit: EditIcon,
    eye: EyeIcon,
    'open-eye': OpenEyeIcon,
    google: GoogleIcon,
    info: InfoIcon,
    logout: LogoutIcon,
    minus: MinusIcon,
    pause: PauseIcon,
    play: PlayIcon,
    plus: PlusIcon,
    trash: TrashIcon,
    truck: TruckIcon,
    user: UserIcon,
    color: ColorIcon,
    'color-selected': ColorSelectedIcon,
};

export const ICON_NAMES: IconName[] = [
    'cart',
    'check',
    'checkbox-fill',
    'checkbox-line',
    'chevron-down',
    'chevron-right',
    'chevron-left',
    'chevron-up',
    'close',
    'default',
    'delete',
    'down-small',
    'edit',
    'eye',
    'open-eye',
    'google',
    'info',
    'logout',
    'minus',
    'pause',
    'play',
    'plus',
    'trash',
    'truck',
    'user',
    'color',
    'color-selected',
];
