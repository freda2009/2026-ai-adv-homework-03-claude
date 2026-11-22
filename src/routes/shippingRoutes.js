const express = require('express');
const {
  validateShippingOptions,
  isValidSubtotal,
  calculateShipping,
  getShippingRates,
} = require('../utils/shipping');

const router = express.Router();

// 查詢字串只有字串：'true'／'false' 轉成布林，未提供維持 undefined（套預設），其他值原樣交給模組驗證後拒絕。
function parseBooleanQuery(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return raw;
}

/**
 * @openapi
 * /api/shipping/quote:
 *   get:
 *     summary: 運費試算（不建立訂單）
 *     description: |
 *       以 `src/utils/shipping.js` 試算運費，供購物車與結帳頁預估顯示；不讀取資料庫、不需登入。
 *       實際訂單金額仍以 `POST /api/orders` 建立時後端重新計算的結果為準。
 *     tags: [Shipping]
 *     parameters:
 *       - in: query
 *         name: subtotal
 *         required: true
 *         description: 商品小計（0 以上的整數）
 *         schema:
 *           type: integer
 *           minimum: 0
 *       - in: query
 *         name: shippingMethod
 *         schema:
 *           type: string
 *           enum: [home_delivery, convenience_store]
 *           default: home_delivery
 *       - in: query
 *         name: isRemoteArea
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *           default: 'false'
 *       - in: query
 *         name: isUrgent
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *           default: 'false'
 *     responses:
 *       200:
 *         description: 試算成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   allOf:
 *                     - $ref: '#/components/schemas/OrderShipping'
 *                     - type: object
 *                       properties:
 *                         free_shipping_applied:
 *                           type: boolean
 *                           description: 是否套用宅配滿額免基本運費
 *                         rates:
 *                           type: object
 *                           properties:
 *                             home_delivery_fee:
 *                               type: integer
 *                               example: 120
 *                             convenience_store_fee:
 *                               type: integer
 *                               example: 60
 *                             free_shipping_threshold:
 *                               type: integer
 *                               example: 1500
 *                             remote_area_surcharge:
 *                               type: integer
 *                               example: 200
 *                             urgent_surcharge:
 *                               type: integer
 *                               example: 250
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       400:
 *         description: subtotal 不是 0 以上的整數，或配送選項不合法（VALIDATION_ERROR）
 */
router.get('/quote', (req, res) => {
  const { subtotal: rawSubtotal, shippingMethod, isRemoteArea, isUrgent } = req.query;

  const subtotal = typeof rawSubtotal === 'string' && /^\d+$/.test(rawSubtotal) ? Number(rawSubtotal) : NaN;
  if (!isValidSubtotal(subtotal)) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: '商品小計（subtotal）必須是 0 以上的整數'
    });
  }

  const options = validateShippingOptions({
    shippingMethod,
    isRemoteArea: parseBooleanQuery(isRemoteArea),
    isUrgent: parseBooleanQuery(isUrgent),
  });
  if (options.error) {
    return res.status(400).json({ data: null, error: 'VALIDATION_ERROR', message: options.error });
  }

  const shipping = calculateShipping({ subtotal, ...options.value });

  res.json({
    data: {
      subtotal_amount: subtotal,
      ...shipping,
      total_amount: subtotal + shipping.shipping_fee,
      rates: getShippingRates(),
    },
    error: null,
    message: '成功'
  });
});

module.exports = router;
