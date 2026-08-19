import { useState, useEffect, useRef } from 'react';

import type { DropDownProps } from './TypesDropDown';

import { Icon } from '../Icon/Icon';
import { classesJoined } from '../Utils/classesJoined';

import './DropDown.scss';

export const DropDown: React.FC<DropDownProps> = ({
    options,
    label,
    value,
    type = 'default',
    accountVariant = 'admin',
    defaultValue,
    onChange,
    disabled = false,
    className = '',
}) => {
    const isControlled = value !== undefined;

    const [internalValue, setInternalValue] = useState<string>(
        defaultValue || '',
    );

    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    const currentValue = isControlled ? value! : internalValue;

    const dropdowned = options.find((option) => option.value === currentValue);

    const setValue = (next: string) => {
        if (!isControlled) {
            setInternalValue(next);
        }

        onChange?.(next);
    };

    useEffect(() => {
        if (!open) return;

        const onDocMouseDown = (event: MouseEvent) => {
            const el = rootRef.current;

            if (!el) return;

            if (!el.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        document.addEventListener('mousedown', onDocMouseDown);

        return () => {
            document.removeEventListener('mousedown', onDocMouseDown);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        };

        window.addEventListener('keydown', onKeyDown);

        return () => {
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const isAccountMenu = type === 'account_menu';

    const rootClasses = classesJoined([
        isAccountMenu ? 'ui-account_menu' : 'ui-dropdown',
        isAccountMenu ? `ui-account_menu--${accountVariant}` : '',
        disabled ? 'ui-dropdown--disabled' : '',
        open
            ? isAccountMenu
                ? 'ui-account_menu--open'
                : 'ui-dropdown--open'
            : isAccountMenu
              ? 'ui-account_menu--close'
              : 'ui-dropdown--close',
        className,
    ]);

    const triggerClassName = isAccountMenu
        ? 'ui-account_menu__trigger'
        : 'ui-dropdown__trigger';

    const valueClassName = isAccountMenu
        ? 'ui-account_menu__value'
        : 'ui-dropdown__value';

    const optionsClassName = isAccountMenu
        ? 'ui-account_menu__options'
        : 'ui-dropdown__options';

    const arrowColor =
        isAccountMenu && accountVariant === 'admin' ? '#ffffff' : '#475569';

    return (
        <div className={rootClasses} ref={rootRef}>
            <button
                type="button"
                className={triggerClassName}
                onClick={() => !disabled && setOpen((value) => !value)}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <div className="ui-dropdown__label">{label}</div>

                <div className="ui-dropdown__valueRow">
                    <div className={valueClassName}>
                        {isAccountMenu
                            ? 'Menu'
                            : dropdowned
                              ? dropdowned.label
                              : 'Select an option'}
                    </div>
                </div>

                <Icon
                    name="downSmall"
                    size={18}
                    className="ui-dropdown__arrow"
                    color={arrowColor}
                />
            </button>

            {open && (
                <ul className={optionsClassName} role="listbox">
                    {isAccountMenu
                        ? options.map((option) => {
                              const isDropdowned =
                                  option.value === currentValue;

                              return (
                                  <li
                                      key={option.value}
                                      role="option"
                                      className={classesJoined([
                                          'ui-account_menu__option',
                                          isDropdowned
                                              ? 'ui-account_menu__option--dropdowned'
                                              : '',
                                      ])}
                                      onClick={() => setOpen(false)}
                                  >
                                      {option.onClick ? (
                                          <button
                                              type="button"
                                              onClick={option.onClick}
                                          >
                                              {option.label}
                                          </button>
                                      ) : (
                                          option.label
                                      )}
                                  </li>
                              );
                          })
                        : options.map((option) => {
                              const isDropdowned =
                                  option.value === currentValue;

                              return (
                                  <li
                                      key={option.value}
                                      role="option"
                                      className={classesJoined([
                                          'ui-dropdown__option',
                                          isDropdowned
                                              ? 'ui-dropdown__option--dropdowned'
                                              : '',
                                      ])}
                                      onClick={() => {
                                          setValue(option.value);
                                          setOpen(false);
                                      }}
                                  >
                                      {option.label}
                                  </li>
                              );
                          })}
                </ul>
            )}
        </div>
    );
};
