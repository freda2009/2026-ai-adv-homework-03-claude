// Postman Collection 的結構檢查。postman/ 已列入 .gitignore（不提交），
// 所以這裡直接由目前路由的 @openapi 註解在記憶體產生 collection 再檢查，不讀 postman/ 下的檔案。
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const { Collection } = require('postman-collection');
const swaggerOptions = require('../../swagger-config');
const { buildCollection, validateCollection, OUTPUT_FILE } = require('../../scripts/generate-postman');

const spec = swaggerJsdoc(swaggerOptions);
let collection;

function requests(json) {
  const list = [];
  const walk = (items) => items.forEach((item) => (item.item ? walk(item.item) : list.push(item)));
  walk(json.item);
  return list;
}

const find = (json, method, urlPath) => requests(json)
  .find((i) => i.request.method === method && i.request.url.path.join('/') === urlPath);

describe('Postman Collection', () => {
  beforeAll(async () => {
    // 與 npm run postman 寫入檔案的內容相同（先序列化，去掉 undefined 欄位）
    collection = JSON.parse(JSON.stringify(await buildCollection(spec)));
  });

  it('是有效的 JSON，且能被 Postman SDK 載入', () => {
    expect(path.relative(path.join(__dirname, '..', '..'), OUTPUT_FILE)).toBe(path.join('postman', 'flower-life.postman_collection.json'));
    const { text, requests: count } = validateCollection(collection);
    expect(JSON.parse(text)).toEqual(collection);
    expect(collection.info.schema).toBe('https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
    const loaded = new Collection(collection);
    let loadedCount = 0;
    loaded.forEachItem(() => { loadedCount += 1; });
    expect(loadedCount).toBe(requests(collection).length);
    expect(count).toBe(loadedCount);
  });

  it('包含 baseUrl（預設 http://localhost:3001）、token、sessionId 變數', () => {
    expect(collection.variable).toEqual([
      { key: 'baseUrl', value: 'http://localhost:3001', type: 'string' },
      { key: 'token', value: '', type: 'string' },
      { key: 'sessionId', value: '', type: 'string' },
    ]);
  });

  it('所有請求都使用 {{baseUrl}}', () => {
    for (const item of requests(collection)) {
      expect(item.request.url.raw).toMatch(/^\{\{baseUrl\}\}\/api\//);
      expect(item.request.url.host).toEqual(['{{baseUrl}}']);
    }
    expect(JSON.stringify(collection)).not.toContain('{{bearerToken}}');
  });

  it('collection 層級使用 Bearer {{token}}；需要登入的請求繼承，公開端點不帶驗證', () => {
    expect(collection.auth).toEqual({ type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] });

    for (const [method, urlPath] of [
      ['GET', 'api/orders'], ['POST', 'api/orders'], ['GET', 'api/orders/:id'], ['GET', 'api/auth/profile'],
      ['POST', 'api/orders/:id/ecpay/checkout'], ['GET', 'api/admin/orders'], ['DELETE', 'api/admin/products/:id'],
    ]) {
      expect(find(collection, method, urlPath).request.auth, `${method} ${urlPath}`).toBeUndefined();
    }
    for (const [method, urlPath] of [
      ['GET', 'api/products'], ['GET', 'api/products/:id'], ['GET', 'api/shipping/quote'],
      ['POST', 'api/auth/login'], ['POST', 'api/auth/register'],
    ]) {
      expect(find(collection, method, urlPath).request.auth, `${method} ${urlPath}`).toEqual({ type: 'noauth' });
    }
  });

  it('登入與註冊成功後自動把 JWT 存進 token', () => {
    for (const urlPath of ['api/auth/login', 'api/auth/register']) {
      const item = find(collection, 'POST', urlPath);
      const script = item.event.find((e) => e.listen === 'test').script.exec.join('\n');
      expect(script).toContain("pm.collectionVariables.set('token', body.data.token)");
    }
    expect(JSON.parse(find(collection, 'POST', 'api/auth/login').request.body.raw)).toEqual({
      email: 'admin@hexschool.com',
      password: '12345678',
    });
  });

  it('購物車請求帶 X-Session-Id: {{sessionId}}，且空的時自動產生', () => {
    for (const [method, urlPath] of [['GET', 'api/cart'], ['POST', 'api/cart'], ['PATCH', 'api/cart/:itemId'], ['DELETE', 'api/cart/:itemId']]) {
      const headers = find(collection, method, urlPath).request.header;
      expect(headers).toContainEqual(expect.objectContaining({ key: 'X-Session-Id', value: '{{sessionId}}' }));
      expect(headers.filter((h) => /^x-session-id$/i.test(h.key))).toHaveLength(1);
    }
    const prerequest = collection.event.find((e) => e.listen === 'prerequest').script.exec.join('\n');
    expect(prerequest).toContain("pm.collectionVariables.set('sessionId'");
  });

  it('每個 @openapi 操作都轉成一個請求，且重複產生的內容相同', async () => {
    const operations = Object.values(spec.paths).reduce((n, methods) => n + Object.keys(methods).length, 0);
    expect(requests(collection)).toHaveLength(operations);

    const again = JSON.parse(JSON.stringify(await buildCollection(spec)));
    expect(again).toEqual(collection);
  });
});
