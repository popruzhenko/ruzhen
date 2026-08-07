import { useRef, useEffect, useId } from 'react';

import type { TextareaProps } from './TypesTextarea';
import { classesJoined } from '../Utils/classesJoined';

import './Textarea.scss';

export const Textarea: React.FC<TextareaProps> = ({
    label,
    requiredMark = false,
    error,
    className,
    id,
    onInput,
    onChange,
    disabled,
    ...rest
}) => {
    const textareaId = id ?? useId();
    const ref = useRef<HTMLTextAreaElement>(null);

    const autoResize = () => {
        const el = ref.current;

        if (!el) return;

        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    };

    useEffect(() => {
        autoResize();
    }, [rest.value, rest.defaultValue]);

    const rootClasses = classesJoined([
        'ui-textarea',
        disabled ? 'ui-textarea--disabled' : '',
        error ? 'ui-textarea--error' : '',
        className,
    ]);

    return (
        <div className={rootClasses}>
            {label && (
                <label htmlFor={textareaId} className="ui-textarea__label">
                    {label}

                    {requiredMark && (
                        <span className="ui-textarea__required-mark">*</span>
                    )}
                </label>
            )}

            <textarea
                ref={ref}
                id={textareaId}
                className="ui-textarea__field"
                disabled={disabled}
                aria-invalid={!!error}
                aria-describedby={error ? `${textareaId}-error` : undefined}
                onInput={(event) => {
                    autoResize();
                    onInput?.(event);
                }}
                onChange={(event) => {
                    onChange?.(event.target.value);
                }}
                {...rest}
            />

            <div
                className={
                    error
                        ? 'ui-textarea__error-box-field'
                        : 'ui-textarea__error-box'
                }
            >
                {error && (
                    <div
                        id={`${textareaId}-error`}
                        className="ui-textarea__error"
                    >
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
};