const { app, request, registerUser } = require('./setup');
const db = require('../../src/database');
const { generateCheckMacValue, verifyCheckMacValue } = require('../../src/services/ecpay');

const KEY = 'pwFHCqoQZGmho4w6';
const IV = 'EkRm7iFT261dpevs';
const QUERY_URL = 'https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5';

// 綠界 QueryTradeInfo 的回應：URL-encoded 字串，含正確的 CheckMacValue。
function ecpayResponse(overrides = {}, { status = 200, badCmv = false } = {}) {
  const fields = {
    HandlingCharge: '0', ItemName: '測試', MerchantID: '3002607', MerchantTradeNo: '',
    PaymentDate: '', PaymentType: '', PaymentTypeChargeFee: '0', TradeAmt: '0',
    TradeDate: '2026/11/21 17:57:41', TradeNo: '', TradeStatus: '0', ...overrides,
  };
  fields.CheckMacValue = badCmv ? 'A'.repeat(64) : generateCheckMacValue(fields, KEY, IV);
  return new Response(new URLSearchParams(fields).toString(), { status });
}

// 以 mock 取代 global.fetch；replyFor(tradeNo, order) 回傳要覆蓋的欄位或完整 Response。
function mockEcpay(replyFor) {
  const fn = vi.fn(async (_url, opts) => {
    const tradeNo = new URLSearchParams(opts.body).get('MerchantTradeNo');
    const reply = replyFor(tradeNo);
    return reply instanceof Response ? reply : ecpayResponse({ MerchantTradeNo: tradeNo, ...reply });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('綠界金流（以主動查詢驗證付款）', () => {
  let productId;
  let owner;
  let other;

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const checkout = (user, id) => request(app).post(`/api/orders/${id}/ecpay/checkout`).set(auth(user));
  const verify = (user, id) => request(app).post(`/api/orders/${id}/ecpay/verify`).set(auth(user));
  const attempts = (orderId) => db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY created_at, rowid').all(orderId);
  const orderStatus = (id) => db.prepare('SELECT status FROM orders WHERE id = ?').get(id).status;
  const clearThrottle = () => db.prepare('UPDATE payments SET last_checked_at = NULL').run();
  const paidReply = (order) => (no) => ({ TradeStatus: '1', TradeAmt: String(order.total_amount), TradeNo: '2611211757410947', PaymentType: 'Credit_CreditCard', PaymentDate: '2026/11/21 18:00:00' });

  async function makeOrder(user = owner) {
    await request(app).post('/api/cart').set(auth(user)).send({ productId, quantity: 1 });
    const res = await request(app).post('/api/orders').set(auth(user))
      .send({ recipientName: '測試', recipientEmail: 't@example.com', recipientAddress: '台北市測試路 1 號' });
    return res.body.data;
  }

  beforeAll(async () => {
    db.prepare('UPDATE products SET stock = 1000').run();
    productId = (await request(app).get('/api/products')).body.data.products[0].id;
    owner = await registerUser();
    other = await registerUser();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('POST /api/orders/:id/ecpay/checkout', () => {
    it('未登入回 401', async () => {
      const order = await makeOrder();
      const res = await request(app).post(`/api/orders/${order.id}/ecpay/checkout`);
      expect(res.status).toBe(401);
    });

    it('不是自己的訂單回 404', async () => {
      const order = await makeOrder();
      const res = await checkout(other, order.id);
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('data', null);
    });

    it('成功：回傳已簽章的表單欄位，並建立一筆 created 的付款交易', async () => {
      const order = await makeOrder();
      const res = await checkout(owner, order.id);

      expect(res.status).toBe(201);
      expect(res.body.error).toBeNull();
      const { action, method, fields } = res.body.data;
      expect(action).toBe('https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5');
      expect(method).toBe('POST');
      expect(fields).toMatchObject({
        MerchantID: '3002607',
        PaymentType: 'aio',
        TotalAmount: String(order.total_amount),
        ChoosePayment: 'ALL',
        EncryptType: '1',
        ReturnURL: 'https://example.invalid/api/ecpay/notify',
        OrderResultURL: 'http://localhost:3001/ecpay/return',
        ClientBackURL: `http://localhost:3001/orders/${order.id}`,
      });
      expect(fields.MerchantTradeNo).toMatch(/^P\d{12}[A-Z0-9]{5}$/);
      expect(fields.MerchantTradeDate).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(verifyCheckMacValue(fields, KEY, IV)).toBe(true);

      const rows = attempts(order.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ merchant_trade_no: fields.MerchantTradeNo, amount: order.total_amount, status: 'created' });
    });

    it('訂單不是 pending 回 400 INVALID_STATUS', async () => {
      const order = await makeOrder();
      db.prepare("UPDATE orders SET status = 'paid' WHERE id = ?").run(order.id);
      const res = await checkout(owner, order.id);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_STATUS');
    });

    it('再次付款會產生新的 MerchantTradeNo，並先查詢舊交易（尚未付款則繼續）', async () => {
      const order = await makeOrder();
      const first = await checkout(owner, order.id);
      const fetchMock = mockEcpay(() => ({ TradeStatus: '0', TradeAmt: String(order.total_amount) }));

      const second = await checkout(owner, order.id);

      expect(second.status).toBe(201);
      expect(second.body.data.fields.MerchantTradeNo).not.toBe(first.body.data.fields.MerchantTradeNo);
      expect(attempts(order.id)).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(QUERY_URL);
    });

    it('舊交易其實已付款：標記為 paid 並回 409，不再建立新交易', async () => {
      const order = await makeOrder();
      await checkout(owner, order.id);
      mockEcpay(paidReply(order));

      const res = await checkout(owner, order.id);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('CONFLICT');
      expect(orderStatus(order.id)).toBe('paid');
      expect(attempts(order.id)).toHaveLength(1);
      expect(attempts(order.id)[0].status).toBe('paid');
    });

    it('查詢舊交易失敗不阻擋建立新交易', async () => {
      const order = await makeOrder();
      await checkout(owner, order.id);
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

      const res = await checkout(owner, order.id);

      expect(res.status).toBe(201);
      expect(attempts(order.id)).toHaveLength(2);
    });
  });

  describe('POST /api/orders/:id/ecpay/verify', () => {
    it('未登入 401；不是自己的訂單 404', async () => {
      const order = await makeOrder();
      expect((await request(app).post(`/api/orders/${order.id}/ecpay/verify`)).status).toBe(401);
      expect((await verify(other, order.id)).status).toBe(404);
    });

    it('還沒有付款交易回 400 NO_PAYMENT', async () => {
      const order = await makeOrder();
      const res = await verify(owner, order.id);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('NO_PAYMENT');
    });

    it('TradeStatus=1 且金額相符：訂單與交易都變成 paid，並以正確的簽章呼叫綠界', async () => {
      const order = await makeOrder();
      const { fields } = (await checkout(owner, order.id)).body.data;
      const fetchMock = mockEcpay(paidReply(order));

      const res = await verify(owner, order.id);

      expect(res.status).toBe(200);
      expect(res.body.error).toBeNull();
      expect(res.body.data.result).toBe('paid');
      expect(res.body.data.order).toMatchObject({ id: order.id, status: 'paid' });
      expect(orderStatus(order.id)).toBe('paid');
      expect(attempts(order.id)[0]).toMatchObject({
        status: 'paid', ecpay_trade_no: '2611211757410947', payment_type: 'Credit_CreditCard', trade_status: '1',
      });

      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe(QUERY_URL);
      const sent = Object.fromEntries(new URLSearchParams(opts.body));
      expect(sent).toMatchObject({ MerchantID: '3002607', MerchantTradeNo: fields.MerchantTradeNo });
      expect(sent.TimeStamp).toMatch(/^\d{10}$/);
      expect(verifyCheckMacValue(sent, KEY, IV)).toBe(true);
    });

    it('冪等：已付款的訂單再次驗證直接回傳 paid，不再呼叫綠界', async () => {
      const order = await makeOrder();
      await checkout(owner, order.id);
      mockEcpay(paidReply(order));
      await verify(owner, order.id);
      const fetchMock = mockEcpay(paidReply(order));

      const res = await verify(owner, order.id);

      expect(res.status).toBe(200);
      expect(res.body.data.result).toBe('paid');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('金額不符：回 409，訂單與交易都不變', async () => {
      const order = await makeOrder();
      await checkout(owner, order.id);
      mockEcpay(() => ({ TradeStatus: '1', TradeAmt: '1', TradeNo: '1' }));

      const res = await verify(owner, order.id);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('PAYMENT_AMOUNT_MISMATCH');
      expect(orderStatus(order.id)).toBe('pending');
      expect(attempts(order.id)[0].status).toBe('created');
    });

    it('回應的 MerchantTradeNo 與本地不一致：回 502，不改狀態', async () => {
      const order = await makeOrder();
      await checkout(owner, order.id);
      mockEcpay(() => ({ MerchantTradeNo: 'PSOMEONEELSE', TradeStatus: '1', TradeAmt: String(order.total_amount) }));

      const res = await verify(owner, order.id);

      expect(res.status).toBe(502);
      expect(res.body.error).toBe('PAYMENT_QUERY_FAILED');
      expect(orderStatus(order.id)).toBe('pending');
    });

    it('回應的 CheckMacValue 不符：回 502，不改狀態', async () => {
      const order = await makeOrder();
      await checkout(owner, order.id);
      mockEcpay((no) => ecpayResponse({ MerchantTradeNo: no, TradeStatus: '1', TradeAmt: String(order.total_amount) }, { badCmv: true }));

      const res = await verify(owner, order.id);

      expect(res.status).toBe(502);
      expect(res.body.error).toBe('PAYMENT_QUERY_FAILED');
      expect(orderStatus(order.id)).toBe('pending');
    });

    it('綠界回 HTTP 500（簽章錯誤）或網路失敗：回 502，不改狀態', async () => {
      const order = await makeOrder();
      await checkout(owner, order.id);
      mockEcpay((no) => ecpayResponse({ MerchantTradeNo: no, TradeStatus: '10200073' }, { status: 500 }));
      expect((await verify(owner, order.id)).status).toBe(502);

      clearThrottle();
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
      expect((await verify(owner, order.id)).status).toBe(502);
      expect(orderStatus(order.id)).toBe('pending');
    });

    it('TradeStatus=0（尚未付款）：result 為 pending，訂單維持 pending', async () => {
      const order = await makeOrder();
      await checkout(owner, order.id);
      mockEcpay(() => ({ TradeStatus: '0', TradeAmt: String(order.total_amount) }));

      const res = await verify(owner, order.id);

      expect(res.status).toBe(200);
      expect(res.body.data.result).toBe('pending');
      expect(orderStatus(order.id)).toBe('pending');
      expect(attempts(order.id)[0]).toMatchObject({ status: 'created', trade_status: '0' });
    });

    it('TradeStatus=10200047（綠界查無此筆）：result 為 pending，交易維持 created', async () => {
      const order = await makeOrder();
      await checkout(owner, order.id);
      mockEcpay(() => ({ TradeStatus: '10200047' }));

      const res = await verify(owner, order.id);

      expect(res.status).toBe(200);
      expect(res.body.data.result).toBe('pending');
      expect(attempts(order.id)[0].status).toBe('created');
    });

    it('TradeStatus=10200095（交易未成立）：交易標為 failed，訂單仍 pending，可重新付款', async () => {
      const order = await makeOrder();
      await checkout(owner, order.id);
      mockEcpay(() => ({ TradeStatus: '10200095' }));

      const res = await verify(owner, order.id);

      expect(res.status).toBe(200);
      expect(res.body.data.result).toBe('failed');
      expect(orderStatus(order.id)).toBe('pending');
      expect(attempts(order.id)[0].status).toBe('failed');

      const again = await checkout(owner, order.id);
      expect(again.status).toBe(201);
      expect(attempts(order.id)).toHaveLength(2);
    });

    it('限流：同一筆交易 10 秒內第二次查詢回 429，且不呼叫綠界', async () => {
      const order = await makeOrder();
      await checkout(owner, order.id);
      const fetchMock = mockEcpay(() => ({ TradeStatus: '0', TradeAmt: String(order.total_amount) }));

      expect((await verify(owner, order.id)).status).toBe(200);
      const second = await verify(owner, order.id);

      expect(second.status).toBe(429);
      expect(second.body.error).toBe('TOO_MANY_REQUESTS');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      clearThrottle();
      expect((await verify(owner, order.id)).status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('有多筆 created 交易時只查詢最新的一筆', async () => {
      const order = await makeOrder();
      await checkout(owner, order.id);
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('x')));
      const second = await checkout(owner, order.id);
      clearThrottle();
      const fetchMock = mockEcpay(() => ({ TradeStatus: '0', TradeAmt: String(order.total_amount) }));

      await verify(owner, order.id);

      const queried = new URLSearchParams(fetchMock.mock.calls[0][1].body).get('MerchantTradeNo');
      expect(queried).toBe(second.body.data.fields.MerchantTradeNo);
    });
  });

  describe('POST /ecpay/return（綠界導回，不信任內容）', () => {
    it('只用 MerchantTradeNo 查出訂單並 303 轉址，不改任何狀態', async () => {
      const order = await makeOrder();
      const { fields } = (await checkout(owner, order.id)).body.data;

      const res = await request(app).post('/ecpay/return').type('form')
        .send({ MerchantTradeNo: fields.MerchantTradeNo, RtnCode: '1', TradeAmt: '1', SimulatePaid: '0' });

      expect(res.status).toBe(303);
      expect(res.headers.location).toBe(`/orders/${order.id}?payment=checking`);
      expect(orderStatus(order.id)).toBe('pending');
      expect(attempts(order.id)[0].status).toBe('created');
    });

    it('找不到交易或格式不合法時轉到 /orders', async () => {
      const unknown = await request(app).post('/ecpay/return').type('form').send({ MerchantTradeNo: 'PNOTEXIST000000000' });
      expect(unknown.status).toBe(303);
      expect(unknown.headers.location).toBe('/orders');

      const evil = await request(app).post('/ecpay/return').type('form').send({ MerchantTradeNo: "x' OR '1'='1" });
      expect(evil.status).toBe(303);
      expect(evil.headers.location).toBe('/orders');
    });
  });

  it('模擬付款端點 PATCH /api/orders/:id/pay 已移除', async () => {
    const order = await makeOrder();
    const res = await request(app).patch(`/api/orders/${order.id}/pay`).set(auth(owner)).send({ action: 'success' });
    expect(res.status).toBe(404);
    expect(orderStatus(order.id)).toBe('pending');
  });
});
