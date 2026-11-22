const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const authMiddleware = require('../middleware/authMiddleware');
const { validateShippingOptions, calculateShipping } = require('../utils/shipping');

const router = express.Router();

router.use(authMiddleware);

function generateOrderNo() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = uuidv4().slice(0, 5).toUpperCase();
  return `ORD-${dateStr}-${random}`;
}

/**
 * @openapi
 * components:
 *   schemas:
 *     OrderShipping:
 *       type: object
 *       description: 訂單的金額與運費明細（下單當下的快照）。total_amount = subtotal_amount + shipping_fee。
 *       properties:
 *         subtotal_amount:
 *           type: integer
 *           description: 商品小計（Σ 單價 × 數量）
 *         shipping_method:
 *           type: string
 *           nullable: true
 *           enum: [home_delivery, convenience_store]
 *           description: 配送方式；運費功能上線前的舊訂單為 null
 *         base_shipping_fee:
 *           type: integer
 *           description: 基本運費（宅配 120，商品小計滿 1500 為 0；超商取貨固定 60）
 *         remote_surcharge:
 *           type: integer
 *           description: 偏遠地區加收（200 或 0）
 *         urgent_surcharge:
 *           type: integer
 *           description: 當日急件加收（250 或 0）
 *         shipping_fee:
 *           type: integer
 *           description: 運費合計 = 基本運費 + 偏遠地區 + 當日急件
 *         total_amount:
 *           type: integer
 *           description: 訂單總額 = 商品小計 + 運費合計（綠界付款金額）
 *
 * /api/orders:
 *   post:
 *     summary: 從購物車建立訂單（後端計算運費）
 *     description: |
 *       運費由後端 `src/utils/shipping.js` 計算，不接受用戶端傳入的金額。
 *       宅配 120（商品小計滿 1500 免基本運費）、超商取貨 60（不適用免運）；偏遠地區 +200、當日急件 +250，適用所有配送方式且可疊加。
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recipientName, recipientEmail, recipientAddress]
 *             properties:
 *               recipientName:
 *                 type: string
 *               recipientEmail:
 *                 type: string
 *                 format: email
 *               recipientAddress:
 *                 type: string
 *                 description: 收件地址；超商取貨時填取貨門市名稱與地址
 *               shippingMethod:
 *                 type: string
 *                 enum: [home_delivery, convenience_store]
 *                 default: home_delivery
 *               isRemoteArea:
 *                 type: boolean
 *                 default: false
 *                 description: 偏遠地區（使用者自行勾選）
 *               isUrgent:
 *                 type: boolean
 *                 default: false
 *                 description: 當日急件
 *     responses:
 *       201:
 *         description: 訂單建立成功
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
 *                         id:
 *                           type: string
 *                         order_no:
 *                           type: string
 *                         status:
 *                           type: string
 *                         items:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               product_name:
 *                                 type: string
 *                               product_price:
 *                                 type: integer
 *                               quantity:
 *                                 type: integer
 *                         created_at:
 *                           type: string
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       400:
 *         description: 收件資訊缺失、Email 或配送選項格式錯誤（VALIDATION_ERROR）、購物車為空（CART_EMPTY）、庫存不足（STOCK_INSUFFICIENT）
 *       401:
 *         description: 未登入
 */
router.post('/', (req, res) => {
  const { recipientName, recipientEmail, recipientAddress } = req.body || {};
  const userId = req.user.userId;

  if (!recipientName || !recipientEmail || !recipientAddress) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: '收件人姓名、Email 和地址為必填欄位'
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(recipientEmail)) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: 'Email 格式不正確'
    });
  }

  const shippingOptions = validateShippingOptions(req.body);
  if (shippingOptions.error) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: shippingOptions.error
    });
  }

  // Get cart items with product info
  const cartItems = db.prepare(
    `SELECT ci.id, ci.product_id, ci.quantity,
            p.name as product_name, p.price as product_price, p.stock as product_stock
     FROM cart_items ci
     JOIN products p ON ci.product_id = p.id
     WHERE ci.user_id = ?`
  ).all(userId);

  if (cartItems.length === 0) {
    return res.status(400).json({
      data: null,
      error: 'CART_EMPTY',
      message: '購物車為空'
    });
  }

  // Check stock
  const insufficientItems = cartItems.filter(item => item.quantity > item.product_stock);
  if (insufficientItems.length > 0) {
    const names = insufficientItems.map(i => i.product_name).join(', ');
    return res.status(400).json({
      data: null,
      error: 'STOCK_INSUFFICIENT',
      message: `以下商品庫存不足：${names}`
    });
  }

  // 金額一律由後端計算：商品小計 + 運費（Shipping 模組）
  const subtotalAmount = cartItems.reduce(
    (sum, item) => sum + item.product_price * item.quantity, 0
  );
  const shipping = calculateShipping({ subtotal: subtotalAmount, ...shippingOptions.value });
  const totalAmount = subtotalAmount + shipping.shipping_fee;

  const orderId = uuidv4();
  const orderNo = generateOrderNo();

  // Transaction: create order, order items, deduct stock, clear cart
  const createOrder = db.transaction(() => {
    db.prepare(
      `INSERT INTO orders (id, order_no, user_id, recipient_name, recipient_email, recipient_address,
                           subtotal_amount, shipping_method, base_shipping_fee, remote_surcharge, urgent_surcharge,
                           shipping_fee, total_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      orderId, orderNo, userId, recipientName, recipientEmail, recipientAddress,
      subtotalAmount, shipping.shipping_method, shipping.base_shipping_fee, shipping.remote_surcharge,
      shipping.urgent_surcharge, shipping.shipping_fee, totalAmount
    );

    const insertItem = db.prepare(
      `INSERT INTO order_items (id, order_id, product_id, product_name, product_price, quantity)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

    for (const item of cartItems) {
      insertItem.run(uuidv4(), orderId, item.product_id, item.product_name, item.product_price, item.quantity);
      updateStock.run(item.quantity, item.product_id);
    }

    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
  });

  createOrder();

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const orderItems = db.prepare(
    'SELECT product_name, product_price, quantity FROM order_items WHERE order_id = ?'
  ).all(orderId);

  res.status(201).json({
    data: {
      id: order.id,
      order_no: order.order_no,
      subtotal_amount: order.subtotal_amount,
      shipping_method: order.shipping_method,
      base_shipping_fee: order.base_shipping_fee,
      remote_surcharge: order.remote_surcharge,
      urgent_surcharge: order.urgent_surcharge,
      shipping_fee: order.shipping_fee,
      total_amount: order.total_amount,
      status: order.status,
      items: orderItems,
      created_at: order.created_at
    },
    error: null,
    message: '訂單建立成功'
  });
});

/**
 * @openapi
 * /api/orders:
 *   get:
 *     summary: 自己的訂單列表
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     orders:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           order_no:
 *                             type: string
 *                           total_amount:
 *                             type: integer
 *                           status:
 *                             type: string
 *                           created_at:
 *                             type: string
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 */
router.get('/', (req, res) => {
  const orders = db.prepare(
    'SELECT id, order_no, total_amount, status, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.userId);

  res.json({
    data: { orders },
    error: null,
    message: '成功'
  });
});

/**
 * @openapi
 * /api/orders/{id}:
 *   get:
 *     summary: 訂單詳情
 *     tags: [Orders]
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
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     order_no:
 *                       type: string
 *                     recipient_name:
 *                       type: string
 *                     recipient_email:
 *                       type: string
 *                     recipient_address:
 *                       type: string
 *                     subtotal_amount:
 *                       type: integer
 *                     shipping_method:
 *                       type: string
 *                       nullable: true
 *                       enum: [home_delivery, convenience_store]
 *                     base_shipping_fee:
 *                       type: integer
 *                     remote_surcharge:
 *                       type: integer
 *                     urgent_surcharge:
 *                       type: integer
 *                     shipping_fee:
 *                       type: integer
 *                     total_amount:
 *                       type: integer
 *                       description: subtotal_amount + shipping_fee
 *                     status:
 *                       type: string
 *                     created_at:
 *                       type: string
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           product_id:
 *                             type: string
 *                           product_name:
 *                             type: string
 *                           product_price:
 *                             type: integer
 *                           quantity:
 *                             type: integer
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       404:
 *         description: 訂單不存在
 */
router.get('/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);

  if (!order) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '訂單不存在' });
  }

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);

  res.json({
    data: { ...order, items },
    error: null,
    message: '成功'
  });
});

module.exports = router;
