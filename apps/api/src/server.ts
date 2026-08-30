import express from 'express';
import cors from 'cors';
import authRouter from './modules/auth/routes/auth.routes';
import adminTestRouter from './modules/auth/routes/admin-test.routes';
import adminClusterRouter from './modules/clusters/routes/admin-cluster.routes';
import publicClusterRouter from './modules/clusters/routes/public-cluster.routes';
import publicContactRouter from './modules/public-contact/routes/publicContact.routes';
import adminClusterBlockRouter from './modules/cluster-blocks/routes/admin-cluster-block.routes';
import publicClusterBlockRouter from './modules/cluster-blocks/routes/public-cluster-block.routes';
import publicClusterArticleRouter from './modules/cluster-article/routes/public-cluster-article.routes';
import publicArticleRouter from './modules/articles/routes/public-article.routes';
import adminClusterArticleRouter from './modules/cluster-article/routes/admin-cluster-article.routes';
import adminArticleRouter from './modules/articles/routes/admin-article.routes';
import adminClusterCandidateRouter from './modules/cluster-candidates/routes/admin-cluster-candidate.routes';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/admin', adminTestRouter);
app.use('/api/admin/clusters', adminClusterRouter);
app.use('/api/admin/cluster-candidates', adminClusterCandidateRouter);
app.use('/api/admin/clusters', adminClusterBlockRouter);
app.use('/api/admin/clusters', adminClusterArticleRouter);
app.use('/api/admin/articles', adminArticleRouter);

app.use('/api/clusters', publicClusterRouter);
app.use('/api/clusters', publicClusterBlockRouter);
app.use('/api/clusters', publicClusterArticleRouter);
app.use('/api/articles', publicArticleRouter);
app.use('/api/public/contact', publicContactRouter);

app.use('/api/public/clusters', publicClusterRouter);
app.use('/api/public/clusters', publicClusterBlockRouter);
app.use('/api/public/clusters', publicClusterArticleRouter);
app.use('/api/public/articles', publicArticleRouter);

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.listen(PORT, () => {
    console.log(`API is running on http://localhost:${PORT}/health`);
});
