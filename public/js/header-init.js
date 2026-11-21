document.addEventListener('DOMContentLoaded', function () {
  const authNav = document.getElementById('auth-nav');
  const cartBadge = document.getElementById('cart-badge');
  const ordersLink = document.getElementById('orders-link');

  // 以 DOM API 建立節點並用 textContent 設定文字，避免使用者名稱被當成 HTML 解析。
  function createNode(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  if (authNav) {
    const nodes = [];
    if (Auth.isLoggedIn()) {
      const user = Auth.getUser();
      if (Auth.isAdmin()) {
        const adminLink = createNode('a', 'text-rose-primary hover:text-rose-dark', '後台管理');
        adminLink.href = '/admin/products';
        nodes.push(adminLink);
      }
      nodes.push(createNode('span', 'text-text-secondary', user?.name || ''));
      const logoutButton = createNode('button', 'text-text-muted hover:text-rose-primary transition-colors', '登出');
      logoutButton.addEventListener('click', function () { Auth.logout(); });
      nodes.push(logoutButton);
    } else {
      const loginLink = createNode('a', 'bg-rose-primary text-white px-4 py-1.5 rounded-full hover:bg-rose-dark transition-colors', '登入');
      loginLink.href = '/login';
      nodes.push(loginLink);
    }
    authNav.replaceChildren(...nodes);
  }

  if (ordersLink) {
    ordersLink.style.display = Auth.isLoggedIn() ? '' : 'none';
  }

  if (cartBadge) {
    apiFetch('/api/cart').then(function (res) {
      if (res && res.data && res.data.items && res.data.items.length > 0) {
        cartBadge.textContent = res.data.items.length;
        cartBadge.style.display = 'flex';
      }
    }).catch(function () {});
  }
});
