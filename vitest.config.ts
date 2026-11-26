import { defineConfig } from 'vitest/config';

// mongod 8.x của mongodb-memory-server bị SIGABRT trên macOS 13. Ghim 7.0.x để test chạy được.
// Muốn dùng bản khác thì đặt MONGOMS_VERSION hoặc MONGOMS_SYSTEM_BINARY trước khi chạy.
process.env['MONGOMS_VERSION'] ??= '7.0.14';

export default defineConfig({
  test: {
    include: ['server/**/*.spec.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
