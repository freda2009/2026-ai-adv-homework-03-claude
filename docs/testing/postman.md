# Postman Collection

執行 `npm run postman`：先 `npm run openapi` 依 `src/routes/*.js` 的 `@openapi` 註解產生最新的 `openapi.json`（已 `.gitignore`），再由 `scripts/generate-postman.js` 以 `openapi-to-postmanv2` 轉成 `postman/flower-life.postman_collection.json`。`postman/` 已列入 `.gitignore`，**不提交**；clone 後或路由變更後請自行執行一次。

## 匯入後的使用方式
1. Postman → Import → 選 `postman/flower-life.postman_collection.json`。
2. 視需要修改 collection 變數 `baseUrl`（預設 `http://localhost:3001`）。
3. 執行 Auth →「登入」（預設 body 為 README 記載的開發用管理員）或「註冊」（`{{$randomEmail}}`）；成功後 test script 會把 `data.token` 存進 collection 變數 `token`。
4. 之後需要登入的請求會自動帶 `Authorization: Bearer {{token}}`。

## 產生規則
| 項目 | 內容 |
|------|------|
| 變數 | `baseUrl`（`http://localhost:3001`）、`token`（空）、`sessionId`（空，第一次送出時由 collection pre-request script 以 `{{$guid}}` 產生並保存） |
| 驗證 | collection 層級 Bearer `{{token}}`；OpenAPI 有 `bearerAuth` 的請求繼承，公開端點（商品、運費試算、登入、註冊）設 `noauth` |
| 訪客購物車 | 購物車與登入／註冊帶 `X-Session-Id: {{sessionId}}`；`token` 空白時 Postman 不送 Authorization，後端以 session 當訪客購物車 |
| 範例 | 登入、註冊、建立訂單有可直接送出的 body；運費試算 `subtotal=1000`；其他欄位保留 `<string>` 等佔位符，仍是佔位符的選填查詢參數預設停用 |
| 穩定輸出 | 移除隨機 id 與 converter 以亂數產生的範例回應，重複執行內容相同、方便 diff |
| 驗證 | 輸出前以 `JSON.parse` 與 Postman 官方 SDK（`postman-collection`）載入，並檢查沒有未定義的 `{{變數}}` |

## 維護
- 新增或修改路由（含 `@openapi` 註解）後，重新執行 `npm run postman` 再匯入 Postman。`test/unit/postmanCollection.test.js` 直接由目前路由在記憶體產生 collection 並檢查（不讀 `postman/` 下的檔案），所以沒有這個檔案也能通過。
- collection 由程式產生，請勿在 Postman 內修改後匯出覆蓋；要調整規則請改 `scripts/generate-postman.js`。
