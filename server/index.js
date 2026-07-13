/**
 * server/index.js
 *
 * Application entry point. Loads environment variables, creates the Express app,
 * attaches Socket.IO, and starts listening. Keeps this file minimal — all logic
 * lives in src/.
 */

import 'dotenv/config';
import { createServer } from 'http';
import { createApp } from './src/app.js';
import { attachSocketIO } from './src/socket/index.js';
import { connectRedis } from './src/persistence/redis.js';
import { connectMongo } from './src/persistence/mongo.js';

const PORT = process.env.PORT || 4000;

async function main() {
  // Connect to persistence layer before accepting connections
  await connectRedis();
  await connectMongo();

  const app = createApp();
  const httpServer = createServer(app);

  attachSocketIO(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`🚀  Whiteboard server listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
