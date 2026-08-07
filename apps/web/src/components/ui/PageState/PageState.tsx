import { Link as RouterLink } from 'react-router-dom';

import { Button } from '../Button/Button';
import { classesJoined } from '../Utils/classesJoined';

import type { PageStateProps } from './TypesPageState';

import './PageState.scss';

export const PageState = ({
    variant = 'empty',
    eyebrow,
    title,
    description,
    actionLabel,
    actionTo,
    onAction,
    className,
}: PageStateProps) => {
    const hasAction = Boolean(actionLabel && (actionTo || onAction));

    return (
        <section
            className={classesJoined([
                'ui-page-state',
                `ui-page-state--${variant}`,
                className,
            ])}
        >
            <div className="ui-page-state__icon" aria-hidden="true">
                {variant === 'loading' && '…'}
                {variant === 'empty' && '∅'}
                {variant === 'error' && '!'}
                {variant === 'not-found' && '404'}
                {variant === 'unauthorized' && '401'}
                {variant === 'forbidden' && '403'}
            </div>

            {eyebrow && (
                <span className="ui-page-state__eyebrow">
                    {eyebrow}
                </span>
            )}

            <h1 className="ui-page-state__title">
                {title}
            </h1>

            {description && (
                <p className="ui-page-state__description">
                    {description}
                </p>
            )}

            {hasAction && actionTo && (
                <RouterLink
                    to={actionTo}
                    className="ui-page-state__action-link"
                >
                    <Button variants="primary">
                        {actionLabel}
                    </Button>
                </RouterLink>
            )}

            {hasAction && !actionTo && onAction && (
                <Button variants="primary" onClick={onAction}>
                    {actionLabel}
                </Button>
            )}
        </section>
    );
};