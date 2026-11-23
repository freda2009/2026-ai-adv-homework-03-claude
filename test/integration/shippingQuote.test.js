// 運費試算 API：公開、純計算，結果必須與 Shipping 模組一致。
const { app, request } = require('./setup');

function quote(query) {
  return request(app).get('/api/shipping/quote').query(query);
}

describe('GET /api/shipping/quote', () => {
  it('宅配小計 1,499：收 120，總額 1,619，並回傳費率表', async () => {
    const res = await quote({ subtotal: 1499, shippingMethod: 'home_delivery' });

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data).toEqual({
      subtotal_amount: 1499,
      shipping_method: 'home_delivery',
      base_shipping_fee: 120,
      remote_surcharge: 0,
      urgent_surcharge: 0,
      shipping_fee: 120,
      free_shipping_applied: false,
      total_amount: 1619,
      rates: {
        home_delivery_fee: 120,
        convenience_store_fee: 60,
        free_shipping_threshold: 1500,
        remote_area_surcharge: 200,
        urgent_surcharge: 250,
      },
    });
  });

  it('只帶 subtotal：預設宅配、非偏遠、非急件', async () => {
    const res = await quote({ subtotal: 1500 });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      shipping_method: 'home_delivery',
      base_shipping_fee: 0,
      shipping_fee: 0,
      free_shipping_applied: true,
      total_amount: 1500,
    });
  });

  it('超商取貨＋偏遠＋急件：查詢字串的 true 轉為布林', async () => {
    const res = await quote({ subtotal: 2000, shippingMethod: 'convenience_store', isRemoteArea: 'true', isUrgent: 'true' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      base_shipping_fee: 60,
      remote_surcharge: 200,
      urgent_surcharge: 250,
      shipping_fee: 510,
      total_amount: 2510,
    });
  });

  it('isRemoteArea=false、isUrgent=false 視為未加收', async () => {
    const res = await quote({ subtotal: 100, isRemoteArea: 'false', isUrgent: 'false' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ remote_surcharge: 0, urgent_surcharge: 0, shipping_fee: 120 });
  });

  it.each([
    [{}, /subtotal/],
    [{ subtotal: '-1' }, /subtotal/],
    [{ subtotal: '1.5' }, /subtotal/],
    [{ subtotal: 'abc' }, /subtotal/],
    [{ subtotal: '99999999999999999999' }, /subtotal/],
    [{ subtotal: 100, shippingMethod: 'drone' }, /配送方式/],
    [{ subtotal: 100, isRemoteArea: '1' }, /偏遠地區/],
    [{ subtotal: 100, isUrgent: 'yes' }, /當日急件/],
  ])('參數不合法 %o：400 VALIDATION_ERROR', async (query, message) => {
    const res = await quote(query);

    expect(res.status).toBe(400);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toMatch(message);
  });

  it('同一參數重複出現（陣列）時拒絕', async () => {
    const res = await request(app).get('/api/shipping/quote?subtotal=100&isUrgent=true&isUrgent=false');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});
