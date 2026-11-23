const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 前端 public/js/api.js 是瀏覽器全域腳本，沒有 module 匯出；
// 這裡用 vm 載入，並注入最小的假 Auth／fetch／localStorage／window。
function loadApiFetch({ status = 200, body = {}, pathname = '/' } = {}) {
  const store = { flower_token: 'tok', flower_user: '{"name":"u"}' };
  const ctx = {
    Auth: {
      TOKEN_KEY: 'flower_token',
      USER_KEY: 'flower_user',
      getAuthHeaders: () => ({ 'X-Session-Id': 'sid' }),
    },
    localStorage: {
      removeItem: (k) => { delete store[k]; },
    },
    window: { location: { href: '', pathname } },
    fetch: async () => ({
      status,
      ok: status >= 200 && status < 300,
      json: async () => body,
    }),
  };
  vm.createContext(ctx);
  const file = path.join(__dirname, '..', '..', 'public', 'js', 'api.js');
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
  return { apiFetch: ctx.apiFetch, ctx, store };
}

describe('apiFetch 401 處理', () => {
  const credentialError = { data: null, error: 'UNAUTHORIZED', message: 'Email 或密碼錯誤' };

  it('登入失敗（401）應丟出錯誤供頁面顯示，不清除登入資料、不導向', async () => {
    const { apiFetch, ctx, store } = loadApiFetch({ status: 401, body: credentialError, pathname: '/login' });

    await expect(apiFetch('/api/auth/login', { method: 'POST' }))
      .rejects.toMatchObject({ status: 401, data: { message: 'Email 或密碼錯誤' } });

    expect(ctx.window.location.href).toBe('');
    expect(store.flower_token).toBe('tok');
  });

  it('註冊失敗（401）同樣不導向', async () => {
    const { apiFetch, ctx } = loadApiFetch({ status: 401, body: credentialError, pathname: '/login' });

    await expect(apiFetch('/api/auth/register', { method: 'POST' }))
      .rejects.toMatchObject({ status: 401 });

    expect(ctx.window.location.href).toBe('');
  });

  it('比對網址時忽略查詢字串', async () => {
    const { apiFetch, ctx } = loadApiFetch({ status: 401, body: credentialError, pathname: '/login' });

    await expect(apiFetch('/api/auth/login?x=1')).rejects.toMatchObject({ status: 401 });

    expect(ctx.window.location.href).toBe('');
  });

  it('其他 API 的 401（登入過期）應清除登入資料並導向 /login', async () => {
    const { apiFetch, ctx, store } = loadApiFetch({ status: 401, body: credentialError, pathname: '/orders' });

    const result = await apiFetch('/api/orders');

    expect(result).toBeUndefined();
    expect(ctx.window.location.href).toBe('/login');
    expect(store.flower_token).toBeUndefined();
    expect(store.flower_user).toBeUndefined();
  });

  it('已在 /login 頁時，其他 API 的 401 只清除登入資料，不重複導向', async () => {
    const { apiFetch, ctx, store } = loadApiFetch({ status: 401, body: credentialError, pathname: '/login' });

    const result = await apiFetch('/api/cart');

    expect(result).toBeUndefined();
    expect(ctx.window.location.href).toBe('');
    expect(store.flower_token).toBeUndefined();
  });

  it('成功回應回傳 JSON；其他錯誤碼丟出 { status, data } 且不導向', async () => {
    const ok = loadApiFetch({ status: 200, body: { data: 1, error: null, message: '成功' } });
    await expect(ok.apiFetch('/api/products')).resolves.toMatchObject({ data: 1 });

    const conflict = loadApiFetch({ status: 409, body: { data: null, error: 'CONFLICT', message: 'Email 已被註冊' } });
    await expect(conflict.apiFetch('/api/auth/register', { method: 'POST' }))
      .rejects.toMatchObject({ status: 409, data: { message: 'Email 已被註冊' } });
    expect(conflict.ctx.window.location.href).toBe('');
  });
});
