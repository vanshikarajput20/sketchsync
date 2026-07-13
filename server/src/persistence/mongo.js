/**
 * server/src/persistence/mongo.js
 *
 * Mongoose connection factory. Intentionally thin — all schema logic lives in
 * src/models/. This module is responsible only for the connection lifecycle.
 */

import mongoose from 'mongoose';

/**
 * Opens the Mongoose connection. Called once at server startup.
 * Resolves when the connection is established.
 */
export async function connectMongo() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/sketchsync';

  // Mongoose 8+ uses the native driver's connection pool by default.
  // These options avoid deprecation warnings.
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
  });

  console.log('✅  MongoDB connected');
}

/**
 * Gracefully closes the Mongoose connection.
 * Call this in tests or on SIGTERM.
 */
export async function closeMongo() {
  await mongoose.disconnect();
}
