import { ReadableLayout } from '../../layouts/ReadableLayout/ReadableLayout';

import './AboutPage.scss';

export const AboutPage = () => {
    return (
        <ReadableLayout>
            <div className="static-page">
                <section className="static-page__hero">
                    <span className="static-page__eyebrow">About Ruzhen</span>

                    <h1>News should help you understand, not overwhelm you.</h1>

                    <p>
                        Ruzhen is a structured news intelligence platform that
                        separates facts, context and opinions so readers can
                        understand events without being pushed into a single
                        emotional frame.
                    </p>
                </section>

                <section className="static-page__grid">
                    <article className="static-page__card">
                        <h2>What Ruzhen does</h2>

                        <p>
                            Ruzhen collects related news materials, groups them
                            into event clusters, and turns them into readable
                            structured analysis.
                        </p>
                    </article>

                    <article className="static-page__card">
                        <h2>Why it exists</h2>

                        <p>
                            Most news feeds mix facts, interpretations, emotions
                            and political framing. Ruzhen keeps these layers
                            visibly separated.
                        </p>
                    </article>

                    <article className="static-page__card">
                        <h2>How articles are structured</h2>

                        <p>
                            Each published material is organized around three
                            blocks: Facts, Context and Opinions.
                        </p>
                    </article>
                </section>

                <section className="static-page__section">
                    <h2>Editorial principle</h2>

                    <p>
                        Ruzhen does not try to tell the reader what to think.
                        Its goal is to show what happened, what background
                        matters, and how different sides may interpret the same
                        event.
                    </p>
                </section>
            </div>
        </ReadableLayout>
    );
};
