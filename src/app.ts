/**
 * Express application setup
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import sessionRouter from './routes/session.js';
import healthRouter from './routes/health.js';

export const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/session', sessionRouter);
app.use('/health', healthRouter);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'LiveKit Backend API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      createSession: 'POST /session',
      endSession: 'POST /session/end',
    },
    docs: 'See README.md for API documentation',
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});
