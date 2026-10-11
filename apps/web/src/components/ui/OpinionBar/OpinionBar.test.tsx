import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OpinionBar } from './OpinionBar';

describe('OpinionBar', () => {
    it('shows all counts and proportional segment widths', () => {
        const { container } = render(
            <OpinionBar pro={3} contra={1} neutral={0} />,
        );
        expect(screen.getByText('Pro 3')).toBeInTheDocument();
        expect(screen.getByText('Contra 1')).toBeInTheDocument();
        expect(screen.getByText('Neutral 0')).toBeInTheDocument();
        const segments = container.querySelectorAll<HTMLElement>('[style]');
        expect([...segments].map((segment) => segment.style.width)).toEqual([
            '75%',
            '25%',
            '0%',
        ]);
    });

    it('renders zero-width segments without invalid percentages when there are no opinions', () => {
        const { container } = render(
            <OpinionBar pro={0} contra={0} neutral={0} />,
        );
        expect(
            [...container.querySelectorAll<HTMLElement>('[style]')].map(
                (segment) => segment.style.width,
            ),
        ).toEqual(['0%', '0%', '0%']);
    });
});
