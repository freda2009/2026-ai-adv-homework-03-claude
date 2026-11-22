const { createApp, ref, computed, watch, onMounted } = Vue;

createApp({
  setup() {
    const items = ref([]);
    const loading = ref(true);
    const confirmVisible = ref(false);
    const deleteItemId = ref('');

    const total = computed(function () {
      return items.value.reduce(function (sum, item) {
        return sum + item.product.price * item.quantity;
      }, 0);
    });

    // 預估運費（宅配、非偏遠、非急件）：由後端試算 API 計算，前端不寫死費率。
    // 配送方式、偏遠地區與當日急件在結帳頁選擇。
    const quote = ref(null);
    let quoteSeq = 0;
    async function refreshQuote() {
      const seq = ++quoteSeq;
      try {
        const res = await apiFetch('/api/shipping/quote?subtotal=' + encodeURIComponent(total.value));
        if (seq === quoteSeq) quote.value = res.data;
      } catch (e) {
        if (seq === quoteSeq) quote.value = null;
      }
    }
    // 數量變更、移除商品、載入購物車都會改變小計，統一在這裡重新試算。
    watch(total, function (value) {
      if (value > 0) refreshQuote();
    });

    async function loadCart() {
      loading.value = true;
      try {
        const res = await apiFetch('/api/cart');
        items.value = res.data.items;
      } catch (e) {
        Notification.show('載入購物車失敗', 'error');
      } finally {
        loading.value = false;
      }
    }

    async function updateQuantity(itemId, qty) {
      if (qty < 1) return;
      try {
        await apiFetch('/api/cart/' + itemId, {
          method: 'PATCH',
          body: JSON.stringify({ quantity: qty })
        });
        var item = items.value.find(function (i) { return i.id === itemId; });
        if (item) item.quantity = qty;
      } catch (e) {
        Notification.show('更新數量失敗', 'error');
      }
    }

    function confirmDelete(itemId) {
      deleteItemId.value = itemId;
      confirmVisible.value = true;
    }

    async function handleDelete() {
      confirmVisible.value = false;
      try {
        await apiFetch('/api/cart/' + deleteItemId.value, { method: 'DELETE' });
        items.value = items.value.filter(function (i) { return i.id !== deleteItemId.value; });
        Notification.show('已從購物車移除', 'success');
      } catch (e) {
        Notification.show('移除失敗', 'error');
      }
    }

    function goCheckout() {
      if (!Auth.isLoggedIn()) {
        window.location.href = '/login?redirect=/checkout';
        return;
      }
      window.location.href = '/checkout';
    }

    onMounted(function () {
      loadCart();
    });

    return {
      items, loading, total, quote, confirmVisible,
      updateQuantity, confirmDelete, handleDelete, goCheckout
    };
  }
}).mount('#app');
