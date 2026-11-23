// Shipping 模組單元測試：純函式，不需要資料庫與 app。
const {
  SHIPPING_METHODS,
  SHIPPING_RATES,
  validateShippingOptions,
  isValidSubtotal,
  calculateShipping,
  getShippingRates,
} = require('../../src/utils/shipping');

const HOME = SHIPPING_METHODS.HOME_DELIVERY;
const STORE = SHIPPING_METHODS.CONVENIENCE_STORE;

describe('calculateShipping（運費計算）', () => {
  it('宅配基本運費：小計 1,000 收 120', () => {
    expect(calculateShipping({ subtotal: 1000, shippingMethod: HOME })).toEqual({
      shipping_method: HOME,
      base_shipping_fee: 120,
      remote_surcharge: 0,
      urgent_surcharge: 0,
      shipping_fee: 120,
      free_shipping_applied: false,
    });
  });

  it('超商取貨費用：小計 1,000 收 60', () => {
    expect(calculateShipping({ subtotal: 1000, shippingMethod: STORE })).toEqual({
      shipping_method: STORE,
      base_shipping_fee: 60,
      remote_surcharge: 0,
      urgent_surcharge: 0,
      shipping_fee: 60,
      free_shipping_applied: false,
    });
  });

  it('商品小計 1,499：未達免運門檻，宅配仍收 120', () => {
    const result = calculateShipping({ subtotal: 1499, shippingMethod: HOME });
    expect(result.base_shipping_fee).toBe(120);
    expect(result.shipping_fee).toBe(120);
    expect(result.free_shipping_applied).toBe(false);
  });

  it('商品小計 1,500：宅配免基本運費', () => {
    const result = calculateShipping({ subtotal: 1500, shippingMethod: HOME });
    expect(result.base_shipping_fee).toBe(0);
    expect(result.shipping_fee).toBe(0);
    expect(result.free_shipping_applied).toBe(true);
  });

  it('偏遠地區附加費：宅配 120 + 200 = 320', () => {
    const result = calculateShipping({ subtotal: 1000, shippingMethod: HOME, isRemoteArea: true });
    expect(result.base_shipping_fee).toBe(120);
    expect(result.remote_surcharge).toBe(200);
    expect(result.urgent_surcharge).toBe(0);
    expect(result.shipping_fee).toBe(320);
  });

  it('當日急件附加費：宅配 120 + 250 = 370', () => {
    const result = calculateShipping({ subtotal: 1000, shippingMethod: HOME, isUrgent: true });
    expect(result.base_shipping_fee).toBe(120);
    expect(result.remote_surcharge).toBe(0);
    expect(result.urgent_surcharge).toBe(250);
    expect(result.shipping_fee).toBe(370);
  });

  it('多項附加費同時成立：宅配 120 + 200 + 250 = 570', () => {
    const result = calculateShipping({ subtotal: 1000, shippingMethod: HOME, isRemoteArea: true, isUrgent: true });
    expect(result).toMatchObject({ base_shipping_fee: 120, remote_surcharge: 200, urgent_surcharge: 250, shipping_fee: 570 });
  });

  it('多項附加費同時成立：超商取貨 60 + 200 + 250 = 510', () => {
    const result = calculateShipping({ subtotal: 1000, shippingMethod: STORE, isRemoteArea: true, isUrgent: true });
    expect(result).toMatchObject({ base_shipping_fee: 60, remote_surcharge: 200, urgent_surcharge: 250, shipping_fee: 510 });
  });

  it('滿額免運與附加費同時成立：小計 1,500 只免基本運費，附加費照收 0 + 200 + 250 = 450', () => {
    const result = calculateShipping({ subtotal: 1500, shippingMethod: HOME, isRemoteArea: true, isUrgent: true });
    expect(result).toEqual({
      shipping_method: HOME,
      base_shipping_fee: 0,
      remote_surcharge: 200,
      urgent_surcharge: 250,
      shipping_fee: 450,
      free_shipping_applied: true,
    });
  });

  it('滿額免運與單一附加費：小計 2,000 偏遠地區只收 200', () => {
    const result = calculateShipping({ subtotal: 2000, shippingMethod: HOME, isRemoteArea: true });
    expect(result).toMatchObject({ base_shipping_fee: 0, remote_surcharge: 200, shipping_fee: 200, free_shipping_applied: true });
  });

  it('超商取貨不是基本運費：小計 1,500 以上仍收 60', () => {
    for (const subtotal of [1500, 5000]) {
      const result = calculateShipping({ subtotal, shippingMethod: STORE });
      expect(result.base_shipping_fee).toBe(60);
      expect(result.shipping_fee).toBe(60);
      expect(result.free_shipping_applied).toBe(false);
    }
  });

  it('未指定選項時預設為宅配、非偏遠、非急件', () => {
    expect(calculateShipping({ subtotal: 800 })).toMatchObject({
      shipping_method: HOME,
      base_shipping_fee: 120,
      remote_surcharge: 0,
      urgent_surcharge: 0,
      shipping_fee: 120,
    });
  });

  it('小計 0 也能計算（宅配收 120）', () => {
    expect(calculateShipping({ subtotal: 0 }).shipping_fee).toBe(120);
  });

  it('所有金額都是整數', () => {
    const result = calculateShipping({ subtotal: 1234, shippingMethod: STORE, isRemoteArea: true, isUrgent: true });
    for (const key of ['base_shipping_fee', 'remote_surcharge', 'urgent_surcharge', 'shipping_fee']) {
      expect(Number.isInteger(result[key])).toBe(true);
    }
  });

  it('小計不是 0 以上的整數時丟出 TypeError', () => {
    for (const subtotal of [-1, 1.5, '1500', NaN, Infinity, null, undefined]) {
      expect(() => calculateShipping({ subtotal })).toThrow(TypeError);
    }
  });

  it('選項不合法時丟出 TypeError', () => {
    expect(() => calculateShipping({ subtotal: 100, shippingMethod: 'drone' })).toThrow(TypeError);
    expect(() => calculateShipping({ subtotal: 100, isUrgent: 'true' })).toThrow(TypeError);
  });
});

describe('validateShippingOptions（選項驗證）', () => {
  it('沒有任何欄位時套用預設值', () => {
    expect(validateShippingOptions({})).toEqual({
      value: { shippingMethod: HOME, isRemoteArea: false, isUrgent: false },
    });
    expect(validateShippingOptions()).toEqual({
      value: { shippingMethod: HOME, isRemoteArea: false, isUrgent: false },
    });
  });

  it('合法值原樣保留，並忽略無關欄位', () => {
    expect(validateShippingOptions({ shippingMethod: STORE, isRemoteArea: true, isUrgent: true, recipientName: 'x' }))
      .toEqual({ value: { shippingMethod: STORE, isRemoteArea: true, isUrgent: true } });
  });

  it('不支援的配送方式回傳錯誤訊息', () => {
    for (const shippingMethod of ['drone', '', null, 1, 'HOME_DELIVERY']) {
      const result = validateShippingOptions({ shippingMethod });
      expect(result.value).toBeUndefined();
      expect(result.error).toMatch(/配送方式/);
    }
  });

  it('偏遠地區與急件必須是真正的布林值', () => {
    for (const bad of ['true', 'false', 1, 0, null, 'yes']) {
      expect(validateShippingOptions({ isRemoteArea: bad }).error).toMatch(/偏遠地區/);
      expect(validateShippingOptions({ isUrgent: bad }).error).toMatch(/當日急件/);
    }
  });
});

describe('isValidSubtotal 與費率表', () => {
  it('只接受 0 以上的安全整數', () => {
    expect(isValidSubtotal(0)).toBe(true);
    expect(isValidSubtotal(1500)).toBe(true);
    expect(isValidSubtotal(-1)).toBe(false);
    expect(isValidSubtotal(10.5)).toBe(false);
    expect(isValidSubtotal(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });

  it('費率符合需求，且不能被修改', () => {
    expect(SHIPPING_RATES).toEqual({
      homeDeliveryFee: 120,
      convenienceStoreFee: 60,
      freeShippingThreshold: 1500,
      remoteAreaSurcharge: 200,
      urgentSurcharge: 250,
    });
    expect(Object.isFrozen(SHIPPING_RATES)).toBe(true);
    expect(getShippingRates()).toEqual({
      home_delivery_fee: 120,
      convenience_store_fee: 60,
      free_shipping_threshold: 1500,
      remote_area_surcharge: 200,
      urgent_surcharge: 250,
    });
  });
});
