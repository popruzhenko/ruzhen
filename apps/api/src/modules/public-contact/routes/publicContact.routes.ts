import { Router } from 'express';

import { createContactMessageHandler } from '../controllers/publicContact.controller';

export const publicContactRouter = Router();

publicContactRouter.post('/', createContactMessageHandler);

export default publicContactRouter;