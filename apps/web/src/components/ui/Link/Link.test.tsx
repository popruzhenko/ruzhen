import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Link as RRLink, useLocation } from 'react-router-dom';
import { Link } from './Link';

describe('Link', () => {
    it('renders with text and href', () => {
        render(
            <MemoryRouter>
                <Link to="https://example.com" as={RRLink} disabled={false}>
                    Example
                </Link>
            </MemoryRouter>,
        );
        const linkElement = screen.getByText('Example');
        expect(linkElement).toBeInTheDocument();
        expect(linkElement).toHaveAttribute('href', 'https://example.com');
    });

    it('not open if disabled', () => {
        render(
            <MemoryRouter>
                <Link to="https://example.com" as={RRLink} disabled={true}>
                    Example
                </Link>
            </MemoryRouter>,
        );
        const linkElement = screen.getByText('Example');
        expect(linkElement).toBeInTheDocument();
        expect(linkElement).not.toHaveAttribute('href', 'https://example.com');
    });

    it('preserves external link attributes', () => {
        render(
            <Link
                href="https://news.example/article"
                target="_blank"
                rel="noreferrer"
                disabled={false}
            >
                Source
            </Link>,
        );
        const link = screen.getByRole('link', { name: 'Source' });
        expect(link).toHaveAttribute('href', 'https://news.example/article');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noreferrer');
    });

    it('navigates through the supplied router component', async () => {
        const user = userEvent.setup();
        const Location = () => <output>{useLocation().pathname}</output>;
        render(
            <MemoryRouter initialEntries={['/']}>
                <Link as={RRLink} to="/articles" disabled={false}>
                    Read
                </Link>
                <Location />
            </MemoryRouter>,
        );
        await user.click(screen.getByRole('link', { name: 'Read' }));
        expect(screen.getByRole('status')).toHaveTextContent('/articles');
    });

    it('renders disabled links as plain text without forwarding click handlers', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(
            <Link href="/hidden" onClick={onClick}>
                Unavailable
            </Link>,
        );
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        await user.click(screen.getByText('Unavailable'));
        expect(onClick).not.toHaveBeenCalled();
    });
});
