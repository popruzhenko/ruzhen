import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PublicArticleCard } from './PublicArticleCard';
import { makeBlock, makeListArticle } from '../../publicArticlesTestFixtures';

describe('PublicArticleCard', () => {
    it('links its title and read action to the public article and summarizes available block types', () => {
        const article = makeListArticle({
            blocks: [
                makeBlock(),
                makeBlock({ id: 'fact-2' }),
                makeBlock({ id: 'context', type: 'CONTEXT' }),
                makeBlock({ id: 'opinion', type: 'OPINION' }),
            ],
            _count: { articleLinks: 3, blocks: 4 },
        });
        render(
            <MemoryRouter>
                <PublicArticleCard article={article} />
            </MemoryRouter>,
        );
        expect(
            screen.getByRole('link', { name: article.title }),
        ).toHaveAttribute('href', '/articles/RZH-001');
        expect(
            screen.getByRole('link', {
                name: `Read article: ${article.title}`,
            }),
        ).toHaveAttribute('href', '/articles/RZH-001');
        expect(screen.getByText('Facts: 2')).toBeInTheDocument();
        expect(screen.getByText('Context: 1')).toBeInTheDocument();
        expect(screen.getByText('Opinion: 1')).toBeInTheDocument();
        expect(screen.getByText('3 sources')).toBeInTheDocument();
        expect(screen.getByText(article.summary!)).toBeInTheDocument();
    });

    it('supports a custom preview route and omits missing summaries and zero block counts', () => {
        const article = makeListArticle({
            summary: null,
            blocks: [],
            publishedAt: 'invalid',
        });
        render(
            <MemoryRouter>
                <PublicArticleCard
                    article={article}
                    detailsBasePath="/admin/public-preview"
                />
            </MemoryRouter>,
        );
        expect(
            screen.getByRole('link', { name: article.title }),
        ).toHaveAttribute('href', '/admin/public-preview/RZH-001');
        expect(
            screen.getByRole('link', {
                name: `Read article: ${article.title}`,
            }),
        ).toHaveAttribute('href', '/admin/public-preview/RZH-001');
        expect(screen.getByText('—')).toBeInTheDocument();
        expect(
            screen.queryByText(/Fact:|Facts:|Context:|Opinion:/),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText('A concise explanation.'),
        ).not.toBeInTheDocument();
    });
});
