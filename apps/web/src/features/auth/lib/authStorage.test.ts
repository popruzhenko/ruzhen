import { describe, expect, it } from 'vitest';

import type { AuthUser } from '../api/authApi';
import {
    clearAuthData,
    getAccessToken,
    getSessionToken,
    getStoredUser,
    hasAuthSession,
    saveAuthData,
} from './authStorage';

const user: AuthUser = {
    id: 'reader-1',
    email: 'reader@example.com',
    role: 'USER',
    createdAt: '2026-10-04T12:00:00.000Z',
};

describe('authStorage', () => {
    it('returns an unauthenticated state when storage is empty', () => {
        expect(getAccessToken()).toBeNull();
        expect(getSessionToken()).toBeNull();
        expect(getStoredUser()).toBeNull();
        expect(hasAuthSession()).toBe(false);
    });

    it('persists tokens and a complete user across reads', () => {
        saveAuthData({
            accessToken: 'access-1',
            sessionToken: 'session-1',
            user,
        });

        expect(getAccessToken()).toBe('access-1');
        expect(getSessionToken()).toBe('session-1');
        expect(getStoredUser()).toEqual(user);
        expect(getStoredUser()).not.toBe(user);
        expect(hasAuthSession()).toBe(true);
    });

    it('replaces an existing session when a new user signs in', () => {
        saveAuthData({ accessToken: 'old', sessionToken: 'old-session', user });
        const admin: AuthUser = { ...user, id: 'admin-1', role: 'ADMIN' };

        saveAuthData({
            accessToken: 'new',
            sessionToken: 'new-session',
            user: admin,
        });

        expect(getAccessToken()).toBe('new');
        expect(getSessionToken()).toBe('new-session');
        expect(getStoredUser()).toEqual(admin);
    });

    it('requires a non-empty access token for an authenticated session', () => {
        saveAuthData({ accessToken: '', sessionToken: 'session-1', user });

        expect(hasAuthSession()).toBe(false);
    });

    it('clears only authentication entries and is safe to call repeatedly', () => {
        saveAuthData({
            accessToken: 'access-1',
            sessionToken: 'session-1',
            user,
        });
        localStorage.setItem('language', 'en');

        clearAuthData();
        clearAuthData();

        expect(getAccessToken()).toBeNull();
        expect(getSessionToken()).toBeNull();
        expect(getStoredUser()).toBeNull();
        expect(hasAuthSession()).toBe(false);
        expect(localStorage.getItem('language')).toBe('en');
    });

    it('discards a corrupted user and both tokens without clearing other settings', () => {
        saveAuthData({
            accessToken: 'access-1',
            sessionToken: 'session-1',
            user,
        });
        localStorage.setItem('ruzhen_user', '{broken json');
        localStorage.setItem('language', 'en');

        expect(getStoredUser()).toBeNull();
        expect(getAccessToken()).toBeNull();
        expect(getSessionToken()).toBeNull();
        expect(hasAuthSession()).toBe(false);
        expect(localStorage.getItem('language')).toBe('en');
    });
});
