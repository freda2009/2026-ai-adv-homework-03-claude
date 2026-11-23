// 建立訂單時的運費整合：運費與總額由後端計算，並寫入訂單快照。
const { app, request, registerUser } = require('./setup');

const recipient = {
  recipientName: '運費測試',
  recipientEmail: 'shipping@example.com',
  recipientAddress: '台北市運費路 1 號',
};

describe('POST /api/orders 運費計算', () => {
  let token;
  let products;

  beforeAll(async () => {
    ({ token } = await registerUser());
    const res = await request(app).get('/api/products?limit=100');
    products = res.body.data.products;
  });

  // 依價格挑商品，不寫死 id：seed 有 980、1680 等價格。
  const byPrice = (price) => products.find((p) => p.price === price);

  async function fillCart(items) {
    for (const { productId, quantity } of items) {
      const res = await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId, quantity });
      expect(res.status).toBe(200);
    }
  }

  function createOrder(body) {
    return request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...recipient, ...body });
  }

  it('未指定配送方式：預設宅配，小計 980 加收 120，總額 1,100', async () => {
    await fillCart([{ productId: byPrice(980).id, quantity: 1 }]);

    const res = await createOrder({});

    expect(res.status).toBe(201);
    expect(res.body.error).toBeNull();
    expect(res.body.data).toMatchObject({
      subtotal_amount: 980,
      shipping_method: 'home_delivery',
      base_shipping_fee: 120,
      remote_surcharge: 0,
      urgent_surcharge: 0,
      shipping_fee: 120,
      total_amount: 1100,
      status: 'pending',
    });
  });

  it('超商取貨＋偏遠地區＋當日急件：60 + 200 + 250 = 510', async () => {
    await fillCart([{ productId: byPrice(980).id, quantity: 1 }]);

    const res = await createOrder({ shippingMethod: 'convenience_store', isRemoteArea: true, isUrgent: true });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      subtotal_amount: 980,
      shipping_method: 'convenience_store',
      base_shipping_fee: 60,
      remote_surcharge: 200,
      urgent_surcharge: 250,
      shipping_fee: 510,
      total_amount: 1490,
    });
  });

  it('宅配小計滿 1,500：免基本運費，附加費照收', async () => {
    await fillCart([{ productId: byPrice(1680).id, quantity: 1 }]);

    const res = await createOrder({ shippingMethod: 'home_delivery', isUrgent: true });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      subtotal_amount: 1680,
      base_shipping_fee: 0,
      urgent_surcharge: 250,
      shipping_fee: 250,
      total_amount: 1930,
    });
  });

  it('運費與總額以後端計算為準，忽略 body 夾帶的金額欄位', async () => {
    await fillCart([{ productId: byPrice(980).id, quantity: 2 }]);

    const res = await createOrder({ total_amount: 1, shipping_fee: 0, shippingFee: 0, totalAmount: 1 });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ subtotal_amount: 1960, base_shipping_fee: 0, shipping_fee: 0, total_amount: 1960 });
  });

  it.each([
    [{ shippingMethod: 'drone' }, /配送方式/],
    [{ shippingMethod: null }, /配送方式/],
    [{ isRemoteArea: 'true' }, /偏遠地區/],
    [{ isUrgent: 1 }, /當日急件/],
  ])('配送選項不合法 %o：400 VALIDATION_ERROR，購物車保留', async (body, message) => {
    await fillCart([{ productId: byPrice(980).id, quantity: 1 }]);

    const res = await createOrder(body);

    expect(res.status).toBe(400);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toMatch(message);

    const cart = await request(app).get('/api/cart').set('Authorization', `Bearer ${token}`);
    expect(cart.body.data.items.length).toBeGreaterThan(0);
  });

  it('訂單詳情帶出運費快照，且 total_amount = subtotal_amount + shipping_fee', async () => {
    // 前面的非法案例會把商品留在購物車；以目前購物車內容計算預期小計。
    await fillCart([{ productId: byPrice(980).id, quantity: 1 }]);
    const cart = await request(app).get('/api/cart').set('Authorization', `Bearer ${token}`);
    const subtotal = cart.body.data.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    expect(subtotal).toBeGreaterThanOrEqual(1500); // 超商取貨滿額也不免運

    const created = await createOrder({ shippingMethod: 'convenience_store', isRemoteArea: true });
    expect(created.status).toBe(201);

    const detail = await request(app)
      .get(`/api/orders/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(detail.status).toBe(200);
    const order = detail.body.data;
    expect(order).toMatchObject({
      subtotal_amount: subtotal,
      shipping_method: 'convenience_store',
      base_shipping_fee: 60,
      remote_surcharge: 200,
      urgent_surcharge: 0,
      shipping_fee: 260,
      total_amount: subtotal + 260,
    });
    expect(order.total_amount).toBe(order.subtotal_amount + order.shipping_fee);
    expect(order.shipping_fee).toBe(order.base_shipping_fee + order.remote_surcharge + order.urgent_surcharge);
  });
});
