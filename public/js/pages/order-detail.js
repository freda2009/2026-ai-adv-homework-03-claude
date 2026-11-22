const { createApp, ref, onMounted } = Vue;

// 以隱藏表單 POST 到綠界（全頁跳轉；綠界付款頁不可放在 iframe 內）。
// 以 createElement 與屬性賦值建立表單，欄位值不會被當成 HTML 解析。
function submitToEcpay(checkout) {
  const form = document.createElement('form');
  form.method = checkout.method;
  form.action = checkout.action;
  form.style.display = 'none';
  Object.keys(checkout.fields).forEach(function (name) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = checkout.fields[name];
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const el = document.getElementById('app');
    const orderId = el.dataset.orderId;
    // 網址的 ?payment=checking 只用來決定「是否自動向綠界查詢」。
    // 成功／失敗一律以後端查詢結果為準，不信任網址上的值。
    const returnedFromEcpay = el.dataset.paymentResult === 'checking';
    const paymentResult = ref(returnedFromEcpay ? 'checking' : null);
    const verifyMessage = ref('');

    const order = ref(null);
    const loading = ref(true);
    const paying = ref(false);
    const verifying = ref(false);

    const statusMap = {
      pending: { label: '待付款', cls: 'bg-apricot/20 text-apricot' },
      paid: { label: '已付款', cls: 'bg-sage/20 text-sage' },
      failed: { label: '付款失敗', cls: 'bg-red-100 text-red-600' },
    };

    // 配送方式顯示名稱；shipping_method 為 null 的是運費功能上線前的舊訂單。
    const shippingMethodLabels = {
      home_delivery: '宅配',
      convenience_store: '超商取貨',
    };

    const paymentMessages = {
      checking: { text: '正在向綠界確認付款結果…', cls: 'bg-gray-50 text-text-secondary border border-gray-100' },
      success: { text: '付款成功！感謝您的購買。', cls: 'bg-sage/10 text-sage border border-sage/20' },
      failed: { text: '付款未完成，您可以重新付款。', cls: 'bg-red-50 text-red-600 border border-red-100' },
      pending: { text: '尚未確認付款，請稍後再重新查詢。', cls: 'bg-apricot/10 text-apricot border border-apricot/20' },
    };

    async function loadOrder() {
      const res = await apiFetch('/api/orders/' + orderId);
      order.value = res.data;
    }

    async function startCheckout() {
      if (!order.value || paying.value || verifying.value) return;
      paying.value = true;
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/ecpay/checkout', { method: 'POST' });
        // 全頁跳轉到綠界；不重設 paying，避免跳轉前被重複點擊
        submitToEcpay(res.data);
      } catch (err) {
        paying.value = false;
        if (err && err.status === 409) {
          // 舊的交易其實已付款：重新載入訂單以顯示最新狀態
          try { await loadOrder(); paymentResult.value = 'success'; } catch (e) {}
        }
        Notification.show((err && err.data && err.data.message) || '無法前往綠界付款', 'error');
      }
    }

    async function verifyPayment() {
      if (!order.value || verifying.value || paying.value) return;
      verifying.value = true;
      verifyMessage.value = '';
      paymentResult.value = 'checking';
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/ecpay/verify', { method: 'POST' });
        order.value = res.data.order;
        const map = { paid: 'success', failed: 'failed', pending: 'pending' };
        paymentResult.value = map[res.data.result] || 'pending';
        if (res.data.result === 'pending') verifyMessage.value = res.message;
      } catch (err) {
        paymentResult.value = null;
        const status = err && err.status;
        Notification.show((err && err.data && err.data.message) || '查詢付款結果失敗', status === 429 ? 'warning' : 'error');
      } finally {
        verifying.value = false;
      }
    }

    onMounted(async function () {
      try {
        await loadOrder();
      } catch (e) {
        Notification.show('載入訂單失敗', 'error');
        paymentResult.value = null;
      } finally {
        loading.value = false;
      }
      if (!order.value) return;
      if (order.value.status === 'paid') {
        paymentResult.value = returnedFromEcpay ? 'success' : null;
      } else if (returnedFromEcpay) {
        verifyPayment();
      } else {
        paymentResult.value = null;
      }
    });

    return {
      order, loading, paying, verifying, paymentResult, verifyMessage, statusMap, paymentMessages,
      shippingMethodLabels, startCheckout, verifyPayment
    };
  }
}).mount('#app');
