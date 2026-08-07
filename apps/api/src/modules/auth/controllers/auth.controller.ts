import { Request, Response } from 'express';

import {
    registerUser,
    loginUser,
    loginWithGoogle,
    getCurrentUser,
    logoutUser,
} from '../services/auth.service';

import { AuthenticatedRequest } from '../../../shared/middleware/require-auth';

export async function registerHandler(req: Request, res: Response) {
    try {
        const { email, password } = req.body;

        const user = await registerUser(email, password);

        res.status(201).json({
            message: 'User registered successfully',
            user,
        });
    } catch (error) {
        console.error('Register error: ', error);

        res.status(400).json({
            message:
                error instanceof Error ? error.message : 'Registration failed',
        });
    }
}

export async function loginHandler(req: Request, res: Response) {
    try {
        const { email, password } = req.body;

        const user = await loginUser(email, password);

        res.status(200).json({
            message: 'Login successful',
            ...user,
        });
    } catch (error) {
        console.error('Login error: ', error);

        res.status(401).json({
            message: error instanceof Error ? error.message : 'Login failed',
        });
    }
}

export async function googleLoginHandler(req: Request, res: Response) {
    try {
        const { credential } = req.body;

        const authData = await loginWithGoogle(credential);

        res.status(200).json({
            message: 'Google login successful',
            ...authData,
        });
    } catch (error) {
        console.error('Google login error: ', error);

        res.status(401).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Google login failed',
        });
    }
}

export async function meHandler(req: AuthenticatedRequest, res: Response) {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const user = await getCurrentUser(req.user.userId);

        res.status(200).json({
            user,
        });
    } catch (error) {
        console.error('Get current user error: ', error);

        res.status(400).json({
            message:
                error instanceof Error
                    ? error.message
                    : 'Failed to get current user',
        });
    }
}

export async function logoutHandler(req: AuthenticatedRequest, res: Response) {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        await logoutUser(req.user.userId);

        res.status(200).json({
            message: 'Logout successful',
        });
    } catch (error) {
        console.error('Logout error: ', error);

        res.status(400).json({
            message:
                error instanceof Error ? error.message : 'Failed to logout',
        });
    }
}