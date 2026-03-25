import { Router } from 'express';
import {
    loginHandler,
    logoutHandler,
    meHandler,
    registerHandler,
} from '../controllers/auth.controller';
import { requireAuth } from '../../../shared/middleware/require-auth';

const authRouter = Router();

authRouter.post('/register', registerHandler);
authRouter.post('/login', loginHandler);
authRouter.get('/me', requireAuth, meHandler);
authRouter.post('/logout', requireAuth, logoutHandler);

export default authRouter;
