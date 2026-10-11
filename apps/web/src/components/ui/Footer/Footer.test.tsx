import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Footer } from './Footer';

describe('Footer', () => {
    it.each(['', '/user'] as const)(
        'uses the navigation paths for base %s',
        (basePath) => {
            render(
                <MemoryRouter>
                    <Footer basePath={basePath} />
                </MemoryRouter>,
            );
            expect(
                screen.getByRole('link', { name: 'Ruzhen' }),
            ).toHaveAttribute('href', basePath || '/');
            expect(
                screen.getByRole('link', { name: 'Articles' }),
            ).toHaveAttribute('href', basePath || '/articles');
            for (const [label, suffix] of [
                ['About', '/about'],
                ['Contact', '/contact'],
                ['Privacy Policy', '/privacy'],
            ]) {
                expect(
                    screen.getByRole('link', { name: label }),
                ).toHaveAttribute('href', `${basePath}${suffix}`);
            }
        },
    );

    it('uses the current year rather than a hardcoded copyright date', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2030-05-04T12:00:00Z'));
        render(
            <MemoryRouter>
                <Footer />
            </MemoryRouter>,
        );
        expect(screen.getByText(/2030 Ruzhen/)).toBeInTheDocument();
    });
});
