async function apiFetch(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...Auth.getAuthHeaders(),
    ...options.headers
  };

  const res = await fetch(url, { ...options, headers });

  // 登入／註冊的 401 是「帳密錯誤」，不是登入過期：交給呼叫端顯示錯誤訊息，不導向。
  const isCredentialRequest = /^\/api\/auth\/(login|register)$/.test(url.split('?')[0]);

  if (res.status === 401 && !isCredentialRequest) {
    localStorage.removeItem(Auth.TOKEN_KEY);
    localStorage.removeItem(Auth.USER_KEY);
    // 已在 /login 頁就不再導向，避免無謂的重新載入
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    return;
  }

  const data = await res.json();

  if (!res.ok) {
    throw { status: res.status, data };
  }

  return data;
}
