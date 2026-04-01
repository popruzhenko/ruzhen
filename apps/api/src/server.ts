import express from 'express';
import cors from 'cors';
import authRouter from './modules/auth/routes/auth.routes';
import adminTestRouter from './modules/auth/routes/admin-test.routes';
import adminClusterRouter from './modules/clusters/routes/admin-cluster.routes';
import publicClusterRouter from './modules/clusters/routes/public-cluster.routes';
import adminClusterBlockRouter from './modules/cluster-blocks/routes/admin-cluster-block.routes';
import publicClusterBlockRouter from './modules/cluster-blocks/routes/public-cluster-block.routes';
import publicClusterArticleRouter from './modules/cluster-article/routes/public-cluster-article.routes';
import adminClusterArticleRouter from './modules/cluster-article/routes/admin-cluster-article.routes';


const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/admin', adminTestRouter);
app.use('/api/admin/clusters', adminClusterRouter);
app.use('/api/admin/clusters', adminClusterBlockRouter);
app.use('/api/admin/clusters', adminClusterArticleRouter);

app.use('/api/clusters', publicClusterRouter);
app.use('/api/clusters', publicClusterBlockRouter);
app.use('/api/clusters', publicClusterArticleRouter);

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.listen(PORT, () => {
    console.log(`API is running on http://localhost:${PORT}/health`);
});
