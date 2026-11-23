// 由 openapi.json 產生 Postman Collection：postman/flower-life.postman_collection.json（已 gitignore，不提交）
// 用法：npm run postman（會先執行 npm run openapi 產生最新的 openapi.json）
//
// 以 openapi-to-postmanv2 轉換後再後處理：
// - 變數 baseUrl（預設 http://localhost:3001）、token、sessionId
// - collection 層級 Bearer {{token}}；需要登入的請求繼承，公開端點設為 noauth
// - 登入／註冊成功後自動把 JWT 存進 token
// - 購物車與登入／註冊帶 X-Session-Id: {{sessionId}}（空的時自動產生）
// - 移除隨機 id 與亂數範例回應，讓重複產生的檔案內容穩定、方便比對
const fs = require('fs');
const path = require('path');
const Converter = require('openapi-to-postmanv2');
const { Collection } = require('postman-collection');

const ROOT = path.join(__dirname, '..');
const OPENAPI_FILE = path.join(ROOT, 'openapi.json');
const OUTPUT_FILE = path.join(ROOT, 'postman', 'flower-life.postman_collection.json');
const DEFAULT_BASE_URL = 'http://localhost:3001';
const SCHEMA_URL = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

const CONVERT_OPTIONS = {
  folderStrategy: 'Tags',
  parametersResolution: 'Schema', // 不用隨機假資料，輸出才會穩定
  requestNameSource: 'Fallback',
};

const SAVE_TOKEN_SCRIPT = [
  "pm.test('回應為 2xx 且帶有 token', function () {",
  '  pm.expect(pm.response.code).to.be.within(200, 299);',
  "  pm.expect(pm.response.json()).to.have.nested.property('data.token');",
  '});',
  'const body = pm.response.json();',
  'if (body && body.data && body.data.token) {',
  "  pm.collectionVariables.set('token', body.data.token);",
  "  console.log('已將 JWT 存入 collection 變數 token');",
  '}',
];

const ENSURE_SESSION_SCRIPT = [
  '// 訪客購物車用的 X-Session-Id：沒有值時自動產生一組 UUID 並保存',
  "if (!pm.collectionVariables.get('sessionId')) {",
  "  pm.collectionVariables.set('sessionId', pm.variables.replaceIn('{{$guid}}'));",
  '}',
];

// 讓匯入後可以直接送出的範例 body（其餘端點保留 OpenAPI 的 <string> 等佔位符）。
// 登入預設使用 README 記載的開發用 seed 管理員；正式環境請改用自己的帳號。
const EXAMPLE_BODIES = {
  'POST api/auth/login': { email: 'admin@hexschool.com', password: '12345678' },
  'POST api/auth/register': { email: '{{$randomEmail}}', password: 'password123', name: 'Postman 測試會員' },
  'POST api/orders': {
    recipientName: '王小明',
    recipientEmail: 'ming@example.com',
    recipientAddress: '台北市信義區測試路 1 號',
    shippingMethod: 'home_delivery',
    isRemoteArea: false,
    isUrgent: false,
  },
};

// 必填查詢參數的範例值；其他仍是 <string> 等佔位符的選填參數預設停用，避免送出無效值。
const QUERY_EXAMPLES = {
  'GET api/shipping/quote': { subtotal: '1000' },
};

const TOKEN_ENDPOINTS = new Set(['POST api/auth/login', 'POST api/auth/register']);

function convert(spec) {
  return new Promise((resolve, reject) => {
    Converter.convert({ type: 'json', data: spec }, CONVERT_OPTIONS, (err, result) => {
      if (err) return reject(err);
      if (!result.result) return reject(new Error(`OpenAPI 轉換失敗：${result.reason}`));
      resolve(result.output[0].data);
    });
  });
}

// 'POST api/orders/:id' → OpenAPI 的 security 設定（未設定為 []，代表公開端點）
function securityIndex(spec) {
  const index = new Map();
  for (const [route, methods] of Object.entries(spec.paths || {})) {
    for (const [method, operation] of Object.entries(methods)) {
      const key = `${method.toUpperCase()} ${route.replace(/^\//, '').replace(/\{(\w+)\}/g, ':$1')}`;
      index.set(key, operation.security || spec.security || []);
    }
  }
  return index;
}

function requestKey(request) {
  return `${request.method} ${request.url.path.join('/')}`;
}

function buildRawUrl(url) {
  const query = (url.query || [])
    .filter((q) => !q.disabled)
    .map((q) => `${q.key}=${q.value}`)
    .join('&');
  return `{{baseUrl}}/${url.path.join('/')}${query ? `?${query}` : ''}`;
}

function setSessionHeader(request) {
  const headers = (request.header || []).filter((h) => !/^(x-session-id|authorization)$/i.test(h.key));
  headers.unshift({ key: 'X-Session-Id', value: '{{sessionId}}', description: '訪客購物車識別（未登入時使用）' });
  request.header = headers;
}

function transformRequestItem(item, security) {
  const { request } = item;
  const key = requestKey(request);
  const schemes = new Set((security.get(key) || []).flatMap((s) => Object.keys(s)));

  for (const query of request.url.query || []) {
    const example = (QUERY_EXAMPLES[key] || {})[query.key];
    if (example !== undefined) {
      query.value = example;
    } else if (/^<.+>$/.test(String(query.value))) {
      query.disabled = true;
    }
  }
  request.url.host = ['{{baseUrl}}'];
  request.url.raw = buildRawUrl(request.url);

  // 需要登入：繼承 collection 的 Bearer {{token}}；公開端點：不帶驗證
  if (schemes.has('bearerAuth')) {
    delete request.auth;
  } else {
    request.auth = { type: 'noauth' };
  }

  const hasSessionHeader = (request.header || []).some((h) => /^x-session-id$/i.test(h.key));
  if (schemes.has('sessionId') || hasSessionHeader) {
    setSessionHeader(request);
  } else {
    request.header = (request.header || []).filter((h) => !/^authorization$/i.test(h.key));
  }

  if (EXAMPLE_BODIES[key] && request.body) {
    request.body.raw = JSON.stringify(EXAMPLE_BODIES[key], null, 2);
  }

  if (TOKEN_ENDPOINTS.has(key)) {
    item.event = [{ listen: 'test', script: { type: 'text/javascript', exec: SAVE_TOKEN_SCRIPT } }];
  }

  // converter 產生的範例回應以亂數填值（例如 shipping_fee: 8308），沒有參考價值且每次產生都不同，
  // 不輸出；回應格式請看 openapi.json 或實際送出請求。
  item.response = [];
}

function stripIds(node) {
  if (Array.isArray(node)) {
    node.forEach(stripIds);
  } else if (node && typeof node === 'object') {
    delete node.id;
    delete node._postman_id;
    Object.values(node).forEach(stripIds);
  }
}

function transformItems(items, security) {
  for (const item of items) {
    if (item.item) {
      transformItems(item.item, security);
    } else if (item.request) {
      transformRequestItem(item, security);
    }
  }
}

// 由 OpenAPI 物件產生 collection（不寫檔，方便測試）。
async function buildCollection(spec) {
  const collection = await convert(spec);
  const security = securityIndex(spec);

  stripIds(collection);
  transformItems(collection.item, security);

  return {
    info: {
      name: '花漾生活 Flower Life API',
      description: [
        '由 `npm run postman` 依 openapi.json 自動產生，請勿手動修改。',
        '',
        '1. 視需要調整 collection 變數 `baseUrl`（預設 http://localhost:3001）。',
        '2. 執行 Auth →「登入」或「註冊」，成功後 JWT 會自動存入 `token`。',
        '3. 需要登入的請求會自動帶 `Authorization: Bearer {{token}}`；購物車另帶 `X-Session-Id: {{sessionId}}`。',
      ].join('\n'),
      schema: SCHEMA_URL,
    },
    auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
    event: [{ listen: 'prerequest', script: { type: 'text/javascript', exec: ENSURE_SESSION_SCRIPT } }],
    variable: [
      { key: 'baseUrl', value: DEFAULT_BASE_URL, type: 'string' },
      { key: 'token', value: '', type: 'string' },
      { key: 'sessionId', value: '', type: 'string' },
    ],
    item: collection.item,
  };
}

// 確認輸出是有效 JSON，且能被 Postman 官方 SDK（postman-collection）載入。
function validateCollection(json) {
  const text = JSON.stringify(json, null, 2);
  const parsed = JSON.parse(text);
  const loaded = new Collection(parsed);
  let requests = 0;
  loaded.forEachItem(() => { requests += 1; });
  if (requests === 0) throw new Error('Collection 沒有任何請求');
  const dangling = text.match(/\{\{(?!baseUrl\}\}|token\}\}|sessionId\}\}|\$guid\}\}|\$randomEmail\}\})[^}]+\}\}/g);
  if (dangling) throw new Error(`Collection 含有未定義的變數：${[...new Set(dangling)].join(', ')}`);
  return { text, requests };
}

async function main() {
  if (!fs.existsSync(OPENAPI_FILE)) {
    throw new Error('找不到 openapi.json，請先執行 npm run openapi（npm run postman 會自動執行）');
  }
  const spec = JSON.parse(fs.readFileSync(OPENAPI_FILE, 'utf8'));
  const collection = await buildCollection(spec);
  const { text, requests } = validateCollection(collection);
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, `${text}\n`);
  console.log(`已產生 ${path.relative(ROOT, OUTPUT_FILE)}（${requests} 個請求）`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { buildCollection, validateCollection, OUTPUT_FILE, DEFAULT_BASE_URL };
