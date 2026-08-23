import { Request, Response, NextFunction } from 'express';
import { verifyAccesToken } from '../lib/jwt';

export type AuthenticatedRequest = Request & {
    user?: {
        userId: string;
        email: string;
        role: string;
    };
};

export function requireAuth(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res
                .status(401)
                .json({ message: 'Authorization header is missing' });
        }

        const [type, token] = authHeader.split(' ');
        if (type !== 'Bearer' || !token) {
            return res
                .status(401)
                .json({ message: 'Invalid authorization header format' });
        }

        const payload = verifyAccesToken(token) as {
            userId: string;
            email: string;
            role: string;
        };

        req.user = payload;

        next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
}
