const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, '..', 'public', 'js', 'header-init.js');
const source = fs.readFileSync(file, 'utf8');

// 最小的假 DOM：只實作 header-init.js 會用到的方法。
// innerHTML／outerHTML 設成會丟錯的 setter，確保腳本不會用字串組 HTML。
function makeEl(tag) {
  return {
    tag,
    className: '',
    textContent: '',
    href: '',
    style: {},
    children: [],
    listeners: {},
    replaceChildren(...nodes) { this.children = nodes; },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    set innerHTML(_v) { throw new Error('不應使用 innerHTML'); },
    set outerHTML(_v) { throw new Error('不應使用 outerHTML'); },
  };
}

async function run({ loggedIn, admin = false, user = null, cartItems = [] }) {
  const els = {
    'auth-nav': makeEl('div'),
    'cart-badge': makeEl('span'),
    'orders-link': makeEl('a'),
  };
  let onReady;
  const logout = vi.fn();
  const ctx = {
    document: {
      getElementById: (id) => els[id] || null,
      createElement: (tag) => makeEl(tag),
      addEventListener: (type, fn) => { if (type === 'DOMContentLoaded') onReady = fn; },
    },
    Auth: {
      isLoggedIn: () => loggedIn,
      isAdmin: () => admin,
      getUser: () => user,
      logout,
    },
    apiFetch: () => Promise.resolve({ data: { items: cartItems } }),
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  onReady();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { els, logout };
}

describe('header-init.js', () => {
  it('原始碼不含 innerHTML／outerHTML／insertAdjacentHTML', () => {
    expect(source).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
  });

  it('使用者名稱含 HTML 時只當純文字顯示，不會被解析', async () => {
    const evil = '<img src=x onerror=alert(1)>';
    const { els } = await run({ loggedIn: true, user: { name: evil } });

    const nameEl = els['auth-nav'].children.find((c) => c.tag === 'span');
    expect(nameEl).toBeDefined();
    expect(nameEl.textContent).toBe(evil);
  });

  it('管理員會多一個「後台管理」連結，一般使用者沒有', async () => {
    const admin = await run({ loggedIn: true, admin: true, user: { name: 'A' } });
    const link = admin.els['auth-nav'].children.find((c) => c.tag === 'a');
    expect(link).toMatchObject({ href: '/admin/products', textContent: '後台管理' });

    const normal = await run({ loggedIn: true, admin: false, user: { name: 'B' } });
    expect(normal.els['auth-nav'].children.some((c) => c.tag === 'a')).toBe(false);
  });

  it('登出按鈕點擊時呼叫 Auth.logout()', async () => {
    const { els, logout } = await run({ loggedIn: true, user: { name: 'A' } });

    const button = els['auth-nav'].children.find((c) => c.tag === 'button');
    expect(button.textContent).toBe('登出');
    button.listeners.click();

    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('未登入：顯示「登入」連結並隱藏「我的訂單」', async () => {
    const { els } = await run({ loggedIn: false });

    expect(els['auth-nav'].children).toHaveLength(1);
    expect(els['auth-nav'].children[0]).toMatchObject({ tag: 'a', href: '/login', textContent: '登入' });
    expect(els['orders-link'].style.display).toBe('none');
  });

  it('已登入：顯示「我的訂單」，user 為 null 時名稱為空字串', async () => {
    const { els } = await run({ loggedIn: true, user: null });

    expect(els['orders-link'].style.display).toBe('');
    const nameEl = els['auth-nav'].children.find((c) => c.tag === 'span');
    expect(nameEl.textContent).toBe('');
  });

  it('購物車有項目時更新徽章數量', async () => {
    const { els } = await run({ loggedIn: false, cartItems: [{}, {}, {}] });

    expect(els['cart-badge'].textContent).toBe(3);
    expect(els['cart-badge'].style.display).toBe('flex');
  });
});
