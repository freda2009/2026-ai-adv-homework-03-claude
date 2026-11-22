const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'pages', 'checkout.js'), 'utf8');

// 載入頁面腳本（Vue 以假物件取代：ref 只保留 .value，computed 每次讀取時重新計算）。
function loadPage({ user, apiFetch = vi.fn() }) {
  let options;
  const mounted = [];
  const notifications = [];
  const ctx = {
    Vue: {
      createApp: (opts) => { options = opts; return { mount: () => {} }; },
      ref: (value) => ({ value }),
      computed: (fn) => ({ get value() { return fn(); } }),
      onMounted: (fn) => mounted.push(fn),
    },
    Auth: { requireAuth: () => true, getUser: () => user },
    window: { location: { href: '' } },
    Notification: { show: (message, type) => notifications.push([message, type]) },
    apiFetch,
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return { page: options.setup(), ctx, mounted, notifications };
}

const member = { id: 'u1', name: '王小明', email: 'ming@example.com', role: 'user' };

describe('checkout.js（結帳頁）收件資料預填', () => {
  it('自動帶入登入帳號的姓名與 Email，地址維持空白', () => {
    const { page } = loadPage({ user: member });

    expect(page.form.value).toEqual({
      recipientName: '王小明',
      recipientEmail: 'ming@example.com',
      recipientAddress: '',
      shippingMethod: 'home_delivery',
      isRemoteArea: false,
      isUrgent: false,
    });
  });

  it('取不到登入資料或欄位缺漏時，對應欄位為空字串（不會顯示 undefined）', () => {
    expect(loadPage({ user: null }).page.form.value)
      .toMatchObject({ recipientName: '', recipientEmail: '', recipientAddress: '' });
    expect(loadPage({ user: { email: 'only@example.com' } }).page.form.value)
      .toMatchObject({ recipientName: '', recipientEmail: 'only@example.com', recipientAddress: '' });
  });

  it('不改動預填值直接送出：以帳號的姓名與 Email 建立訂單', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ data: { id: 'o1' } });
    const { page, ctx } = loadPage({ user: member, apiFetch });
    page.form.value.recipientAddress = '台北市測試路 1 號';

    await page.submitOrder();

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, options] = apiFetch.mock.calls[0];
    expect(url).toBe('/api/orders');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      recipientName: '王小明',
      recipientEmail: 'ming@example.com',
      recipientAddress: '台北市測試路 1 號',
      shippingMethod: 'home_delivery',
      isRemoteArea: false,
      isUrgent: false,
    });
    expect(ctx.window.location.href).toBe('/orders/o1');
  });

  it('使用者可以自行修改預填值，送出的是修改後的內容', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ data: { id: 'o2' } });
    const { page } = loadPage({ user: member, apiFetch });
    page.form.value.recipientName = '李大華';
    page.form.value.recipientEmail = 'gift@example.com';
    page.form.value.recipientAddress = '高雄市送禮路 2 號';

    await page.submitOrder();

    expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toEqual({
      recipientName: '李大華',
      recipientEmail: 'gift@example.com',
      recipientAddress: '高雄市送禮路 2 號',
      shippingMethod: 'home_delivery',
      isRemoteArea: false,
      isUrgent: false,
    });
  });

  it('清空預填的欄位後仍會驗證，不會送出', async () => {
    const apiFetch = vi.fn();
    const { page } = loadPage({ user: member, apiFetch });
    page.form.value.recipientName = '   ';
    page.form.value.recipientEmail = 'not-an-email';

    await page.submitOrder();

    expect(apiFetch).not.toHaveBeenCalled();
    expect(page.errors.value).toMatchObject({
      recipientName: '請輸入收件人姓名',
      recipientEmail: 'Email 格式不正確',
      recipientAddress: '請輸入收件地址',
    });
  });
});

const cartResponse = {
  data: {
    items: [
      { id: 'c1', quantity: 1, product: { name: '粉色玫瑰花束', price: 1000 } },
      { id: 'c2', quantity: 2, product: { name: '迷你多肉組合盆', price: 250 } },
    ],
  },
};
const quoteResponse = {
  data: {
    subtotal_amount: 1500, shipping_method: 'convenience_store', base_shipping_fee: 60,
    remote_surcharge: 200, urgent_surcharge: 250, shipping_fee: 510, free_shipping_applied: false,
    total_amount: 2010, rates: {},
  },
};

describe('checkout.js（結帳頁）配送方式與運費試算', () => {
  it('載入購物車後以小計向後端試算運費（預設宅配、非偏遠、非急件）', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce(cartResponse)
      .mockResolvedValueOnce(quoteResponse);
    const { page, mounted } = loadPage({ user: member, apiFetch });

    await mounted[0]();

    expect(apiFetch.mock.calls[0][0]).toBe('/api/cart');
    expect(apiFetch.mock.calls[1][0])
      .toBe('/api/shipping/quote?subtotal=1500&shippingMethod=home_delivery&isRemoteArea=false&isUrgent=false');
    expect(page.loading.value).toBe(false);
    expect(page.quote.value).toEqual(quoteResponse.data);
    expect(page.quoteFailed.value).toBe(false);
  });

  it('切換配送選項後重新試算，網址帶入目前選項', async () => {
    const apiFetch = vi.fn().mockResolvedValue(quoteResponse);
    const { page } = loadPage({ user: member, apiFetch });
    page.cartItems.value = cartResponse.data.items;
    page.form.value.shippingMethod = 'convenience_store';
    page.form.value.isRemoteArea = true;
    page.form.value.isUrgent = true;

    await page.refreshQuote();

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/shipping/quote?subtotal=1500&shippingMethod=convenience_store&isRemoteArea=true&isUrgent=true'
    );
    expect(page.quote.value.shipping_fee).toBe(510);
  });

  it('試算失敗時不顯示舊結果，也不阻擋送出訂單', async () => {
    const apiFetch = vi.fn()
      .mockRejectedValueOnce({ status: 500, data: { message: '伺服器內部錯誤' } })
      .mockResolvedValueOnce({ data: { id: 'o3' } });
    const { page, ctx } = loadPage({ user: member, apiFetch });
    page.quote.value = quoteResponse.data;

    await page.refreshQuote();
    expect(page.quote.value).toBeNull();
    expect(page.quoteFailed.value).toBe(true);

    page.form.value.recipientAddress = '台北市測試路 1 號';
    await page.submitOrder();
    expect(apiFetch.mock.calls[1][0]).toBe('/api/orders');
    expect(ctx.window.location.href).toBe('/orders/o3');
  });

  it('連續切換時只採用最後一次試算的結果', async () => {
    let resolveFirst;
    const apiFetch = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ data: { shipping_fee: 60 } });
    const { page } = loadPage({ user: member, apiFetch });

    const first = page.refreshQuote();
    await page.refreshQuote();
    resolveFirst({ data: { shipping_fee: 120 } });
    await first;

    expect(page.quote.value).toEqual({ shipping_fee: 60 });
  });

  it('超商取貨時地址欄位提示改為取貨門市', async () => {
    const apiFetch = vi.fn();
    const { page } = loadPage({ user: member, apiFetch });
    page.form.value.shippingMethod = 'convenience_store';

    await page.submitOrder();

    expect(apiFetch).not.toHaveBeenCalled();
    expect(page.errors.value.recipientAddress).toBe('請輸入取貨門市');
  });
});
