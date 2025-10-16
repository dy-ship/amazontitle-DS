import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { routes } from './routes/generate.js';

dotenv.config();

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors());

// Rate limit
app.use('/api/', rateLimit({ windowMs: 60 * 1000, max: 30 }));

// API routes
routes(app);

// Serve static frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.resolve(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Server on http://localhost:' + port));
