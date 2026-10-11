import { describe, expect, it } from 'vitest';

import { isStrongEnoughPassword, isValidEmail } from './authValidation';

describe('isValidEmail', () => {
    it.each(['reader@example.com', 'first.last+news@sub.example.co.uk'])(
        'accepts %s',
        (email) => {
            expect(isValidEmail(email)).toBe(true);
        },
    );

    it.each([
        '',
        'reader',
        'reader@example',
        '@example.com',
        'reader@.com',
        'reader@@example.com',
        'reader @example.com',
        ' reader@example.com',
        'reader@example.com\n',
    ])('rejects %j', (email) => {
        expect(isValidEmail(email)).toBe(false);
    });
});

describe('isStrongEnoughPassword', () => {
    it.each(['password1', 'PASSWORD9!', 'a1'])(
        'accepts a password containing letters and digits: %s',
        (password) => {
            expect(isStrongEnoughPassword(password)).toBe(true);
        },
    );

    it.each(['', 'password', '12345678', '!@#$%^&*', 'пароль1'])(
        'rejects a password missing a Latin letter or digit: %j',
        (password) => {
            expect(isStrongEnoughPassword(password)).toBe(false);
        },
    );
});
