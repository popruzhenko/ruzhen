import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './require-auth';

export function requireAdmin(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
) {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    if (req.user?.role !== 'ADMIN') {
        return res
            .status(403)
            .json({ message: 'Forbidden: admin access required' });
    }
    next();
}
