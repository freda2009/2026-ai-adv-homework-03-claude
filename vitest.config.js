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
      // 綠界測試環境的公開測試帳號；測試一律 mock 綠界，不會真的連線。
      ECPAY_MERCHANT_ID: '3002607',
      ECPAY_HASH_KEY: 'pwFHCqoQZGmho4w6',
      ECPAY_HASH_IV: 'EkRm7iFT261dpevs',
      ECPAY_ENV: 'staging',
      BASE_URL: 'http://localhost:3001',
      ECPAY_RETURN_URL: 'https://example.invalid/api/ecpay/notify',
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
