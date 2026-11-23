const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'pages', 'order-detail.js'), 'utf8');

// 最小的假 DOM；innerHTML 設成會丟錯的 setter，確保腳本不會用字串組 HTML。
function makeEl(tag) {
  return {
    tag, style: {}, children: [], submit: vi.fn(),
    appendChild(child) { this.children.push(child); },
    set innerHTML(_v) { throw new Error('不應使用 innerHTML'); },
  };
}

// 載入頁面腳本（Vue 以假物件取代，ref 只保留 .value）。
function loadPage({ paymentResult = '', apiFetch }) {
  let options;
  const mounted = [];
  const body = makeEl('body');
  const notifications = [];
  const ctx = {
    Vue: {
      createApp: (opts) => { options = opts; return { mount: () => {} }; },
      ref: (value) => ({ value }),
      onMounted: (fn) => mounted.push(fn),
    },
    Auth: { requireAuth: () => true },
    document: { getElementById: () => ({ dataset: { orderId: 'o1', paymentResult } }), createElement: makeEl, body },
    apiFetch,
    Notification: { show: (message, type) => notifications.push([message, type]) },
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return { page: options.setup(), mounted, body, notifications };
}

const pendingOrder = { id: 'o1', status: 'pending', items: [] };

describe('order-detail.js（訂單詳情頁）', () => {
  it('原始碼不含 innerHTML', () => {
    expect(source).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|v-html/);
  });

  it('前往綠界付款：以隱藏表單 POST，欄位值原樣放入 input，不被當成 HTML', async () => {
    const checkout = {
      action: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
      method: 'POST',
      fields: { MerchantID: '3002607', ItemName: '<img src=x onerror=alert(1)> "引號"', CheckMacValue: 'ABC' },
    };
    const apiFetch = vi.fn().mockResolvedValue({ data: checkout });
    const { page, body } = loadPage({ apiFetch });
    page.order.value = pendingOrder;

    await page.startCheckout();

    expect(apiFetch).toHaveBeenCalledWith('/api/orders/o1/ecpay/checkout', { method: 'POST' });
    const form = body.children[0];
    expect(form).toMatchObject({ tag: 'form', method: 'POST', action: checkout.action });
    expect(form.style.display).toBe('none');
    expect(form.submit).toHaveBeenCalledTimes(1);
    expect(form.children.map((i) => [i.type, i.name, i.value])).toEqual([
      ['hidden', 'MerchantID', '3002607'],
      ['hidden', 'ItemName', '<img src=x onerror=alert(1)> "引號"'],
      ['hidden', 'CheckMacValue', 'ABC'],
    ]);
    expect(page.paying.value).toBe(true); // 跳轉前保持 true，避免重複點擊
  });

  it('建立付款失敗：顯示後端訊息並恢復按鈕；409（已付款）會重新載入訂單並顯示成功', async () => {
    const apiFetch = vi.fn(async (url) => {
      if (url.endsWith('/checkout')) throw { status: 409, data: { message: '此訂單已完成付款' } };
      return { data: { id: 'o1', status: 'paid', items: [] } };
    });
    const { page, notifications } = loadPage({ apiFetch });
    page.order.value = pendingOrder;

    await page.startCheckout();

    expect(page.paying.value).toBe(false);
    expect(page.order.value.status).toBe('paid');
    expect(page.paymentResult.value).toBe('success');
    expect(notifications[0]).toEqual(['此訂單已完成付款', 'error']);
  });

  it.each([
    ['paid', 'success'],
    ['failed', 'failed'],
    ['pending', 'pending'],
  ])('重新查詢：後端 result=%s 時橫幅為 %s，並更新訂單', async (result, banner) => {
    const apiFetch = vi.fn().mockResolvedValue({
      data: { result, order: { ...pendingOrder, status: result === 'paid' ? 'paid' : 'pending' } },
      message: '尚未確認付款，請稍後再重新查詢',
    });
    const { page } = loadPage({ apiFetch });
    page.order.value = pendingOrder;

    await page.verifyPayment();

    expect(apiFetch).toHaveBeenCalledWith('/api/orders/o1/ecpay/verify', { method: 'POST' });
    expect(page.paymentResult.value).toBe(banner);
    expect(page.order.value.status).toBe(result === 'paid' ? 'paid' : 'pending');
    expect(page.verifyMessage.value).toBe(result === 'pending' ? '尚未確認付款，請稍後再重新查詢' : '');
    expect(page.verifying.value).toBe(false);
  });

  it('查詢過於頻繁（429）：顯示警告、不顯示任何付款結果橫幅', async () => {
    const apiFetch = vi.fn().mockRejectedValue({ status: 429, data: { message: '查詢過於頻繁，請稍後再試' } });
    const { page, notifications } = loadPage({ apiFetch });
    page.order.value = pendingOrder;

    await page.verifyPayment();

    expect(page.paymentResult.value).toBeNull();
    expect(notifications[0]).toEqual(['查詢過於頻繁，請稍後再試', 'warning']);
  });

  it('從綠界導回（?payment=checking）且訂單 pending：載入後自動向後端查詢', async () => {
    const apiFetch = vi.fn(async (url) => {
      if (url === '/api/orders/o1') return { data: pendingOrder };
      return { data: { result: 'paid', order: { ...pendingOrder, status: 'paid' } }, message: '付款成功' };
    });
    const { page, mounted } = loadPage({ paymentResult: 'checking', apiFetch });
    expect(page.paymentResult.value).toBe('checking');

    await mounted[0]();
    await vi.waitFor(() => expect(page.paymentResult.value).toBe('success'));

    expect(apiFetch).toHaveBeenCalledWith('/api/orders/o1/ecpay/verify', { method: 'POST' });
  });

  it('不信任網址參數：?payment=success 不會顯示成功，也不會觸發查詢', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ data: pendingOrder });
    const { page, mounted } = loadPage({ paymentResult: 'success', apiFetch });

    await mounted[0]();

    expect(page.paymentResult.value).toBeNull();
    expect(apiFetch).toHaveBeenCalledTimes(1); // 只有載入訂單
  });
});
