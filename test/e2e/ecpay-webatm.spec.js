// E2E：登入 → 加入購物車 → 結帳（配送方式）→ 建立訂單 → 綠界測試環境「網路 ATM／台灣土地銀行」付款 → 返回商店 → 已付款。
// 綠界測試環境的土地銀行頁按 Save 後會自動返回商店（OrderResultURL），沒有「返回商店」按鈕時第 13 步改為確認自動返回。
// 直接測試已啟動的 http://localhost:3001（先 npm start）；會在開發資料庫建立一筆真實訂單並扣 1 件庫存。
// 綠界頁面不是本專案的程式：優先使用 2026-11-23 實測的元素 id（#liWebATM、#selWebATMBank、#WebATMPaySubmit、
// #btnClose），找不到再退回文字比對，並同時搜尋所有分頁與 iframe；失敗時會存下每個分頁的 HTML 與截圖。
const fs = require('fs');
const { test, expect } = require('@playwright/test');

const ADMIN = { email: 'admin@hexschool.com', password: '12345678' };
const ECPAY_URL = /ecpay\.com\.tw/;

// 在 context 的所有分頁與 iframe 中，找出第一個可見的元素（綠界可能開新視窗或使用 iframe）。
async function findVisible(context, makeLocator, timeout, label) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const page of context.pages()) {
      for (const frame of page.frames()) {
        // 綠界頁面每種付款方式都有隱藏的「前往付款」等同名元素，必須先篩可見的再取第一個
        const locator = makeLocator(frame).filter({ visible: true }).first();
        if (await locator.isVisible().catch(() => false)) return { page, frame, locator };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (label) throw new Error(`${Math.round(timeout / 1000)} 秒內找不到：${label}`);
  return null;
}

async function apiAs(request, token, path) {
  const res = await request.get(path, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.ok(), `${path} → ${res.status()}`).toBeTruthy();
  return (await res.json()).data;
}

test.describe('綠界網路 ATM 付款完整流程', () => {
  test.beforeAll(async ({ request, baseURL }) => {
    let res;
    try {
      res = await request.get('/api/shipping/quote?subtotal=0');
    } catch (err) {
      throw new Error(`無法連線 ${baseURL}，請先在另一個終端機執行 npm start（E2E 不會自行啟動伺服器）。\n${err.message}`);
    }
    if (res.status() === 404) {
      throw new Error(`${baseURL} 沒有 /api/shipping/quote，伺服器可能還在跑舊版程式，請重新啟動 npm start。`);
    }
    expect(res.ok()).toBeTruthy();
  });

  test.afterEach(async ({ context }, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus) return;
    // 失敗時保存每個分頁的網址、HTML 與截圖，方便調整綠界頁面的選擇器
    for (const [i, page] of context.pages().entries()) {
      const html = await page.content().catch(() => '');
      const htmlPath = testInfo.outputPath(`page-${i}.html`);
      fs.writeFileSync(htmlPath, `<!-- ${page.url()} -->\n${html}`);
      await testInfo.attach(`page-${i}.html`, { path: htmlPath, contentType: 'text/html' });
      await page.screenshot({ path: testInfo.outputPath(`page-${i}.png`), fullPage: true }).catch(() => {});
    }
  });

  test('會員下單後以網路 ATM（台灣土地銀行）付款成功，返回商店顯示已付款', async ({ page, context, request, baseURL }, testInfo) => {
    const dialogs = [];
    const watchDialogs = (p) => p.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.accept().catch(() => {});
    });
    watchDialogs(page);
    context.on('page', watchDialogs);

    let token;
    let product;
    let orderId;
    let order;

    await test.step('1. 登入花卉電商', async () => {
      await page.goto('/login');
      await page.getByPlaceholder('請輸入 Email').fill(ADMIN.email);
      await page.getByPlaceholder('請輸入密碼').fill(ADMIN.password);
      await page.locator('form').getByRole('button', { name: '登入' }).click();
      await page.waitForURL((url) => url.pathname === '/');
      token = await page.evaluate(() => localStorage.getItem('flower_token'));
      expect(token, '登入後應取得 JWT').toBeTruthy();
    });

    await test.step('2. 選擇商品並加入購物車', async () => {
      // 先清空這個帳號既有的購物車，讓訂單內容可預期
      const cart = await apiAs(request, token, '/api/cart');
      for (const item of cart.items) {
        const res = await request.delete(`/api/cart/${item.id}`, { headers: { Authorization: `Bearer ${token}` } });
        expect(res.ok()).toBeTruthy();
      }
      // 選一項有庫存、單價未達免運門檻的商品（運費才會出現在訂單上）
      const { products } = await apiAs(request, token, '/api/products?limit=100');
      product = products
        .filter((p) => p.stock > 0 && p.price < 1500)
        .sort((a, b) => b.stock - a.stock)[0];
      expect(product, '需要至少一項有庫存且單價低於 1,500 的商品').toBeTruthy();

      await page.goto('/');
      const card = page.locator('div.bg-white', { has: page.getByRole('heading', { name: product.name, exact: true }) });
      const added = page.waitForResponse((res) => res.url().endsWith('/api/cart') && res.request().method() === 'POST');
      await card.getByRole('button', { name: '加入購物車' }).click();
      expect((await added).ok()).toBeTruthy();

      const after = await apiAs(request, token, '/api/cart');
      expect(after.items).toHaveLength(1);
      expect(after.items[0]).toMatchObject({ product_id: product.id, quantity: 1 });
    });

    await test.step('3. 進入結帳頁面', async () => {
      await page.goto('/cart');
      await expect(page.getByText(product.name)).toBeVisible();
      await page.getByRole('button', { name: '前往結帳' }).click();
      await page.waitForURL('**/checkout');
      await expect(page.getByRole('heading', { name: '結帳' })).toBeVisible();
    });

    await test.step('4. 填寫配送方式與結帳資料', async () => {
      await page.getByPlaceholder('請輸入收件人姓名').fill('E2E 測試收件人');
      await page.getByPlaceholder('請輸入 Email').fill(ADMIN.email);
      await page.getByPlaceholder('請輸入收件地址').fill('台北市信義區 E2E 測試路 1 號');
      await page.locator('input[type="radio"][value="home_delivery"]').check();
      const quoted = page.waitForResponse((res) => res.url().includes('/api/shipping/quote') && res.url().includes('isUrgent=true'));
      await page.locator('label', { hasText: '當日急件' }).locator('input[type="checkbox"]').check();
      expect((await quoted).ok()).toBeTruthy();

      // 摘要：宅配 120 + 當日急件 250
      const total = product.price + 120 + 250;
      await expect(page.getByText('當日急件加收', { exact: true })).toBeVisible();
      await expect(page.getByText(`NT$ ${total.toLocaleString('en-US')}`, { exact: true })).toBeVisible();
    });

    await test.step('5. 建立訂單', async () => {
      await page.getByRole('button', { name: '確認送出訂單' }).click();
      await page.waitForURL(/\/orders\/[^/?]+$/);
      orderId = new URL(page.url()).pathname.split('/').pop();

      order = await apiAs(request, token, `/api/orders/${orderId}`);
      expect(order).toMatchObject({
        status: 'pending',
        shipping_method: 'home_delivery',
        subtotal_amount: product.price,
        base_shipping_fee: 120,
        urgent_surcharge: 250,
        shipping_fee: 370,
        total_amount: product.price + 370,
      });
      await expect(page.getByText('待付款', { exact: true })).toBeVisible();
      await expect(page.getByText('當日急件加收', { exact: true })).toBeVisible();
    });

    await test.step('6. 前往綠界測試環境', async () => {
      await page.getByRole('button', { name: '前往綠界付款' }).click();
      // 綠界頁面有外部資源可能一直載不完，不等 load 事件
      await page.waitForURL(ECPAY_URL, { waitUntil: 'commit', timeout: 60 * 1000 });
      await page.waitForLoadState('domcontentloaded');
    });

    await test.step('7. 選擇「網路 ATM」', async () => {
      const { locator } = await findVisible(context, (f) => f.locator('li#liWebATM')
        .or(f.getByText(/網路\s*ATM/i)), 60 * 1000, '付款方式「網路 ATM」');
      await locator.click();
    });

    await test.step('8. 選擇「台灣土地銀行」', async () => {
      const select = await findVisible(context, (f) => f.locator('select#selWebATMBank')
        .or(f.locator('select').filter({ has: f.locator('option', { hasText: /土地銀行/ }) })), 15 * 1000);
      if (select) {
        const value = await select.locator.locator('option', { hasText: /台灣土地銀行/ }).first().getAttribute('value');
        await select.locator.selectOption(value); // 例如 10001@2010@WebATM_LAND
        expect(value).toMatch(/WebATM_LAND/);
      } else {
        const { locator } = await findVisible(context, (f) => f.getByRole('radio', { name: /土地銀行/ })
          .or(f.getByText(/台灣土地銀行/))
          .or(f.getByText(/土地銀行/)), 30 * 1000, '銀行「台灣土地銀行」');
        await locator.click();
      }
    });

    await test.step('9. 點擊「前往付款」', async () => {
      const { locator } = await findVisible(context, (f) => f.locator('#WebATMPaySubmit')
        .or(f.getByRole('button', { name: /前往付款/ }))
        .or(f.locator('input[type="submit"][value*="前往付款"], input[type="button"][value*="前往付款"]'))
        .or(f.getByText(/前往付款/)), 30 * 1000, '「前往付款」按鈕');
      await locator.click();
    });

    await test.step('10. 關閉提示視窗', async () => {
      // 可能是瀏覽器 alert（已自動按確定）或頁面上的提示框；沒有出現就略過
      // 綠界的提示框是 simplert（「綠界科技貼心提醒您，將跳轉至銀行頁面進行後續付款!」），關閉鈕 #btnClose 沒有文字
      const prompt = await findVisible(context, (f) => f.locator('#btnClose, .simplert__close')
        .or(f.getByRole('button', { name: /^(關閉|確定|我知道了|OK|Close|×)$/i })), 15 * 1000);
      if (prompt) {
        testInfo.annotations.push({ type: '提示視窗', description: (await prompt.locator.innerText().catch(() => '')) || '(關閉按鈕)' });
        await prompt.locator.click();
      }
      if (dialogs.length) testInfo.annotations.push({ type: '瀏覽器對話框', description: dialogs.join(' | ') });
    });

    await test.step('11. 在土地銀行測試頁面點擊 Save', async () => {
      const { locator } = await findVisible(context, (f) => f.getByRole('button', { name: /^save$/i })
        .or(f.locator('input[type="submit"][value="Save" i], input[type="button"][value="Save" i]')), 90 * 1000, '土地銀行測試頁的「Save」');
      await locator.click();
    });

    // 綠界付款完成後的兩種回站方式：
    // (a) 顯示付款成功頁，按「返回商店」回站；
    // (b) 只顯示約 5 秒「交易資料傳輸中…」後自動 POST 到 OrderResultURL（/ecpay/return）回站。
    //     本專案有設定 OrderResultURL，2026-11-23 實測測試環境的網路 ATM 是 (b)，不會出現「返回商店」按鈕。
    const returnUrl = `${baseURL}/ecpay/return`;
    let autoReturned = false;
    context.on('request', (req) => {
      if (req.method() === 'POST' && req.url() === returnUrl) autoReturned = true;
    });
    const orderPage = () => context.pages().find((p) => p.url().startsWith(`${baseURL}/orders/${orderId}`));

    let ecpaySuccess;
    await test.step('12. 等待綠界顯示付款成功', async () => {
      const deadline = Date.now() + 2 * 60 * 1000;
      while (!ecpaySuccess && !orderPage()) {
        expect(Date.now() < deadline, '2 分鐘內綠界沒有顯示付款成功，也沒有返回商店').toBeTruthy();
        for (const p of context.pages().filter((pg) => ECPAY_URL.test(pg.url()))) {
          const text = p.getByText(/付款成功|交易成功|付款完成/).filter({ visible: true }).first();
          if (await text.isVisible().catch(() => false)) ecpaySuccess = { page: p, text: (await text.innerText()).trim() };
        }
        if (!ecpaySuccess) await new Promise((resolve) => setTimeout(resolve, 500));
      }
      testInfo.annotations.push(ecpaySuccess
        ? { type: '綠界結果', description: `綠界顯示：${ecpaySuccess.text}` }
        : { type: '綠界結果', description: '綠界付款完成後自動以 OrderResultURL（POST /ecpay/return）返回商店，未停留在付款成功頁' });
    });

    let resultPage;
    await test.step('13. 點擊「返回商店」', async () => {
      if (ecpaySuccess && !orderPage()) {
        const { locator } = await findVisible(context, (f) => f.getByRole('link', { name: /返回商店/ })
          .or(f.getByRole('button', { name: /返回商店/ }))
          .or(f.locator('input[value*="返回商店"]'))
          .or(f.getByText(/返回商店/)), 30 * 1000, '「返回商店」');
        await locator.click();
      } else {
        testInfo.annotations.push({ type: '返回商店', description: '綠界已自動返回商店，不需點擊' });
      }
      const deadline = Date.now() + 60 * 1000;
      while (!(resultPage = orderPage())) {
        expect(Date.now() < deadline, `應回到 ${baseURL}/orders/${orderId}`).toBeTruthy();
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!ecpaySuccess) expect(autoReturned, '自動返回時應經過 POST /ecpay/return（OrderResultURL）').toBe(true);
      await resultPage.waitForLoadState('domcontentloaded');
    });

    await test.step('14. 驗證訂單顯示「已付款」', async () => {
      // 回站後頁面會自動向後端查詢；綠界查詢結果可能稍晚才更新，必要時按「重新查詢付款結果」（後端限制 10 秒一次）
      const paidBadge = resultPage.getByText('已付款', { exact: true });
      const retry = resultPage.getByRole('button', { name: '重新查詢付款結果' });
      const deadline = Date.now() + 2 * 60 * 1000;
      let lastRetry = Date.now();
      while (!(await paidBadge.isVisible().catch(() => false))) {
        expect(Date.now() < deadline, '2 分鐘內訂單沒有變成「已付款」').toBeTruthy();
        if (Date.now() - lastRetry > 12 * 1000 && (await retry.isEnabled().catch(() => false))) {
          await retry.click();
          lastRetry = Date.now();
        }
        await resultPage.waitForTimeout(1000);
      }
      await expect(paidBadge).toBeVisible();
      await expect(resultPage.getByRole('button', { name: '前往綠界付款' })).toHaveCount(0);

      // 付款並返回站點後的成功截圖
      const shot = testInfo.outputPath('ecpay-webatm-paid.png');
      await resultPage.screenshot({ path: shot, fullPage: true });
      await testInfo.attach('付款成功並返回站點', { path: shot, contentType: 'image/png' });
      fs.copyFileSync(shot, 'test-results/ecpay-webatm-paid.png');
    });

    await test.step('15. 驗證訂單狀態為 paid', async () => {
      const paid = await apiAs(request, token, `/api/orders/${orderId}`);
      expect(paid.status).toBe('paid');
      expect(paid.total_amount).toBe(order.total_amount);
      testInfo.annotations.push({ type: '訂單', description: `${paid.order_no}（${orderId}）NT$ ${paid.total_amount} → ${paid.status}` });
    });
  });
});
