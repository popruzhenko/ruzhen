import { type SyntheticEvent, useState } from 'react';

import { ReadableLayout } from '../../layouts/ReadableLayout/ReadableLayout';
import { Button } from '../../ui/Button/Button';
import { DropDown } from '../../ui/DropDown/DropDown';
import { Input } from '../../ui/Input/Input';
import { Textarea } from '../../ui/Textarea/Textarea';
import { useToast } from '../../ui/Toast/ToastProvider';
import { createContactMessageRequest } from '../../../entities/public-contact/api/publicContactApi';

import '../AboutPage/AboutPage.scss';
import { TOAST_TYPE } from '../../ui/Toast/ToastConstants';

type ContactTopic = 'CORRECTIONS' | 'SOURCES' | 'PARTNERSHIPS' | 'OTHER';

interface ContactFormState {
    name: string;
    email: string;
    topic: ContactTopic;
    title: string;
    message: string;
}

interface ContactFormErrors {
    email?: string;
    title?: string;
    message?: string;
}

const initialContactFormState: ContactFormState = {
    name: '',
    email: '',
    topic: 'CORRECTIONS',
    title: '',
    message: '',
};

const topicOptions: Array<{
    value: ContactTopic;
    label: string;
    description: string;
}> = [
    {
        value: 'CORRECTIONS',
        label: 'Corrections',
        description: 'Report an error or suggest a correction.',
    },
    {
        value: 'SOURCES',
        label: 'Sources',
        description: 'Suggest a news source for future coverage.',
    },
    {
        value: 'PARTNERSHIPS',
        label: 'Partnerships',
        description: 'Discuss collaboration, product or media opportunities.',
    },
    {
        value: 'OTHER',
        label: 'Other',
        description:
            'Use this if none of the suggested topics fits your message.',
    },
];

const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const ContactPage = () => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { showToast } = useToast();

    const [form, setForm] = useState<ContactFormState>(initialContactFormState);

    const [errors, setErrors] = useState<ContactFormErrors>({});

    const handleChange = <K extends keyof ContactFormState>(
        key: K,
        value: ContactFormState[K],
    ) => {
        setForm((currentForm) => ({
            ...currentForm,
            [key]: value,
        }));

        setErrors((currentErrors) => ({
            ...currentErrors,
            [key]: undefined,
        }));
    };

    const validateForm = () => {
        const nextErrors: ContactFormErrors = {};

        const trimmedEmail = form.email.trim();
        const trimmedTitle = form.title.trim();
        const trimmedMessage = form.message.trim();

        if (!trimmedEmail) {
            nextErrors.email = 'Email is required.';
        } else if (!isValidEmail(trimmedEmail)) {
            nextErrors.email = 'Enter a valid email address.';
        }

        if (!trimmedTitle) {
            nextErrors.title = 'Title is required.';
        } else if (trimmedTitle.length < 4) {
            nextErrors.title = 'Title must be at least 4 characters.';
        }

        if (!trimmedMessage) {
            nextErrors.message = 'Message is required.';
        } else if (trimmedMessage.length < 20) {
            nextErrors.message = 'Message must be at least 20 characters.';
        }

        return nextErrors;
    };

    const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
        event.preventDefault();

        const validationErrors = validateForm();

        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);

            showToast({
                type: TOAST_TYPE.ERROR,
                title: 'Message is not ready',
                message: 'Please fill in the required fields.',
            });

            return;
        }

        setIsSubmitting(true);

        try {
            await createContactMessageRequest({
                name: form.name.trim() || null,
                email: form.email.trim(),
                topic: form.topic,
                title: form.title.trim(),
                message: form.message.trim(),
            });

            setForm(initialContactFormState);
            setErrors({});

            showToast({
                type: TOAST_TYPE.SUCCESS,
                title: 'Message sent',
                message: 'Thank you. Your message has been received.',
            });
        } catch (error) {
            showToast({
                type: TOAST_TYPE.ERROR,
                title: 'Message was not sent',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Please try again later.',
            });
        } finally {
            setIsSubmitting(false);
        }
    };
    return (
        <ReadableLayout>
            <div className="static-page">
                <section className="static-page__hero">
                    <span className="static-page__eyebrow">Contact</span>

                    <h1>Get in touch with Ruzhen.</h1>

                    <p>
                        Send feedback, corrections, source suggestions,
                        partnership requests or any other message related to
                        Ruzhen.
                    </p>
                </section>

                <section className="static-page__contact-layout">
                    <form
                        className="static-page__contact-form"
                        onSubmit={handleSubmit}
                    >
                        <div className="static-page__form-grid">
                            <Input
                                label="Name"
                                placeholder="Your name"
                                value={form.name}
                                onChange={(event) =>
                                    handleChange('name', event.target.value)
                                }
                            />

                            <Input
                                label="Email"
                                type="email"
                                requiredMark
                                placeholder="you@example.com"
                                value={form.email}
                                error={errors.email}
                                onChange={(event) =>
                                    handleChange('email', event.target.value)
                                }
                            />
                        </div>

                        <div className="static-page__form-grid">
                            <Input
                                label="Title"
                                requiredMark
                                placeholder="Short message title"
                                value={form.title}
                                error={errors.title}
                                onChange={(event) =>
                                    handleChange('title', event.target.value)
                                }
                            />

                            <DropDown
                                label="Topic"
                                value={form.topic}
                                options={topicOptions}
                                onChange={(value) =>
                                    handleChange('topic', value as ContactTopic)
                                }
                            />
                        </div>

                        <Textarea
                            label="Message"
                            requiredMark
                            placeholder="Write your message here..."
                            value={form.message}
                            error={errors.message}
                            onChange={(value) => handleChange('message', value)}
                        />

                        <div className="static-page__form-actions">
                            <Button variants="primary" disabled={isSubmitting}>
                                {isSubmitting ? 'Sending...' : 'Send message'}
                            </Button>
                        </div>
                    </form>

                    <aside className="static-page__contact-card">
                        <span>Before sending</span>

                        <div>
                            <strong>Corrections</strong>
                            <p>
                                Include the article title, source and what
                                should be corrected.
                            </p>
                        </div>

                        <div>
                            <strong>Sources</strong>
                            <p>
                                Suggest sources with stable publishing quality
                                and clear editorial standards.
                            </p>
                        </div>

                        <div>
                            <strong>Partnerships</strong>
                            <p>
                                Briefly describe the collaboration idea and why
                                it fits Ruzhen.
                            </p>
                        </div>

                        <div>
                            <strong>Other</strong>
                            <p>
                                Use this topic for general feedback or messages
                                that do not fit the predefined categories.
                            </p>
                        </div>
                    </aside>
                </section>
            </div>
        </ReadableLayout>
    );
};
