import mongoose from 'mongoose';
import { config } from './config';
import { createApp } from './app';

async function start() {
  await mongoose.connect(config.MONGODB_URI);
  const server = createApp().listen(config.PORT, () => {
    console.log(`GoGo API: http://localhost:${config.PORT}/api/health`);
  });

  const shutdown = async () => {
    server.close();
    await mongoose.disconnect();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error('Could not start GoGo API:', err);
  process.exitCode = 1;
});
