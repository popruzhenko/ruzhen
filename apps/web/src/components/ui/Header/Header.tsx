import './Header.scss';

import { Link as RouterLink, useNavigate } from 'react-router-dom';

import { classesJoined } from '../Utils/classesJoined';
import { type HeaderProps } from './TypesHeader';
import { DropDown } from '../DropDown/DropDown';
import { clearAuthData } from '../../../features/auth/lib/authStorage';
import { logoutRequest } from '../../../features/auth/api/authApi';
import { Button } from '../Button/Button';
import { USER_ROLE } from '../../../features/auth/lib/authConstants';

export const Header = ({
    variant = 'public',
    navItems = [],
    userName = USER_ROLE.USER,
    onLoginClick,
    className,
}: HeaderProps) => {
    const navigate = useNavigate();

    async function handleLogout() {
        try {
            await logoutRequest();
        } catch (error) {
            console.error('Logout failed:', error);
        } finally {
            clearAuthData();
            navigate('/login', { replace: true });
        }
    }

    function handleLoginClick() {
        if (onLoginClick) {
            onLoginClick();
            return;
        }

        navigate('/login');
    }

    function handleDashboard() {
        navigate('/admin/raw-news');
    }

    function handleProfile() {
        if (variant === 'admin') {
            navigate('/admin/profile');
            return;
        }

        navigate('/user/profile');
    }

    function handleSettings() {
        if (variant === 'admin') {
            navigate('/admin/settings');
            return;
        }

        navigate('/user/settings');
    }

    const accountOptions = [
        ...(variant === 'admin'
            ? [
                  {
                      value: 'dashboard',
                      label: 'Dashboard',
                      onClick: handleDashboard,
                  },
              ]
            : []),
        {
            value: 'profile',
            label: 'Profile',
            onClick: handleProfile,
        },
        {
            value: 'settings',
            label: 'Settings',
            onClick: handleSettings,
        },
        {
            value: 'logout',
            label: 'Logout',
            onClick: handleLogout,
        },
    ];

    const brandTo =
        variant === 'admin'
            ? '/admin/raw-news'
            : variant === 'user'
              ? '/user'
              : '/';

    return (
        <header
            className={classesJoined([
                'ui-header',
                `ui-header--${variant}`,
                className,
            ])}
        >
            {variant === 'admin' && <div className="ui-header__empty-block" />}

            <div className="ui-header__inner">
                <div className="ui-header__left">
                    <strong className="ui-header__brand">
                        <RouterLink
                            to={brandTo}
                            className="ui-header__brand-link"
                        >
                            <span className="ui-header__brand-text">
                                RUZHEN
                            </span>
                        </RouterLink>
                    </strong>
                </div>

                <nav className="ui-header__nav" aria-label="Main navigation">
                    <ul className="ui-header__nav-list">
                        {navItems.map((item) => {
                            const navClassName = classesJoined([
                                'ui-header__nav-link',
                                item.isActive && 'ui-header__nav-link--active',
                            ]);

                            return (
                                <li
                                    key={item.label}
                                    className="ui-header__nav-item"
                                >
                                    {item.to && (
                                        <RouterLink
                                            to={item.to}
                                            className={navClassName}
                                        >
                                            {item.label}
                                        </RouterLink>
                                    )}

                                    {item.href && (
                                        <a
                                            href={item.href}
                                            className={navClassName}
                                        >
                                            {item.label}
                                        </a>
                                    )}

                                    {!item.to && !item.href && (
                                        <Button
                                            type="button"
                                            className={navClassName}
                                            onClick={item.onClick}
                                        >
                                            {item.label}
                                        </Button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                <div className="ui-header__right">
                    {variant === 'public' && (
                        <Button
                            type="button"
                            className="ui-header__login-button"
                            onClick={handleLoginClick}
                        >
                            Log in
                        </Button>
                    )}

                    {(variant === 'user' || variant === 'admin') && (
                        <DropDown
                            type="account_menu"
                            accountVariant={
                                variant === 'admin' ? 'admin' : 'user'
                            }
                            label={userName}
                            options={accountOptions}
                        />
                    )}
                </div>
            </div>
        </header>
    );
};
