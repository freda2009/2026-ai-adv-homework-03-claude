const { app, request, registerUser } = require('./setup');
const db = require('../src/database');
const cartService = require('../src/services/cartService');

describe('登入／註冊時合併訪客購物車', () => {
  let productA;
  let productB;

  const newSession = () => `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const guestAdd = (session, productId, quantity) =>
    request(app).post('/api/cart').set('X-Session-Id', session).send({ productId, quantity });
  const userAdd = (token, productId, quantity) =>
    request(app).post('/api/cart').set('Authorization', `Bearer ${token}`).send({ productId, quantity });
  const userCart = async (token) =>
    (await request(app).get('/api/cart').set('Authorization', `Bearer ${token}`)).body.data;
  const guestCart = async (session) =>
    (await request(app).get('/api/cart').set('X-Session-Id', session)).body.data;
  const qtyOf = (cart, productId) => cart.items.find((item) => item.product_id === productId)?.quantity;
  const login = (email, session, password = 'password123') => {
    const req = request(app).post('/api/auth/login');
    if (session) req.set('X-Session-Id', session);
    return req.send({ email, password });
  };
  const setStock = (productId, stock) => db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(stock, productId);

  beforeAll(async () => {
    const res = await request(app).get('/api/products');
    [productA, productB] = res.body.data.products.map((p) => p.id);
  });

  beforeEach(() => {
    setStock(productA, 100);
    setStock(productB, 100);
  });

  it('註冊：訪客購物車的商品會歸到新帳號，訪客端清空', async () => {
    const session = newSession();
    await guestAdd(session, productA, 2);
    await guestAdd(session, productB, 1);

    const res = await request(app).post('/api/auth/register').set('X-Session-Id', session)
      .send({ email: `m-${session}@example.com`, password: 'password123', name: '新會員' });

    expect(res.status).toBe(201);
    const cart = await userCart(res.body.data.token);
    expect(qtyOf(cart, productA)).toBe(2);
    expect(qtyOf(cart, productB)).toBe(1);
    expect((await guestCart(session)).items).toHaveLength(0);
  });

  it('登入：同一商品數量相加，其他商品一併帶入', async () => {
    const { token, user } = await registerUser();
    await userAdd(token, productA, 1);
    const session = newSession();
    await guestAdd(session, productA, 2);
    await guestAdd(session, productB, 1);

    const res = await login(user.email, session);

    expect(res.status).toBe(200);
    const cart = await userCart(res.body.data.token);
    expect(qtyOf(cart, productA)).toBe(3);
    expect(qtyOf(cart, productB)).toBe(1);
    expect(cart.items).toHaveLength(2);
    expect((await guestCart(session)).items).toHaveLength(0);
  });

  it('合併後的數量超過庫存時，以庫存為上限且不報錯', async () => {
    const { token, user } = await registerUser();
    await userAdd(token, productA, 1);
    const session = newSession();
    await guestAdd(session, productA, 2);
    setStock(productA, 2);

    const res = await login(user.email, session);

    expect(res.status).toBe(200);
    expect(qtyOf(await userCart(res.body.data.token), productA)).toBe(2);
  });

  it('不會把帳號原有的數量往下調（即使庫存已低於原有數量）', async () => {
    const { token, user } = await registerUser();
    await userAdd(token, productA, 3);
    const session = newSession();
    await guestAdd(session, productA, 1);
    setStock(productA, 1);

    const res = await login(user.email, session);

    expect(qtyOf(await userCart(res.body.data.token), productA)).toBe(3);
    expect((await guestCart(session)).items).toHaveLength(0);
  });

  it('庫存為 0 的訪客項目不會帶入，也不會留在訪客端', async () => {
    const { user } = await registerUser();
    const session = newSession();
    await guestAdd(session, productB, 1);
    setStock(productB, 0);

    const res = await login(user.email, session);

    const cart = await userCart(res.body.data.token);
    expect(qtyOf(cart, productB)).toBeUndefined();
    expect((await guestCart(session)).items).toHaveLength(0);
  });

  it('沒有帶 X-Session-Id 時不合併，訪客購物車保持不變', async () => {
    const { user } = await registerUser();
    const session = newSession();
    await guestAdd(session, productA, 2);

    const res = await login(user.email, null);

    expect(res.status).toBe(200);
    expect((await userCart(res.body.data.token)).items).toHaveLength(0);
    expect(qtyOf(await guestCart(session), productA)).toBe(2);
  });

  it('只合併登入請求所帶的那個 session，不動其他 session', async () => {
    const { user } = await registerUser();
    const mine = newSession();
    const other = newSession();
    await guestAdd(mine, productA, 1);
    await guestAdd(other, productB, 5);

    const res = await login(user.email, mine);

    const cart = await userCart(res.body.data.token);
    expect(qtyOf(cart, productA)).toBe(1);
    expect(qtyOf(cart, productB)).toBeUndefined();
    expect(qtyOf(await guestCart(other), productB)).toBe(5);
  });

  it('密碼錯誤（登入失敗）不會合併', async () => {
    const { user } = await registerUser();
    const session = newSession();
    await guestAdd(session, productA, 2);

    const res = await login(user.email, session, 'wrong-password');

    expect(res.status).toBe(401);
    expect(qtyOf(await guestCart(session), productA)).toBe(2);
  });

  it('合併失敗不會讓登入失敗，訪客項目保留以便下次重試', async () => {
    const { user } = await registerUser();
    const session = newSession();
    await guestAdd(session, productA, 2);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mergeSpy = vi.spyOn(cartService, 'mergeSessionCartIntoUser').mockImplementation(() => {
      throw new Error('boom');
    });

    const res = await login(user.email, session);

    mergeSpy.mockRestore();
    errorSpy.mockRestore();
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('token');
    expect(qtyOf(await guestCart(session), productA)).toBe(2);
  });

  it('原症狀：訪客加商品後註冊／登入，仍能用這些商品結帳', async () => {
    const session = newSession();
    await guestAdd(session, productA, 2);
    const reg = await request(app).post('/api/auth/register').set('X-Session-Id', session)
      .send({ email: `o-${session}@example.com`, password: 'password123', name: '結帳會員' });

    const order = await request(app).post('/api/orders')
      .set('Authorization', `Bearer ${reg.body.data.token}`)
      .send({ recipientName: '結帳會員', recipientEmail: 'o@example.com', recipientAddress: '台北市測試路 1 號' });

    expect(order.status).toBe(201);
    expect(order.body.data.items).toHaveLength(1);
    expect(order.body.data.items[0].quantity).toBe(2);
  });
});
