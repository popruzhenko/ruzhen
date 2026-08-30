import { useId, useState } from 'react';
import type { InputProps } from './TypesInput';
import { Icon } from '../Icon/Icon';
import { classesJoined } from '../Utils/classesJoined';
import './Input.scss';

export const Input: React.FC<InputProps> = ({
    label,
    requiredMark = false,
    error,
    rightIcon,
    disabled,
    className,
    id,
    ...rest
}) => {
    const inputId = id ?? useId();
    const hasValue =
        typeof rest.value === 'string'
            ? rest.value.length > 0
            : typeof rest.defaultValue === 'string'
              ? rest.defaultValue.length > 0
              : false;

    const rootClasses = classesJoined([
        'ui-input',
        disabled ? 'ui-input--disabled' : '',
        error ? 'ui-input--error' : '',
        hasValue ? 'ui-input--has-value' : '',
        className,
    ]);

    const isPassword = rest.type === 'password';
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const type_ = isPassword
        ? isPasswordVisible
            ? 'text'
            : 'password'
        : rest.type;

    const togglePass = () => {
        if (!isPassword) return;
        setIsPasswordVisible((v) => !v);
    };

    return (
        <div className={rootClasses}>
            {label && (
                <label htmlFor={inputId} className="ui-input__label">
                    {label}
                    {requiredMark && (
                        <span className="ui-input__required-mark">*</span>
                    )}
                </label>
            )}

            <div className="ui-input__control">
                <input
                    id={inputId}
                    className="ui-input__field"
                    disabled={disabled}
                    aria-invalid={!!error}
                    aria-describedby={error ? `${inputId}-error` : undefined}
                    {...rest}
                    type={type_}
                />
                {isPassword && (
                    <button
                        type="button"
                        className="ui-input__icon"
                        onClick={togglePass}
                        aria-label={
                            isPasswordVisible
                                ? 'Hide password'
                                : 'Show password'
                        }
                    >
                        {
                            <Icon
                                name={isPasswordVisible ? 'openEye' : 'eye'}
                                size={16}
                            ></Icon>
                        }
                    </button>
                )}
            </div>

            <div
                className={
                    error ? 'ui-input__error-box-field' : 'ui-input__error-box'
                }
            >
                {error && (
                    <div id={`${inputId}-error`} className="ui-input__error">
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
};
