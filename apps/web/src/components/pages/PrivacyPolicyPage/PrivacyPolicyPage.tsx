import { ReadableLayout } from '../../layouts/ReadableLayout/ReadableLayout';

import '../AboutPage/AboutPage.scss';

const lastUpdated = '6 August 2026';

export const PrivacyPolicyPage = () => {
    return (
        <ReadableLayout>
            <div className="static-page">
                <section className="static-page__hero">
                    <span className="static-page__eyebrow">Privacy Policy</span>

                    <h1>Privacy Policy for Ruzhen.</h1>

                    <p>
                        This Privacy Policy explains how Ruzhen collects, uses,
                        stores and protects personal data when you use the
                        platform, read published materials, create an account or
                        contact us.
                    </p>

                    <p className="static-page__meta">
                        Last updated: {lastUpdated}
                    </p>
                </section>

                <ol className="static-page__numbered-sections">
                    <li className="static-page__numbered-section">
                        <section className="static-page__section">
                            <h2>Who we are</h2>

                            <p>
                                Ruzhen is a structured news intelligence
                                platform that organizes news materials into
                                readable analysis with facts, context and
                                opinions separated.
                            </p>

                            <p>
                                Ruzhen acts as the data controller for personal
                                data processed through the website and platform.
                            </p>
                        </section>
                    </li>

                    <li className="static-page__numbered-section">
                        <section className="static-page__section">
                            <h2>What data we collect</h2>

                            <p>
                                Ruzhen may collect and process the following
                                data:
                            </p>

                            <ul className="static-page__list">
                                <li>
                                    <strong>Account data:</strong> email
                                    address, password hash, user role, session
                                    data and basic account metadata.
                                </li>

                                <li>
                                    <strong>Contact form data:</strong> name,
                                    email, selected topic, title and message
                                    content.
                                </li>

                                <li>
                                    <strong>Technical data:</strong> IP address,
                                    browser type, device information,
                                    timestamps, request logs and security
                                    metadata.
                                </li>

                                <li>
                                    <strong>Editorial data:</strong> article
                                    metadata, source links, clusters, semantic
                                    blocks and publication history.
                                </li>
                            </ul>
                        </section>
                    </li>

                    <li className="static-page__numbered-section">
                        <section className="static-page__section">
                            <h2>How we use data</h2>

                            <p>
                                We use personal data to provide, secure and
                                improve Ruzhen, including:
                            </p>

                            <ul className="static-page__list">
                                <li>creating and maintaining user accounts;</li>
                                <li>
                                    authenticating users and protecting
                                    sessions;
                                </li>
                                <li>
                                    publishing and managing structured news
                                    materials;
                                </li>
                                <li>
                                    receiving and responding to contact
                                    messages;
                                </li>
                                <li>
                                    reviewing corrections, source suggestions
                                    and partnership requests;
                                </li>
                                <li>
                                    protecting the platform from abuse, spam and
                                    unauthorized access;
                                </li>
                                <li>
                                    improving reliability, usability and
                                    performance.
                                </li>
                            </ul>
                        </section>
                    </li>

                    <li className="static-page__numbered-section">
                        <section className="static-page__section">
                            <h2>Contact messages</h2>

                            <p>
                                When you submit a message through the contact
                                form, we store the information you provide: name
                                if entered, email address, topic, title and
                                message body.
                            </p>

                            <p>
                                We use this information to review your request,
                                respond when necessary, process corrections,
                                evaluate suggested sources or consider
                                partnership opportunities.
                            </p>
                        </section>
                    </li>

                    <li className="static-page__numbered-section">
                        <section className="static-page__section">
                            <h2>Cookies and analytics</h2>

                            <p>
                                Ruzhen may use necessary cookies or similar
                                technologies to support authentication, security
                                and essential platform functionality.
                            </p>

                            <p>
                                If optional analytics or non-essential cookies
                                are used, they will be added with appropriate
                                notice and, where required, user consent.
                            </p>
                        </section>
                    </li>

                    <li className="static-page__numbered-section">
                        <section className="static-page__section">
                            <h2>Data sharing</h2>

                            <p>Ruzhen does not sell personal data.</p>

                            <p>
                                We may share limited data with service providers
                                that help operate the platform, such as hosting
                                providers, database infrastructure, email
                                delivery services, analytics providers or
                                security tools.
                            </p>

                            <p>
                                These providers may process data only as needed
                                to provide their services to Ruzhen.
                            </p>
                        </section>
                    </li>

                    <li className="static-page__numbered-section">
                        <section className="static-page__section">
                            <h2>Data retention</h2>

                            <p>
                                We keep personal data only for as long as
                                necessary for the purposes described in this
                                Privacy Policy, unless a longer retention period
                                is required by law.
                            </p>

                            <ul className="static-page__list">
                                <li>
                                    Account data is retained while the account
                                    remains active.
                                </li>

                                <li>
                                    Contact messages may be retained for
                                    support, correction and administrative
                                    purposes.
                                </li>

                                <li>
                                    Security logs may be retained for a limited
                                    period to protect the platform.
                                </li>

                                <li>
                                    Published editorial materials may remain
                                    available as part of the public archive.
                                </li>
                            </ul>
                        </section>
                    </li>

                    <li className="static-page__numbered-section">
                        <section className="static-page__section">
                            <h2>Data security</h2>

                            <p>
                                We use reasonable technical and organizational
                                measures to protect personal data against
                                unauthorized access, loss, misuse or alteration.
                            </p>

                            <p>
                                These measures may include access controls,
                                password hashing, session protection, database
                                access restrictions and secure infrastructure
                                configuration.
                            </p>
                        </section>
                    </li>

                    <li className="static-page__numbered-section">
                        <section className="static-page__section">
                            <h2>Your rights</h2>

                            <p>
                                Depending on your location and applicable law,
                                you may have the right to access, correct,
                                delete, restrict or object to the processing of
                                your personal data.
                            </p>

                            <p>
                                You may also have the right to withdraw consent
                                where processing is based on consent, request
                                data portability and lodge a complaint with a
                                data protection authority.
                            </p>

                            <p>
                                To exercise these rights, contact Ruzhen through
                                the contact page.
                            </p>
                        </section>
                    </li>

                    <li className="static-page__numbered-section">
                        <section className="static-page__section">
                            <h2>Changes to this policy</h2>

                            <p>
                                We may update this Privacy Policy when the
                                platform, processing practices or legal
                                requirements change. The updated version will be
                                published on this page with a new “Last updated”
                                date.
                            </p>
                        </section>
                    </li>

                    <li className="static-page__numbered-section">
                        <section className="static-page__section">
                            <h2>Contact</h2>

                            <p>
                                For privacy-related questions, requests or
                                complaints, contact Ruzhen through the contact
                                form on the website.
                            </p>
                        </section>
                    </li>
                </ol>
            </div>
        </ReadableLayout>
    );
};
