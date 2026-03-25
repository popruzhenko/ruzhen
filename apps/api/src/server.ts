import express from 'express';
import cors from 'cors';
import authRouter from './modules/auth/routes/auth.routes';
import { signAccesToken } from './shared/lib/jwt';
import adminTestRouter from './modules/auth/routes/admin-test.routes';
import adminClusterRouter from './modules/clusters/routes/admin-cluster.routes';
import publicClusterRouter from './modules/clusters/routes/public-cluster.routes';
import cluster from 'cluster';
import clusterRouter from './modules/clusters/routes/cluster.routes';
import clusterBlockRouter from './modules/cluster-blocks/routes/cluster-block.routes';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/admin', adminTestRouter);
app.use('/api/admin/clusters', adminClusterRouter);
app.use('/api/admin/clusters', clusterBlockRouter);

app.use('/api/clusters', publicClusterRouter);

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.listen(PORT, () => {
    console.log(`API is running on http://localhost:${PORT}/health`);
});
