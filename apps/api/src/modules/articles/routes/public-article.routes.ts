import { Router } from 'express';
import { requireAuth } from '../../../shared/middleware/require-auth';
import { requireAdmin } from '../../../shared/middleware/require-admin';
import {
    deleteAllArticlesHandler,
    reviewArticleContentHandler,
    getArticleByIdHandler,
    listArticlesHandler,
    updateArticleHandler,
} from '../controller/article.controller';

const publicArticleRouter = Router();

publicArticleRouter.get('/', listArticlesHandler);
publicArticleRouter.get('/:id', getArticleByIdHandler);
publicArticleRouter.patch(
    '/:id',
    requireAuth,
    requireAdmin,
    updateArticleHandler,
);
publicArticleRouter.delete(
    '/',
    requireAuth,
    requireAdmin,
    deleteAllArticlesHandler,
);
publicArticleRouter.post(
    '/:id/review-content',
    requireAuth,
    requireAdmin,
    reviewArticleContentHandler,
);

export default publicArticleRouter;
