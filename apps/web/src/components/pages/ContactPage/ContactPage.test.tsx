import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactPage } from './ContactPage';
import { ToastProvider } from '../../ui/Toast/ToastProvider';
import { createContactMessageRequest } from '../../../entities/public-contact/api/publicContactApi';

vi.mock('../../../entities/public-contact/api/publicContactApi', () => ({
    createContactMessageRequest: vi.fn(),
}));

const result = {
    message: {
        id: 'message-1',
        topic: 'CORRECTIONS' as const,
        title: 'A correction',
        createdAt: '2026-10-04',
    },
};
const renderPage = () =>
    render(
        <MemoryRouter>
            <ToastProvider>
                <ContactPage />
            </ToastProvider>
        </MemoryRouter>,
    );
const submit = () =>
    fireEvent.submit(
        screen.getByRole('button', { name: 'Send message' }).closest('form')!,
    );

const fillValidForm = async (name = '') => {
    const user = userEvent.setup();
    if (name) await user.type(screen.getByLabelText('Name'), name);
    await user.type(screen.getByLabelText(/Email/), 'reader@example.com');
    await user.type(screen.getByLabelText(/Title/), '  A correction  ');
    await user.type(
        screen.getByLabelText(/Message/),
        '  Please correct the date in your published report.  ',
    );
    return user;
};

beforeEach(() => {
    vi.mocked(createContactMessageRequest)
        .mockReset()
        .mockResolvedValue(result);
});

describe('ContactPage', () => {
    it('rejects blank required fields without sending a request and clears edited errors', async () => {
        const user = userEvent.setup();
        renderPage();
        submit();
        expect(screen.getByText('Email is required.')).toBeInTheDocument();
        expect(screen.getByText('Title is required.')).toBeInTheDocument();
        expect(screen.getByText('Message is required.')).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent(
            'Message is not ready',
        );
        expect(createContactMessageRequest).not.toHaveBeenCalled();
        expect(screen.getByLabelText(/Email/)).toHaveAttribute(
            'aria-invalid',
            'true',
        );
        await user.type(screen.getByLabelText(/Email/), 'reader@example.com');
        expect(
            screen.queryByText('Email is required.'),
        ).not.toBeInTheDocument();
        expect(screen.getByLabelText(/Email/)).toHaveAttribute(
            'aria-invalid',
            'false',
        );
        expect(screen.getByText('Title is required.')).toBeInTheDocument();
    });

    it('rejects malformed email, whitespace-only content and short messages', () => {
        renderPage();
        fireEvent.change(screen.getByLabelText(/Email/), {
            target: { value: 'invalid-address' },
        });
        fireEvent.change(screen.getByLabelText(/Title/), {
            target: { value: ' a ' },
        });
        fireEvent.change(screen.getByLabelText(/Message/), {
            target: { value: ' too short ' },
        });
        submit();
        expect(
            screen.getByText('Enter a valid email address.'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Title must be at least 4 characters.'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Message must be at least 20 characters.'),
        ).toBeInTheDocument();
        expect(createContactMessageRequest).not.toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText(/Title/), {
            target: { value: '   ' },
        });
        submit();
        expect(screen.getByText('Title is required.')).toBeInTheDocument();
    });

    it('trims submitted values, sends the selected topic and resets the form on success', async () => {
        renderPage();
        const user = await fillValidForm('  Alex Reader  ');
        await user.click(
            screen.getByRole('button', { name: /Topic Corrections/ }),
        );
        await user.click(screen.getByRole('option', { name: 'Sources' }));
        await user.click(screen.getByRole('button', { name: 'Send message' }));
        expect(createContactMessageRequest).toHaveBeenCalledExactlyOnceWith({
            name: 'Alex Reader',
            email: 'reader@example.com',
            title: 'A correction',
            message: 'Please correct the date in your published report.',
            topic: 'SOURCES',
        });
        await waitFor(() =>
            expect(screen.getByRole('status')).toHaveTextContent(
                'Message sent',
            ),
        );
        expect(screen.getByLabelText('Name')).toHaveValue('');
        expect(screen.getByLabelText(/Email/)).toHaveValue('');
        expect(screen.getByLabelText(/Title/)).toHaveValue('');
        expect(screen.getByLabelText(/Message/)).toHaveValue('');
        expect(
            screen.getByRole('button', { name: /Topic Corrections/ }),
        ).toBeInTheDocument();
    });

    it('sends null for an omitted name and disables submission while awaiting the server', async () => {
        let resolveRequest!: (value: typeof result) => void;
        vi.mocked(createContactMessageRequest).mockReturnValue(
            new Promise((resolve) => {
                resolveRequest = resolve;
            }),
        );
        renderPage();
        const user = await fillValidForm();
        await user.click(screen.getByRole('button', { name: 'Send message' }));
        expect(
            screen.getByRole('button', { name: 'Sending...' }),
        ).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Sending...' }));
        expect(createContactMessageRequest).toHaveBeenCalledOnce();
        expect(
            vi.mocked(createContactMessageRequest).mock.calls[0][0].name,
        ).toBeNull();
        await act(async () => resolveRequest(result));
        expect(
            screen.getByRole('button', { name: 'Send message' }),
        ).toBeEnabled();
    });

    it.each([new Error('Service unavailable'), 'unexpected failure'])(
        'retains the draft and permits retry after server failure %s',
        async (error) => {
            vi.mocked(createContactMessageRequest).mockRejectedValueOnce(error);
            renderPage();
            const user = await fillValidForm();
            await user.click(
                screen.getByRole('button', { name: 'Send message' }),
            );
            await waitFor(() =>
                expect(screen.getByRole('status')).toHaveTextContent(
                    'Message was not sent',
                ),
            );
            expect(screen.getByRole('status')).toHaveTextContent(
                error instanceof Error
                    ? error.message
                    : 'Please try again later.',
            );
            expect(screen.getByLabelText(/Title/)).toHaveValue(
                '  A correction  ',
            );
            expect(screen.getByLabelText(/Email/)).toHaveValue(
                'reader@example.com',
            );
            expect(
                screen.getByRole('button', { name: 'Send message' }),
            ).toBeEnabled();
            await user.click(
                screen.getByRole('button', { name: 'Send message' }),
            );
            await waitFor(() =>
                expect(screen.getByText('Message sent')).toBeInTheDocument(),
            );
            expect(createContactMessageRequest).toHaveBeenCalledTimes(2);
        },
    );
});
