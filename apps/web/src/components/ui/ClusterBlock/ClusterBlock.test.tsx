import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClusterBlock } from './ClusterBlock';

describe('ClusterBlock', () => {
    it('omits optional title, source and stance without losing the block content', () => {
        render(
            <ClusterBlock id="fact" type="FACT" content="A verified fact." />,
        );
        expect(screen.getByRole('article')).toHaveTextContent(
            'A verified fact.',
        );
        expect(screen.queryByRole('heading')).not.toBeInTheDocument();
        expect(screen.queryByText('Source:')).not.toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it.each(['PRO', 'CONTRA', 'NEUTRAL'] as const)(
        'displays the %s opinion stance and plain provenance when there is no source URL',
        (stance) => {
            render(
                <ClusterBlock
                    id="opinion"
                    type="OPINION"
                    title="Expert view"
                    content="An attributed view."
                    stance={stance}
                    sourceName="Editorial desk"
                />,
            );
            expect(
                screen.getByRole('heading', { name: 'Expert view' }),
            ).toBeInTheDocument();
            expect(screen.getByText(stance)).toBeInTheDocument();
            expect(screen.getByText('Editorial desk')).toBeInTheDocument();
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
        },
    );

    it('restricts stance badges to opinions and preserves the external source URL', () => {
        render(
            <ClusterBlock
                id="context"
                type="CONTEXT"
                content="Background."
                stance="PRO"
                sourceName="Source report"
                sourceUrl="https://source.example/report"
            />,
        );
        expect(screen.queryByText('PRO')).not.toBeInTheDocument();
        const source = screen.getByRole('link', { name: 'Source report' });
        expect(source).toHaveAttribute('href', 'https://source.example/report');
        expect(source).toHaveAttribute('target', '_blank');
        expect(source).toHaveAttribute('rel', 'noreferrer');
    });
});
