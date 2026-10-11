import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon } from './Icon';
import { ICON_NAMES } from './UtilsIcon';

describe('Icon', () => {
    it.each(ICON_NAMES)('renders the %s icon as decorative SVG', (name) => {
        const { container } = render(<Icon name={name} size={24} />);
        const svg = container.querySelector('svg');
        expect(container.firstChild).toHaveClass('ui-icon', `ui-icon--${name}`);
        expect(svg).toHaveAttribute('width', '24');
        expect(svg).toHaveAttribute('height', '24');
        expect(svg).toHaveAttribute('aria-hidden', 'true');
        expect(svg?.childElementCount).toBeGreaterThan(0);
    });

    it('uses default dimensions and forwards color and custom classes', () => {
        const { container, rerender } = render(<Icon name="color" />);
        expect(container.querySelector('svg')).toHaveAttribute('width', '16');
        rerender(
            <Icon name="color" color="#ff0000" className="swatch" size={32} />,
        );
        expect(container.firstChild).toHaveClass('swatch');
        expect(container.querySelector('rect')).toHaveAttribute(
            'fill',
            '#ff0000',
        );
        expect(container.querySelector('svg')).toHaveAttribute('height', '32');
    });
});
