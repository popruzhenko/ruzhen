import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Icon } from './Icon';
import { ICON_NAMES } from './UtilsIcon';

describe('Icon snapshots', () => {
    it.each(ICON_NAMES)('matches snapshot: %s', (name) => {
        const { asFragment } = render(<Icon name={name} size={16} />);
        expect(asFragment()).toMatchSnapshot();
    });

    it('matches snapshot for different sizes', () => {
        const sizes = [12, 16, 24, 32, 48, 64];
        sizes.forEach((size) => {
            const { asFragment } = render(<Icon name="cart" size={size} />);
            expect(asFragment()).toMatchSnapshot();
        });
    });
});
