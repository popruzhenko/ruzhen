import { render, screen } from '@testing-library/react';
import { MemoryRouter, Link as RRLink } from 'react-router-dom';
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
});
