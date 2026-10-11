import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ReadableLayout } from './ReadableLayout';

describe('ReadableLayout', () => {
    it.each([null, 'USER', 'ADMIN'] as const)(
        'selects the reading layout for role %s',
        (role) => {
            if (role)
                localStorage.setItem(
                    'ruzhen_user',
                    JSON.stringify({ id: 'reader', role }),
                );
            render(
                <MemoryRouter>
                    <ReadableLayout>
                        <h1>Readable article</h1>
                    </ReadableLayout>
                </MemoryRouter>,
            );
            expect(
                screen.getByRole('heading', { name: 'Readable article' }),
            ).toBeInTheDocument();
            const footer = within(screen.getByRole('contentinfo'));
            if (role === 'USER') {
                expect(
                    screen.getByRole('button', { name: /Menu/ }),
                ).toBeInTheDocument();
                expect(
                    footer.getByRole('link', { name: 'Contact' }),
                ).toHaveAttribute('href', '/user/contact');
            } else {
                expect(
                    screen.getByRole('button', { name: 'Log in' }),
                ).toBeInTheDocument();
                expect(
                    footer.getByRole('link', { name: 'Contact' }),
                ).toHaveAttribute('href', '/contact');
            }
            expect(
                screen.getByRole('navigation', { name: 'Main navigation' }),
            ).toBeInTheDocument();
        },
    );
});
