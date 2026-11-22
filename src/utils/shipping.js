// 運費計算模組：配送方式、偏遠地區、當日急件與滿額免運的規則全部集中在這裡。
// 純函式、不碰資料庫；建立訂單（orderRoutes）與試算 API（shippingRoutes）共用，前端只透過試算 API 取得結果。

const SHIPPING_METHODS = Object.freeze({
  HOME_DELIVERY: 'home_delivery', // 宅配
  CONVENIENCE_STORE: 'convenience_store', // 超商取貨
});

// 金額單位：新台幣元，皆為整數。
const SHIPPING_RATES = Object.freeze({
  homeDeliveryFee: 120, // 宅配基本運費
  convenienceStoreFee: 60, // 超商取貨費用（不是基本運費，滿額不免）
  freeShippingThreshold: 1500, // 商品小計達此金額免「基本運費」（只適用宅配）
  remoteAreaSurcharge: 200, // 偏遠地區加收
  urgentSurcharge: 250, // 當日急件加收
});

const DEFAULT_OPTIONS = Object.freeze({
  shippingMethod: SHIPPING_METHODS.HOME_DELIVERY,
  isRemoteArea: false,
  isUrgent: false,
});

const VALID_METHODS = Object.values(SHIPPING_METHODS);

// 驗證並補上預設值。未提供（undefined）的欄位使用預設；其他值必須是合法列舉或真正的布林值
// （null、"true"、1 都拒絕）。回傳 { value } 或 { error }（error 為繁體中文訊息）。
function validateShippingOptions(input = {}) {
  const { shippingMethod, isRemoteArea, isUrgent } = input || {};
  const value = {
    shippingMethod: shippingMethod === undefined ? DEFAULT_OPTIONS.shippingMethod : shippingMethod,
    isRemoteArea: isRemoteArea === undefined ? DEFAULT_OPTIONS.isRemoteArea : isRemoteArea,
    isUrgent: isUrgent === undefined ? DEFAULT_OPTIONS.isUrgent : isUrgent,
  };

  if (!VALID_METHODS.includes(value.shippingMethod)) {
    return { error: '配送方式必須是 home_delivery（宅配）或 convenience_store（超商取貨）' };
  }
  if (typeof value.isRemoteArea !== 'boolean') {
    return { error: '偏遠地區（isRemoteArea）必須是 true 或 false' };
  }
  if (typeof value.isUrgent !== 'boolean') {
    return { error: '當日急件（isUrgent）必須是 true 或 false' };
  }
  return { value };
}

function isValidSubtotal(subtotal) {
  return Number.isSafeInteger(subtotal) && subtotal >= 0;
}

// 計算運費明細。key 與 orders 資料表欄位一致，可直接寫入與回傳。
// 輸入不合法時丟出 TypeError：呼叫端（路由）必須先用 validateShippingOptions 與 isValidSubtotal 驗證。
function calculateShipping({ subtotal, ...options } = {}) {
  if (!isValidSubtotal(subtotal)) {
    throw new TypeError('subtotal 必須是 0 以上的整數');
  }
  const { value, error } = validateShippingOptions(options);
  if (error) {
    throw new TypeError(error);
  }

  const isHomeDelivery = value.shippingMethod === SHIPPING_METHODS.HOME_DELIVERY;
  const freeShippingApplied = isHomeDelivery && subtotal >= SHIPPING_RATES.freeShippingThreshold;

  let baseShippingFee;
  if (isHomeDelivery) {
    baseShippingFee = freeShippingApplied ? 0 : SHIPPING_RATES.homeDeliveryFee;
  } else {
    baseShippingFee = SHIPPING_RATES.convenienceStoreFee;
  }
  const remoteSurcharge = value.isRemoteArea ? SHIPPING_RATES.remoteAreaSurcharge : 0;
  const urgentSurcharge = value.isUrgent ? SHIPPING_RATES.urgentSurcharge : 0;

  return {
    shipping_method: value.shippingMethod,
    base_shipping_fee: baseShippingFee,
    remote_surcharge: remoteSurcharge,
    urgent_surcharge: urgentSurcharge,
    shipping_fee: baseShippingFee + remoteSurcharge + urgentSurcharge,
    free_shipping_applied: freeShippingApplied,
  };
}

// 給 API 回傳用的費率表（snake_case）。
function getShippingRates() {
  return {
    home_delivery_fee: SHIPPING_RATES.homeDeliveryFee,
    convenience_store_fee: SHIPPING_RATES.convenienceStoreFee,
    free_shipping_threshold: SHIPPING_RATES.freeShippingThreshold,
    remote_area_surcharge: SHIPPING_RATES.remoteAreaSurcharge,
    urgent_surcharge: SHIPPING_RATES.urgentSurcharge,
  };
}

module.exports = {
  SHIPPING_METHODS,
  SHIPPING_RATES,
  validateShippingOptions,
  isValidSubtotal,
  calculateShipping,
  getShippingRates,
};
