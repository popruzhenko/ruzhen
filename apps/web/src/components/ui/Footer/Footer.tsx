import { Link as RouterLink } from 'react-router-dom';

import { classesJoined } from '../Utils/classesJoined';

import type { FooterLinkItem, FooterProps } from './TypesFooter';

import './Footer.scss';

const createFooterLinks = (basePath: '' | '/user'): FooterLinkItem[] => [
    {
        label: 'Articles',
        to: basePath ? '/user' : '/articles',
    },
    {
        label: 'About',
        to: `${basePath}/about`,
    },
    {
        label: 'Contact',
        to: `${basePath}/contact`,
    },
    {
        label: 'Privacy Policy',
        to: `${basePath}/privacy`,
    },
];

export const Footer = ({ className, basePath = '' }: FooterProps) => {
    const currentYear = new Date().getFullYear();
    const footerLinks = createFooterLinks(basePath);

    return (
        <footer className={classesJoined(['ui-footer', className])}>
            <div className="ui-footer__inner">
                <div className="ui-footer__brand">
                    <RouterLink
                        to={basePath ? '/user' : '/'}
                        className="ui-footer__logo"
                    >
                        Ruzhen
                    </RouterLink>

                    <p>
                        Structured news intelligence with facts, context and
                        opinions separated.
                    </p>
                </div>

                <nav
                    className="ui-footer__nav"
                    aria-label="Footer navigation"
                >
                    {footerLinks.map((link) => (
                        <RouterLink key={link.to} to={link.to}>
                            {link.label}
                        </RouterLink>
                    ))}
                </nav>

                <div className="ui-footer__bottom">
                    <span>© {currentYear} Ruzhen.</span>
                    <span>Built for clearer reading.</span>
                </div>
            </div>
        </footer>
    );
};