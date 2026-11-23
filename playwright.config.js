// Playwright E2E 設定（npm run test:e2e）。
// 直接測試「已啟動」的專案：請先在另一個終端機執行 npm start；這裡刻意不設定 webServer，不會另外啟動伺服器。
// 瀏覽器使用系統安裝的 Google Chrome（channel: 'chrome'），不需要另外下載 Chromium。
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.spec.js',
  timeout: 5 * 60 * 1000, // 含綠界測試環境的付款流程，外部頁面較慢
  expect: { timeout: 20 * 1000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  outputDir: 'test-results',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3001',
    channel: process.env.E2E_BROWSER_CHANNEL || 'chrome',
    headless: process.env.E2E_HEADED !== '1',
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    viewport: { width: 1280, height: 900 },
    actionTimeout: 20 * 1000,
    navigationTimeout: 60 * 1000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
});
