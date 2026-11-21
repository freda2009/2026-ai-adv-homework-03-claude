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
    });
  });

  it('取不到登入資料或欄位缺漏時，對應欄位為空字串（不會顯示 undefined）', () => {
    expect(loadPage({ user: null }).page.form.value)
      .toEqual({ recipientName: '', recipientEmail: '', recipientAddress: '' });
    expect(loadPage({ user: { email: 'only@example.com' } }).page.form.value)
      .toEqual({ recipientName: '', recipientEmail: 'only@example.com', recipientAddress: '' });
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
