// 綠界 ECPay 全方位金流（AIO）：CheckMacValue、建立付款表單欄位、主動查詢訂單（QueryTradeInfo）。
// 本專案只在本機執行，收不到綠界的 Server Notify，付款結果一律由這裡的 queryTradeInfo 主動驗證。
// 演算法來源：.claude/skills/ecpay/guides/13-checkmacvalue.md（Node.js 版）。
const crypto = require('crypto');

const DEFAULT_ITEM_NAME = '花漾生活商品';
const ITEM_NAME_MAX_CHARS = 200;
const QUERY_TIMEOUT_MS = 10000;
const TRADE_NO_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

class EcpayError extends Error {
  constructor(message, code = 'ECPAY_ERROR') {
    super(message);
    this.name = 'EcpayError';
    this.code = code;
  }
}

// 每次呼叫時才讀環境變數，方便測試調整；金鑰只來自環境變數。
function getConfig() {
  const merchantId = process.env.ECPAY_MERCHANT_ID;
  const hashKey = process.env.ECPAY_HASH_KEY;
  const hashIv = process.env.ECPAY_HASH_IV;
  if (!merchantId || !hashKey || !hashIv) {
    throw new EcpayError('ECPAY_MERCHANT_ID／ECPAY_HASH_KEY／ECPAY_HASH_IV 未設定', 'ECPAY_NOT_CONFIGURED');
  }
  // 只有明確設為 production 才連正式環境，其他值（含拼錯）一律用測試環境，避免誤用真實金流。
  const isProduction = String(process.env.ECPAY_ENV || '').toLowerCase() === 'production';
  const appBaseUrl = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/+$/, '');
  return {
    merchantId,
    hashKey,
    hashIv,
    isProduction,
    gateway: isProduction ? 'https://payment.ecpay.com.tw' : 'https://payment-stage.ecpay.com.tw',
    appBaseUrl,
    // ReturnURL 為必填；本機收不到綠界的 Server Notify，這個位址不會被實作。
    returnUrl: process.env.ECPAY_RETURN_URL || `${appBaseUrl}/api/ecpay/notify`,
  };
}

// ---- CheckMacValue（SHA256 / MD5） ----

// 注意：這是 CheckMacValue 專用的編碼（urlencode → 小寫 → .NET 字元還原），不可與 AES 的 URL encode 混用。
function ecpayUrlEncode(source) {
  // encodeURIComponent 空格→%20（需改成 +）、不編碼 ' 與 ~（PHP urlencode 會編碼）
  let encoded = encodeURIComponent(source).replace(/%20/g, '+').replace(/~/g, '%7e').replace(/'/g, '%27');
  encoded = encoded.toLowerCase();
  const restore = { '%2d': '-', '%5f': '_', '%2e': '.', '%21': '!', '%2a': '*', '%28': '(', '%29': ')' };
  for (const [from, to] of Object.entries(restore)) {
    encoded = encoded.split(from).join(to);
  }
  return encoded;
}

function generateCheckMacValue(params, hashKey, hashIv, method = 'sha256') {
  const entries = Object.entries(params).filter(([key]) => key !== 'CheckMacValue');
  entries.sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const paramString = entries.map(([key, value]) => `${key}=${value}`).join('&');
  const raw = `HashKey=${hashKey}&${paramString}&HashIV=${hashIv}`;
  return crypto.createHash(method).update(ecpayUrlEncode(raw), 'utf8').digest('hex').toUpperCase();
}

// 以 timing-safe 方式比對；長度不同須先獨立判斷，否則 timingSafeEqual 會丟錯。
function verifyCheckMacValue(params, hashKey, hashIv, method = 'sha256') {
  const received = Buffer.from(String(params.CheckMacValue || '').toUpperCase());
  const calculated = Buffer.from(generateCheckMacValue(params, hashKey, hashIv, method));
  if (received.length !== calculated.length) return false;
  return crypto.timingSafeEqual(received, calculated);
}

// ---- 建立付款表單 ----

const pad = (n, width = 2) => String(n).padStart(width, '0');

// 綠界要求台灣時間（UTC+8）；不依賴伺服器時區。
function toTaiwanParts(date) {
  const t = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return {
    yyyy: t.getUTCFullYear(),
    MM: pad(t.getUTCMonth() + 1),
    dd: pad(t.getUTCDate()),
    HH: pad(t.getUTCHours()),
    mm: pad(t.getUTCMinutes()),
    ss: pad(t.getUTCSeconds()),
  };
}

function formatTradeDate(date = new Date()) {
  const p = toTaiwanParts(date);
  return `${p.yyyy}/${p.MM}/${p.dd} ${p.HH}:${p.mm}:${p.ss}`;
}

// MerchantTradeNo 在綠界為永久唯一、僅英數、最長 20 字：每次付款嘗試都要重新產生。
// 格式：P + yyMMddHHmmss（UTC+8）+ 5 碼隨機大寫英數 = 18 字。
function generateMerchantTradeNo(date = new Date()) {
  const p = toTaiwanParts(date);
  const stamp = `${String(p.yyyy).slice(2)}${p.MM}${p.dd}${p.HH}${p.mm}${p.ss}`;
  let suffix = '';
  for (let i = 0; i < 5; i++) {
    suffix += TRADE_NO_ALPHABET[crypto.randomInt(TRADE_NO_ALPHABET.length)];
  }
  return `P${stamp}${suffix}`;
}

// 商品名稱以 # 分隔；移除 # < > 與控制字元，並限制在 200 字內（超過會被截斷，多位元組字元截斷會造成 CheckMacValue 不符）。
// 同時移除 & + % =：綠界的查詢回應是 URL-encoded 字串，這些字元可能讓回應解析後與簽章不一致，導致無法驗證付款。
function buildItemName(names) {
  const cleaned = names
    .map((name) => String(name).replace(/[#<>&+%=\u0000-\u001f\u007f]/g, '').trim())
    .filter(Boolean);
  if (cleaned.length === 0) return DEFAULT_ITEM_NAME;
  return [...cleaned.join('#')].slice(0, ITEM_NAME_MAX_CHARS).join('');
}

// 回傳前端要 POST 給綠界的 { action, method, fields }（fields 已含 CheckMacValue）。
function buildCheckoutFields({ order, itemNames, merchantTradeNo, now = new Date() }) {
  if (!Number.isInteger(order.total_amount) || order.total_amount <= 0) {
    throw new EcpayError('訂單金額必須為正整數', 'ECPAY_BAD_AMOUNT');
  }
  const cfg = getConfig();
  const fields = {
    MerchantID: cfg.merchantId,
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: formatTradeDate(now),
    PaymentType: 'aio',
    TotalAmount: String(order.total_amount),
    TradeDesc: '花漾生活訂單',
    ItemName: buildItemName(itemNames),
    ReturnURL: cfg.returnUrl,
    ChoosePayment: 'ALL',
    OrderResultURL: `${cfg.appBaseUrl}/ecpay/return`,
    ClientBackURL: `${cfg.appBaseUrl}/orders/${order.id}`,
    EncryptType: '1',
  };
  fields.CheckMacValue = generateCheckMacValue(fields, cfg.hashKey, cfg.hashIv);
  return { action: `${cfg.gateway}/Cashier/AioCheckOut/V5`, method: 'POST', fields };
}

// ---- 主動查詢訂單（取代 Server Notify） ----

// 官方文件未說明回應格式：同時支援 URL-encoded 字串與 JSON，值一律轉成字串。
function parseQueryResponse(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) throw new EcpayError('綠界查詢回應為空', 'ECPAY_BAD_RESPONSE');
  if (trimmed.startsWith('{')) {
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      throw new EcpayError('綠界查詢回應不是有效的 JSON', 'ECPAY_BAD_RESPONSE');
    }
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
  }
  if (!trimmed.includes('=')) throw new EcpayError('無法解析綠界查詢回應', 'ECPAY_BAD_RESPONSE');
  return Object.fromEntries(new URLSearchParams(trimmed));
}

// 呼叫 QueryTradeInfo/V5，回傳已通過 CheckMacValue 驗證的欄位物件。
// TimeStamp 只有 3 分鐘有效期，每次呼叫都重新產生。失敗一律丟出 EcpayError（不回傳半套資料）。
async function queryTradeInfo(merchantTradeNo, { fetchImpl } = {}) {
  const cfg = getConfig();
  const params = {
    MerchantID: cfg.merchantId,
    MerchantTradeNo: merchantTradeNo,
    TimeStamp: String(Math.floor(Date.now() / 1000)),
  };
  params.CheckMacValue = generateCheckMacValue(params, cfg.hashKey, cfg.hashIv);

  let response;
  try {
    response = await (fetchImpl || globalThis.fetch)(`${cfg.gateway}/Cashier/QueryTradeInfo/V5`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
    });
  } catch (err) {
    throw new EcpayError(`無法連線綠界：${err.message}`, 'ECPAY_NETWORK');
  }
  // 查詢太頻繁時綠界回 403 並封鎖約 30 分鐘。
  if (response.status === 403) throw new EcpayError('綠界回應 403（查詢頻率過高）', 'ECPAY_RATE_LIMITED');
  if (!response.ok) {
    // 例如簽章錯誤時綠界回 HTTP 500，body 仍帶 TradeStatus=10200073；把它帶進訊息方便除錯。
    let tradeStatus = '';
    try {
      tradeStatus = parseQueryResponse(await response.text()).TradeStatus || '';
    } catch (err) {
      // 無法解析就只回報 HTTP 狀態碼
    }
    throw new EcpayError(`綠界回應 HTTP ${response.status}${tradeStatus ? `（TradeStatus ${tradeStatus}）` : ''}`, 'ECPAY_HTTP');
  }

  const data = parseQueryResponse(await response.text());
  if (!verifyCheckMacValue(data, cfg.hashKey, cfg.hashIv)) {
    throw new EcpayError('綠界回應的 CheckMacValue 驗證失敗', 'ECPAY_BAD_CMV');
  }
  return data;
}

module.exports = {
  EcpayError,
  getConfig,
  ecpayUrlEncode,
  generateCheckMacValue,
  verifyCheckMacValue,
  formatTradeDate,
  generateMerchantTradeNo,
  buildItemName,
  buildCheckoutFields,
  parseQueryResponse,
  queryTradeInfo,
};
