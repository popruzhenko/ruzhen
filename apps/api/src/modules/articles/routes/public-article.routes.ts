import { Router } from 'express';
import { deleteAllArticlesHandler, reviewArticleContentHandler, getArticleByIdHandler, listArticlesHandler, updateArticleHandler, } from '../controller/article.controller';

const publicArticleRouter = Router();

publicArticleRouter.get('/', listArticlesHandler);
publicArticleRouter.get('/:id', getArticleByIdHandler);
publicArticleRouter.patch('/:id', updateArticleHandler);
publicArticleRouter.delete('/', deleteAllArticlesHandler);
publicArticleRouter.post('/:id/review-content', reviewArticleContentHandler);

export default publicArticleRouter;