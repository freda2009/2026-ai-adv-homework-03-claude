// 綠界付款：建立付款表單（checkout）與主動查詢驗證（verify）。
// 本專案只在本機執行，收不到綠界的 Server Notify：訂單只有在這裡呼叫 QueryTradeInfo、
// 驗證通過後才會變成 paid；瀏覽器帶回的任何付款結果都不被信任。
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const authMiddleware = require('../middleware/authMiddleware');
const ecpay = require('../services/ecpay');

const router = express.Router();

// 同一筆交易兩次查詢的最短間隔；綠界查詢過於頻繁會回 403 並封鎖約 30 分鐘。
const MIN_QUERY_INTERVAL_MS = 10 * 1000;
// 建立新交易前，最多回頭檢查幾筆舊的 created 交易（避免重複付款）。
const PRECHECK_LIMIT = 3;

// 與 SQLite datetime('now') 相同格式（UTC，'YYYY-MM-DD HH:MM:SS'）。
const sqlNow = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const sqlToMs = (value) => Date.parse(`${value.replace(' ', 'T')}Z`);

function fail(res, status, error, message) {
  return res.status(status).json({ data: null, error, message });
}

function getOwnedOrder(req, res) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);
  if (!order) {
    fail(res, 404, 'NOT_FOUND', '訂單不存在');
    return null;
  }
  return order;
}

function loadOrderDetail(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  return { ...order, items };
}

function isThrottled(attempt) {
  return Boolean(attempt.last_checked_at) && Date.now() - sqlToMs(attempt.last_checked_at) < MIN_QUERY_INTERVAL_MS;
}

const markPaid = db.transaction((attempt, order, data) => {
  db.prepare(
    `UPDATE payments SET status = 'paid', ecpay_trade_no = ?, trade_status = '1', payment_type = ?, paid_at = ? WHERE id = ?`
  ).run(data.TradeNo || null, data.PaymentType || null, data.PaymentDate || null, attempt.id);
  db.prepare(`UPDATE orders SET status = 'paid' WHERE id = ? AND status = 'pending'`).run(order.id);
});

// 呼叫綠界查詢一筆付款交易並套用結果。回傳 { result, notFound? }：
//   paid / pending / failed / amount_mismatch
// 查詢失敗、簽章不符、回應與本地不一致時丟出 EcpayError，不改任何狀態。
async function checkAttempt(attempt, order) {
  // 先記錄查詢時間（與上面的節流檢查之間沒有 await），避免同時進來的請求重複查詢。
  db.prepare('UPDATE payments SET last_checked_at = ? WHERE id = ?').run(sqlNow(), attempt.id);

  const data = await ecpay.queryTradeInfo(attempt.merchant_trade_no);
  if (data.MerchantTradeNo !== attempt.merchant_trade_no) {
    throw new ecpay.EcpayError('綠界回應的 MerchantTradeNo 與本地不一致', 'ECPAY_MISMATCH');
  }

  switch (data.TradeStatus) {
    case '1': {
      // 金額必須同時符合交易記錄與訂單，防止竄改。
      if (Number(data.TradeAmt) !== attempt.amount || attempt.amount !== order.total_amount) {
        console.error('[ecpay] 金額不符', { order: order.id, expected: order.total_amount, tradeAmt: data.TradeAmt });
        return { result: 'amount_mismatch' };
      }
      markPaid(attempt, order, data);
      return { result: 'paid' };
    }
    case '0':
      db.prepare(`UPDATE payments SET trade_status = '0', ecpay_trade_no = ? WHERE id = ?`).run(data.TradeNo || null, attempt.id);
      return { result: 'pending' };
    case '10200047': // 綠界查無此筆：消費者可能還沒走到綠界付款頁
      db.prepare(`UPDATE payments SET trade_status = '10200047' WHERE id = ?`).run(attempt.id);
      return { result: 'pending', notFound: true };
    case '10200095': // 交易未成立：這筆交易失敗，訂單仍是 pending，可重新付款
      db.prepare(`UPDATE payments SET status = 'failed', trade_status = '10200095' WHERE id = ?`).run(attempt.id);
      return { result: 'failed' };
    default:
      throw new ecpay.EcpayError(`未預期的 TradeStatus：${data.TradeStatus}`, 'ECPAY_UNEXPECTED_STATUS');
  }
}

function handleEcpayError(err, res, next) {
  if (!(err instanceof ecpay.EcpayError)) return next(err);
  console.error('[ecpay]', err.code, err.message);
  if (err.code === 'ECPAY_NOT_CONFIGURED') {
    return fail(res, 503, 'PAYMENT_NOT_CONFIGURED', '金流尚未設定');
  }
  return fail(res, 502, 'PAYMENT_QUERY_FAILED', '無法確認付款結果，請稍後再試');
}

/**
 * @openapi
 * /api/orders/{id}/ecpay/checkout:
 *   post:
 *     summary: 建立綠界付款交易，回傳要 POST 到綠界的表單欄位
 *     description: >
 *       每次呼叫都會產生新的 MerchantTradeNo。建立前會先查詢該訂單舊的未完成交易，
 *       若已付款則回 409。前端必須以全頁跳轉的表單送出（不可使用 iframe）。
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: 回傳 { action, method, fields }，fields 已含 CheckMacValue
 *       400:
 *         description: 訂單不是 pending（INVALID_STATUS）
 *       404:
 *         description: 訂單不存在或不屬於自己
 *       409:
 *         description: 舊交易已付款（CONFLICT）
 *       503:
 *         description: 金流尚未設定
 */
router.post('/:id/ecpay/checkout', authMiddleware, async (req, res, next) => {
  try {
    const order = getOwnedOrder(req, res);
    if (!order) return;
    if (order.status !== 'pending') {
      return fail(res, 400, 'INVALID_STATUS', '訂單狀態不是 pending，無法付款');
    }

    // 回頭檢查舊交易：消費者可能已在另一個分頁付款，避免重複付款。查詢失敗不阻擋新交易。
    const previous = db.prepare(
      `SELECT * FROM payments WHERE order_id = ? AND status = 'created' ORDER BY created_at DESC, rowid DESC LIMIT ?`
    ).all(order.id, PRECHECK_LIMIT);
    for (const attempt of previous) {
      if (isThrottled(attempt)) continue;
      try {
        const outcome = await checkAttempt(attempt, order);
        if (outcome.result === 'paid') {
          return fail(res, 409, 'CONFLICT', '此訂單已完成付款');
        }
      } catch (err) {
        if (!(err instanceof ecpay.EcpayError)) throw err;
        console.error('[ecpay] 檢查舊交易失敗：', err.code, err.message);
      }
    }

    const items = db.prepare('SELECT product_name, quantity FROM order_items WHERE order_id = ?').all(order.id);
    const merchantTradeNo = ecpay.generateMerchantTradeNo();
    const checkout = ecpay.buildCheckoutFields({
      order,
      itemNames: items.map((item) => `${item.product_name} x${item.quantity}`),
      merchantTradeNo
    });
    db.prepare(
      'INSERT INTO payments (id, order_id, merchant_trade_no, amount) VALUES (?, ?, ?, ?)'
    ).run(uuidv4(), order.id, merchantTradeNo, order.total_amount);

    res.status(201).json({ data: checkout, error: null, message: '請前往綠界付款' });
  } catch (err) {
    handleEcpayError(err, res, next);
  }
});

/**
 * @openapi
 * /api/orders/{id}/ecpay/verify:
 *   post:
 *     summary: 由伺服器呼叫綠界 QueryTradeInfo 驗證付款結果並更新訂單狀態
 *     description: >
 *       取代 Server Notify。只有查詢結果通過 CheckMacValue、MerchantTradeNo 與金額檢查且
 *       TradeStatus=1 時訂單才會變成 paid。同一筆交易 10 秒內只能查詢一次。
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: data.result 為 paid、pending 或 failed，並附上 data.order
 *       400:
 *         description: 尚未建立付款交易（NO_PAYMENT）或訂單狀態不允許（INVALID_STATUS）
 *       404:
 *         description: 訂單不存在或不屬於自己
 *       409:
 *         description: 付款金額與訂單不符（PAYMENT_AMOUNT_MISMATCH）
 *       429:
 *         description: 查詢過於頻繁（TOO_MANY_REQUESTS）
 *       502:
 *         description: 無法確認付款結果（PAYMENT_QUERY_FAILED）
 */
router.post('/:id/ecpay/verify', authMiddleware, async (req, res, next) => {
  try {
    const order = getOwnedOrder(req, res);
    if (!order) return;

    if (order.status === 'paid') {
      return res.json({ data: { result: 'paid', order: loadOrderDetail(order.id) }, error: null, message: '付款成功' });
    }
    if (order.status !== 'pending') {
      return fail(res, 400, 'INVALID_STATUS', '訂單狀態不是 pending，無法查詢付款');
    }

    const attempt = db.prepare(
      `SELECT * FROM payments WHERE order_id = ? AND status = 'created' ORDER BY created_at DESC, rowid DESC LIMIT 1`
    ).get(order.id);
    if (!attempt) {
      return fail(res, 400, 'NO_PAYMENT', '此訂單尚未建立付款交易');
    }
    if (isThrottled(attempt)) {
      res.set('Retry-After', String(Math.ceil(MIN_QUERY_INTERVAL_MS / 1000)));
      return fail(res, 429, 'TOO_MANY_REQUESTS', '查詢過於頻繁，請稍後再試');
    }

    const outcome = await checkAttempt(attempt, order);
    if (outcome.result === 'amount_mismatch') {
      return fail(res, 409, 'PAYMENT_AMOUNT_MISMATCH', '付款金額與訂單不符，請聯繫客服');
    }

    const messages = {
      paid: '付款成功',
      pending: outcome.notFound ? '綠界尚無此筆交易；若尚未完成付款，請重新付款' : '尚未確認付款，請稍後再重新查詢',
      failed: '付款未完成，可重新付款'
    };
    res.json({
      data: { result: outcome.result, order: loadOrderDetail(order.id) },
      error: null,
      message: messages[outcome.result]
    });
  } catch (err) {
    handleEcpayError(err, res, next);
  }
});

module.exports = router;
