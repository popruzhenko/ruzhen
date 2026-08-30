import { Router } from 'express';
import { requireAuth } from '../../../shared/middleware/require-auth';
import { requireAdmin } from '../../../shared/middleware/require-admin';

const adminTestRouter = Router();

adminTestRouter.get('/admin-test', requireAuth, requireAdmin, (req, res) => {
    res.status(200).json({ message: 'Admin access granted' });
});

export default adminTestRouter;
