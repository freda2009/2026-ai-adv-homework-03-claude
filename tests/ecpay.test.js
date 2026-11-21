const fs = require('fs');
const path = require('path');
const {
  ecpayUrlEncode,
  generateCheckMacValue,
  verifyCheckMacValue,
  formatTradeDate,
  generateMerchantTradeNo,
  buildItemName,
  parseQueryResponse,
} = require('../src/services/ecpay');

const HASH_KEY = 'pwFHCqoQZGmho4w6';
const HASH_IV = 'EkRm7iFT261dpevs';

describe('ecpayUrlEncode', () => {
  it('空格編成 +，單引號編成 %27，~ 編成 %7e', () => {
    expect(ecpayUrlEncode('a b')).toBe('a+b');
    expect(ecpayUrlEncode("Tom's")).toBe('tom%27s');
    expect(ecpayUrlEncode('~')).toBe('%7e');
  });

  it('保留 - _ . ! * ( )，其餘特殊字元編碼並轉小寫', () => {
    expect(ecpayUrlEncode('-_.!*()')).toBe('-_.!*()');
    expect(ecpayUrlEncode('&=')).toBe('%26%3d');
    expect(ecpayUrlEncode('測試')).toBe('%e6%b8%ac%e8%a9%a6');
  });
});

describe('generateCheckMacValue / verifyCheckMacValue', () => {
  const params = { MerchantID: '3002607', MerchantTradeNo: 'P250101120506ABCDE', TradeAmt: '100' };

  it('產生 64 碼大寫 SHA256；MD5 為 32 碼', () => {
    expect(generateCheckMacValue(params, HASH_KEY, HASH_IV)).toMatch(/^[0-9A-F]{64}$/);
    expect(generateCheckMacValue(params, HASH_KEY, HASH_IV, 'md5')).toMatch(/^[0-9A-F]{32}$/);
  });

  it('參數順序與既有的 CheckMacValue 欄位不影響結果', () => {
    const a = generateCheckMacValue(params, HASH_KEY, HASH_IV);
    const reordered = { TradeAmt: '100', MerchantTradeNo: params.MerchantTradeNo, MerchantID: '3002607', CheckMacValue: 'X' };
    expect(generateCheckMacValue(reordered, HASH_KEY, HASH_IV)).toBe(a);
  });

  it('驗證：正確通過；竄改任一欄位、缺少或錯誤的 CheckMacValue 皆失敗', () => {
    const cmv = generateCheckMacValue(params, HASH_KEY, HASH_IV);
    expect(verifyCheckMacValue({ ...params, CheckMacValue: cmv }, HASH_KEY, HASH_IV)).toBe(true);
    expect(verifyCheckMacValue({ ...params, CheckMacValue: cmv.toLowerCase() }, HASH_KEY, HASH_IV)).toBe(true);
    expect(verifyCheckMacValue({ ...params, TradeAmt: '1', CheckMacValue: cmv }, HASH_KEY, HASH_IV)).toBe(false);
    expect(verifyCheckMacValue(params, HASH_KEY, HASH_IV)).toBe(false);
    expect(verifyCheckMacValue({ ...params, CheckMacValue: 'short' }, HASH_KEY, HASH_IV)).toBe(false);
  });
});

// 官方測試向量位於 skill 的 repo（以 git submodule 引用，不複製進本專案）。
// 檔案不存在時整組略過。
const vectorFile = path.join(__dirname, '..', '.claude', 'skills', 'ecpay', 'test-vectors', 'checkmacvalue.json');
const hasVectors = fs.existsSync(vectorFile);
const vectors = hasVectors
  ? JSON.parse(fs.readFileSync(vectorFile, 'utf8')).vectors.filter((v) => v.params && !v.formula)
  : [];

describe.skipIf(!hasVectors)('CheckMacValue 官方測試向量', () => {
  it.each(vectors.map((v) => [v.name, v]))('%s', (_name, v) => {
    expect(generateCheckMacValue(v.params, v.hashKey, v.hashIV, v.method.toLowerCase())).toBe(v.expected);
  });
});

describe('formatTradeDate（UTC+8）', () => {
  it('把 UTC 時間轉成台灣時間 yyyy/MM/dd HH:mm:ss', () => {
    expect(formatTradeDate(new Date('2025-01-01T04:05:06Z'))).toBe('2025/01/01 12:05:06');
  });

  it('跨日、跨年正確進位', () => {
    expect(formatTradeDate(new Date('2025-12-31T16:00:00Z'))).toBe('2026/01/01 00:00:00');
  });
});

describe('generateMerchantTradeNo', () => {
  it('格式為 P + yyMMddHHmmss(UTC+8) + 5 碼大寫英數，共 18 字', () => {
    const no = generateMerchantTradeNo(new Date('2025-01-01T04:05:06Z'));
    expect(no).toMatch(/^P250101120506[A-Z0-9]{5}$/);
    expect(no).toHaveLength(18);
  });

  it('連續產生不會重複', () => {
    const set = new Set(Array.from({ length: 200 }, () => generateMerchantTradeNo()));
    expect(set.size).toBe(200);
  });
});

describe('buildItemName', () => {
  it('以 # 串接商品名稱', () => {
    expect(buildItemName(['玫瑰 x1', '百合 x2'])).toBe('玫瑰 x1#百合 x2');
  });

  it('移除 # < > 與控制字元', () => {
    expect(buildItemName(['<b>玫#瑰</b>\n'])).toBe('b玫瑰/b');
  });

  it('移除會干擾 URL-encoded 回應解析的 & + % =', () => {
    expect(buildItemName(['A&B+C%D=E'])).toBe('ABCDE');
  });

  it('超過 200 字會截斷，且不會切在字元中間', () => {
    const result = buildItemName(['花'.repeat(300)]);
    expect([...result]).toHaveLength(200);
  });

  it('沒有可用名稱時回傳預設值', () => {
    expect(buildItemName([])).toBe('花漾生活商品');
    expect(buildItemName(['###'])).toBe('花漾生活商品');
  });
});

describe('parseQueryResponse', () => {
  it('解析 URL-encoded 字串（值會被解碼）', () => {
    expect(parseQueryResponse('MerchantID=3002607&TradeStatus=1&ItemName=a+b%23c'))
      .toEqual({ MerchantID: '3002607', TradeStatus: '1', ItemName: 'a b#c' });
  });

  it('解析 JSON，並把值轉成字串', () => {
    expect(parseQueryResponse('{"TradeStatus":1,"TradeAmt":100}'))
      .toEqual({ TradeStatus: '1', TradeAmt: '100' });
  });

  it('空字串或無法解析時丟出錯誤', () => {
    expect(() => parseQueryResponse('')).toThrow();
    expect(() => parseQueryResponse('   ')).toThrow();
  });
});
