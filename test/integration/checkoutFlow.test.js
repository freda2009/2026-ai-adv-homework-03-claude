// 結帳整合測試：會員 → 商品 → 購物車 → 建立含配送資訊的訂單，並直接檢查資料庫的寫入結果。
// 每個測試在 beforeEach 建立自己的會員與庫存快照，afterEach 刪除資料、還原庫存並確認沒有殘留。
const { app, request } = require('./setup');
const {
  db, countRows, snapshotStock, restoreStock, deleteMemberData, memberRowCounts, createMember,
} = require('./testData');

const recipient = {
  recipientName: '整合測試收件人',
  recipientEmail: 'receiver@example.com',
  recipientAddress: '台北市信義區測試路 100 號',
};

describe('結帳流程整合測試（API + 資料庫）', () => {
  let products;
  let baselineRows;
  let baselineStock;
  let member;
  let stockBefore;

  const byPrice = (price) => {
    const product = products.find((p) => p.price === price);
    if (!product) throw new Error(`找不到價格 ${price} 的 seed 商品`);
    return product;
  };
  const auth = () => ({ Authorization: `Bearer ${member.token}` });

  async function addToCart(product, quantity) {
    const res = await request(app).post('/api/cart').set(auth()).send({ productId: product.id, quantity });
    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    return res.body.data;
  }

  function createOrder(body) {
    return request(app).post('/api/orders').set(auth()).send({ ...recipient, ...body });
  }

  async function cartItems() {
    const res = await request(app).get('/api/cart').set(auth());
    expect(res.status).toBe(200);
    return res.body.data.items;
  }

  // 失敗時：不留下任何訂單／品項／付款，庫存與購物車都維持原狀。
  async function expectNothingWritten(rowsBefore, stockBeforeAttempt, cartBefore) {
    const rowsAfter = countRows();
    expect(rowsAfter.orders).toBe(rowsBefore.orders);
    expect(rowsAfter.order_items).toBe(rowsBefore.order_items);
    expect(rowsAfter.payments).toBe(rowsBefore.payments);
    expect(memberRowCounts(member.id).orders).toBe(0);
    expect(snapshotStock()).toEqual(stockBeforeAttempt);
    const cartAfter = await cartItems();
    expect(cartAfter.map((i) => [i.product_id, i.quantity])).toEqual(cartBefore.map((i) => [i.product_id, i.quantity]));
  }

  beforeAll(async () => {
    baselineRows = countRows();
    baselineStock = snapshotStock();
    // 1. 取得商品資料（公開 API），之後依價格挑選，不寫死 id。
    const res = await request(app).get('/api/products?limit=100');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ error: null, message: expect.any(String) });
    products = res.body.data.products;
  });

  beforeEach(async () => {
    stockBefore = snapshotStock();
    member = await createMember(); // 2. 建立並登入測試會員
  });

  afterEach(() => {
    deleteMemberData(member.id);
    restoreStock(stockBefore);
    // 清除後確認沒有殘留
    expect(memberRowCounts(member.id)).toEqual({ users: 0, orders: 0, cart_items: 0 });
    expect(snapshotStock()).toEqual(stockBefore);
  });

  afterAll(() => {
    // 整個檔案結束後，資料表回到開始前的狀態
    expect(countRows()).toEqual(baselineRows);
    expect(snapshotStock()).toEqual(baselineStock);
  });

  describe('建立訂單成功', () => {
    it.each([
      {
        name: '宅配＋偏遠地區（小計 1,330 未達免運）',
        cart: [[580, 1], [750, 1]],
        shipping: { shippingMethod: 'home_delivery', isRemoteArea: true, isUrgent: false },
        expected: { subtotal_amount: 1330, base_shipping_fee: 120, remote_surcharge: 200, urgent_surcharge: 0, shipping_fee: 320, total_amount: 1650 },
      },
      {
        name: '超商取貨＋當日急件（小計 1,680，超商不適用免運）',
        cart: [[1680, 1]],
        shipping: { shippingMethod: 'convenience_store', isRemoteArea: false, isUrgent: true },
        expected: { subtotal_amount: 1680, base_shipping_fee: 60, remote_surcharge: 0, urgent_surcharge: 250, shipping_fee: 310, total_amount: 1990 },
      },
      {
        name: '宅配滿額免運＋偏遠＋急件（小計 1,960）',
        cart: [[980, 2]],
        shipping: { shippingMethod: 'home_delivery', isRemoteArea: true, isUrgent: true },
        expected: { subtotal_amount: 1960, base_shipping_fee: 0, remote_surcharge: 200, urgent_surcharge: 250, shipping_fee: 450, total_amount: 2410 },
      },
    ])('$name', async ({ cart, shipping, expected }) => {
      // 3. 加入購物車
      const lines = cart.map(([price, quantity]) => ({ product: byPrice(price), quantity }));
      for (const { product, quantity } of lines) await addToCart(product, quantity);
      expect((await cartItems()).length).toBe(lines.length);

      // 4. 建立包含配送方式與配送資訊的訂單
      const res = await createOrder(shipping);

      // 5. 驗證回應：狀態碼與統一格式
      expect(res.status).toBe(201);
      expect(Object.keys(res.body).sort()).toEqual(['data', 'error', 'message']);
      expect(res.body.error).toBeNull();
      expect(res.body.message).toBe('訂單建立成功');
      const data = res.body.data;
      expect(data).toMatchObject({ ...expected, shipping_method: shipping.shippingMethod, status: 'pending' });
      expect(data.order_no).toMatch(/^ORD-\d{8}-[0-9A-F]{5}$/);

      // 訂單正確寫入資料庫（含收件與配送資訊、金額快照）
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(data.id);
      expect(order).toMatchObject({
        user_id: member.id,
        order_no: data.order_no,
        recipient_name: recipient.recipientName,
        recipient_email: recipient.recipientEmail,
        recipient_address: recipient.recipientAddress,
        shipping_method: shipping.shippingMethod,
        status: 'pending',
        ...expected,
      });
      // 配送費用與總額的等式
      expect(order.shipping_fee).toBe(order.base_shipping_fee + order.remote_surcharge + order.urgent_surcharge);
      expect(order.total_amount).toBe(order.subtotal_amount + order.shipping_fee);

      // 訂單品項正確寫入（商品名稱與單價為下單當下的快照）
      const items = db.prepare(
        'SELECT product_id, product_name, product_price, quantity FROM order_items WHERE order_id = ? ORDER BY product_id'
      ).all(data.id);
      const expectedItems = lines
        .map(({ product, quantity }) => ({ product_id: product.id, product_name: product.name, product_price: product.price, quantity }))
        .sort((a, b) => a.product_id.localeCompare(b.product_id));
      expect(items).toEqual(expectedItems);
      expect(items.reduce((sum, i) => sum + i.product_price * i.quantity, 0)).toBe(expected.subtotal_amount);

      // 庫存正確扣除：購買的商品減少購買數量，其他商品不變
      const stockAfter = snapshotStock();
      const purchased = Object.fromEntries(lines.map(({ product, quantity }) => [product.id, quantity]));
      for (const [id, stock] of Object.entries(stockBefore)) {
        expect(stockAfter[id]).toBe(stock - (purchased[id] || 0));
      }

      // 建立訂單後購物車清空（API 與資料庫）
      expect(await cartItems()).toEqual([]);
      expect(memberRowCounts(member.id).cart_items).toBe(0);

      // 訂單詳情 API 讀到相同資料
      const detail = await request(app).get(`/api/orders/${data.id}`).set(auth());
      expect(detail.status).toBe(200);
      expect(detail.body.data).toMatchObject({ id: data.id, ...expected });
      expect(detail.body.data.items).toHaveLength(lines.length);
    });
  });

  describe('建立訂單失敗：不留下不完整訂單、不扣庫存', () => {
    it('配送選項不合法：400 VALIDATION_ERROR，購物車保留', async () => {
      await addToCart(byPrice(980), 1);
      const rowsBefore = countRows();
      const stock = snapshotStock();
      const cartBefore = await cartItems();

      const res = await createOrder({ shippingMethod: 'drone' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ data: null, error: 'VALIDATION_ERROR', message: expect.stringMatching(/配送方式/) });
      await expectNothingWritten(rowsBefore, stock, cartBefore);
    });

    it('收件資訊缺漏：400 VALIDATION_ERROR', async () => {
      await addToCart(byPrice(980), 1);
      const rowsBefore = countRows();
      const stock = snapshotStock();
      const cartBefore = await cartItems();

      const res = await createOrder({ recipientAddress: '' });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ data: null, error: 'VALIDATION_ERROR' });
      await expectNothingWritten(rowsBefore, stock, cartBefore);
    });

    it('庫存不足：400 STOCK_INSUFFICIENT，庫存維持原值', async () => {
      const product = byPrice(750);
      await addToCart(product, 3);
      db.prepare('UPDATE products SET stock = 2 WHERE id = ?').run(product.id); // 加入購物車後庫存被買走
      const rowsBefore = countRows();
      const stock = snapshotStock();
      const cartBefore = await cartItems();

      const res = await createOrder({ shippingMethod: 'home_delivery' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ data: null, error: 'STOCK_INSUFFICIENT', message: `以下商品庫存不足：${product.name}` });
      expect(snapshotStock()[product.id]).toBe(2);
      await expectNothingWritten(rowsBefore, stock, cartBefore);
    });

    it('購物車為空：400 CART_EMPTY', async () => {
      const rowsBefore = countRows();
      const stock = snapshotStock();

      const res = await createOrder({ shippingMethod: 'convenience_store' });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ data: null, error: 'CART_EMPTY' });
      await expectNothingWritten(rowsBefore, stock, []);
    });

    it('未登入：401，不建立訂單', async () => {
      await addToCart(byPrice(980), 1);
      const rowsBefore = countRows();
      const stock = snapshotStock();
      const cartBefore = await cartItems();

      const res = await request(app).post('/api/orders').send({ ...recipient, shippingMethod: 'home_delivery' });

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ data: null, error: 'UNAUTHORIZED' });
      await expectNothingWritten(rowsBefore, stock, cartBefore);
    });

    it('交易中途失敗（訂單已寫入後，扣其中一項商品庫存時出錯）：整筆回滾，不留下訂單與品項，其他商品也不扣庫存', async () => {
      const first = byPrice(580);
      const second = byPrice(1450);
      await addToCart(first, 1);
      await addToCart(second, 1);
      const rowsBefore = countRows();
      const stock = snapshotStock();
      const cartBefore = await cartItems();

      // 以 SQLite trigger 模擬：transaction 內先寫入 orders，處理到 second 的扣庫存時失敗
      //（first 的品項與扣庫存是否已執行取決於購物車讀取順序，兩種情況都必須整筆回滾）。
      // trigger 名稱與商品 id 都是測試程式內的值（id 來自資料庫的 uuid）。
      db.exec(`CREATE TRIGGER test_fail_stock_update BEFORE UPDATE OF stock ON products
               WHEN NEW.id = '${second.id}'
               BEGIN SELECT RAISE(ABORT, 'simulated stock update failure'); END;`);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      let res;
      let errorLogged;
      try {
        res = await createOrder({ shippingMethod: 'home_delivery' });
      } finally {
        db.exec('DROP TRIGGER IF EXISTS test_fail_stock_update');
        errorLogged = consoleError.mock.calls.length > 0; // mockRestore 會清掉呼叫紀錄，先記下
        consoleError.mockRestore();
      }

      // 500 只回通用訊息，不洩漏 SQL 錯誤
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ data: null, error: 'INTERNAL_ERROR', message: '伺服器內部錯誤' });
      expect(JSON.stringify(res.body)).not.toMatch(/simulated|SQLITE|trigger/i);
      expect(errorLogged).toBe(true); // 錯誤只記在伺服器日誌

      await expectNothingWritten(rowsBefore, stock, cartBefore);
      expect(snapshotStock()[first.id]).toBe(stock[first.id]);
    });
  });
});
