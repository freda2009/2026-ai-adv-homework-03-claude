import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // 測試環境變數：使用記憶體資料庫，且不依賴 .env（dotenv 不會覆寫既有環境變數）。
    // ADMIN_* 需與 tests/setup.js 的 getAdminToken() 一致。
    env: {
      DB_PATH: ':memory:',
      JWT_SECRET: 'test-only-jwt-secret',
      ADMIN_EMAIL: 'admin@hexschool.com',
      ADMIN_PASSWORD: '12345678',
    },
    fileParallelism: false,
    sequence: {
      files: [
        'tests/auth.test.js',
        'tests/products.test.js',
        'tests/cart.test.js',
        'tests/orders.test.js',
        'tests/adminProducts.test.js',
        'tests/adminOrders.test.js',
      ],
    },
    hookTimeout: 10000,
  },
});
