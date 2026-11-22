const { createApp, ref, computed, onMounted } = Vue;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const loading = ref(true);
    const submitting = ref(false);
    const cartItems = ref([]);
    // 預填登入帳號的姓名與 Email（使用者可自行修改）；帳號沒有地址，地址維持空白。
    // 配送選項預設宅配、非偏遠、非急件（與後端預設相同）。
    const user = Auth.getUser();
    const form = ref({
      recipientName: (user && user.name) || '',
      recipientEmail: (user && user.email) || '',
      recipientAddress: '',
      shippingMethod: 'home_delivery',
      isRemoteArea: false,
      isUrgent: false
    });
    const errors = ref({});
    // 運費試算結果（GET /api/shipping/quote）；只用於顯示，實際金額由建立訂單時後端重新計算。
    const quote = ref(null);
    const quoteFailed = ref(false);

    const cartTotal = computed(function () {
      return cartItems.value.reduce(function (sum, item) {
        return sum + item.product.price * item.quantity;
      }, 0);
    });

    // 多次快速切換選項時，只採用最後一次請求的結果。
    let quoteSeq = 0;
    async function refreshQuote() {
      const seq = ++quoteSeq;
      const query = [
        'subtotal=' + encodeURIComponent(cartTotal.value),
        'shippingMethod=' + encodeURIComponent(form.value.shippingMethod),
        'isRemoteArea=' + (form.value.isRemoteArea ? 'true' : 'false'),
        'isUrgent=' + (form.value.isUrgent ? 'true' : 'false')
      ].join('&');
      try {
        const res = await apiFetch('/api/shipping/quote?' + query);
        if (seq !== quoteSeq) return;
        quote.value = res.data;
        quoteFailed.value = false;
      } catch (e) {
        if (seq !== quoteSeq) return;
        quote.value = null;
        quoteFailed.value = true;
      }
    }

    function validate() {
      errors.value = {};
      if (!form.value.recipientName.trim()) errors.value.recipientName = '請輸入收件人姓名';
      if (!form.value.recipientEmail.trim()) {
        errors.value.recipientEmail = '請輸入 Email';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.recipientEmail)) {
        errors.value.recipientEmail = 'Email 格式不正確';
      }
      if (!form.value.recipientAddress.trim()) {
        errors.value.recipientAddress = form.value.shippingMethod === 'convenience_store'
          ? '請輸入取貨門市'
          : '請輸入收件地址';
      }
      return Object.keys(errors.value).length === 0;
    }

    async function submitOrder() {
      if (!validate() || submitting.value) return;
      submitting.value = true;
      try {
        const res = await apiFetch('/api/orders', {
          method: 'POST',
          body: JSON.stringify(form.value)
        });
        Notification.show('訂單已建立', 'success');
        window.location.href = '/orders/' + res.data.id;
      } catch (err) {
        Notification.show(err?.data?.message || '訂單建立失敗', 'error');
      } finally {
        submitting.value = false;
      }
    }

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/cart');
        cartItems.value = res.data.items;
        if (cartItems.value.length === 0) {
          window.location.href = '/cart';
          return;
        }
      } catch (e) {
        window.location.href = '/cart';
        return;
      }
      loading.value = false;
      await refreshQuote();
    });

    return { loading, submitting, cartItems, form, errors, cartTotal, quote, quoteFailed, refreshQuote, submitOrder };
  }
}).mount('#app');
