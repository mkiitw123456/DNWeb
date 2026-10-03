# DNWeb

繁體中文公會管理網站，提供角色資訊、交易所、結算與管理後台。React + Vite 前端，Node API；本機使用 JSON，Vercel 使用 Firebase Firestore。

## 本機啟動

需要 Node.js 22.12 以上（本機已使用 Node 24 驗證）。

```powershell
cd F:\DNWeb
npm install
# 目前這台電腦的 .env 已建立；新電腦才需要複製：
# Copy-Item .env.example .env
npm run dev
```

開啟 http://127.0.0.1:5173 。初始管理員名稱是 `Wolf`，初始密碼取自 `.env` 的 `INITIAL_ADMIN_PASSWORD`。本機已設定為需求指定的密碼；密碼與服務帳戶不會提交 Git。

本機資料存放 `.local/state.json`，重新啟動不會消失。備份請在停止伺服器後複製 `.local`。本機 JSON 僅支援單一伺服器程序；正式部署必須使用 Firebase，Vercel 未設定 Firebase 時會明確回報錯誤。

## 操作

- 管理後台：建立／編輯成員帳號、重設密碼、停用帳號、設定 Discord ID、新增／修改／刪除副本與每週上限。職業清單可自訂職業名稱與外框顏色（調色盤或十六進位色碼）；修改後所有對應角色同步更新。刪除職業會把對應角色改為未設定職業，不刪除角色。
- 角色資訊：依成員分欄，每欄顯示緊湊角色卡。上方可複選成員、只看自己、全選或全不選。所有登入成員可以查看其他人的角色，只有本人與管理員可編輯。新增／編輯時可選擇職業，角色卡使用該職業的外框顏色。可修改名稱、血量、疲勞值、攻擊力；副本次數輸入後按 Enter 或離開欄位儲存。
- 交易所：新增物品、售價、額外成本、成本備註（最多 300 字）、參與者與交易稅開關。建立者與管理員可以編輯、刪除待售品及確認售出。成本備註會一併保存到結算與歷史紀錄。
- 結算：每位使用者可確認自己的領取；管理員可代領或撤銷領取。已領取名字變綠，全部領取後自動移到歷史紀錄。管理員可編輯／刪除結算；修改金額前需撤銷所有領取。
- 停用成員後保留角色與歷史分帳，不會破壞既有紀錄。
- 交易所與結算各自提供「與我有關／所有人」切換，預設與我有關，包含自己建立或參與分帳的交易。結算篩選同時適用待領取與歷史紀錄，數量依篩選更新。篩選不會擴大編輯或領取權限。
- 既有資料會自動相容新欄位：未設定職業的角色顯示中性色外框，未填備註的舊交易正常顯示。

### 重置與金額

使用台灣時間（Asia/Taipei）：每日 09:00 疲勞恢復 700；週六 09:00 清空所有角色副本次數。伺服器每次讀取／操作先檢查時間，前端每 30 秒及視窗重新取得焦點時更新。不需要付費排程，無人在線也會在下次讀取時補算，並非必須在 09:00 有人打開網站。

金額採整數金幣。交易稅 = 售價的 10%，無條件捨去至整數（可關閉）。可分配金額 = 售價 − 稅 − 額外成本，依參與者平均分配，餘數依選取順序每人多 1 金幣。例如售價 1,001、成本 100、開稅、2 人：稅 100，可分 801，分別領 401 和 400。伺服器重新計算，不信任前端試算。

## Firebase + Vercel 部署

1. 在 Firebase Console 建立專案，建立 **Cloud Firestore Standard / Native mode** 資料庫（預設資料庫）。
2. 將 `firestore.rules` 貼到 Firestore 規則並發布。瀏覽器不直接連接資料庫；讀寫由伺服器 Admin SDK 執行，故規則禁止所有客戶端直接存取。
3. Firebase「專案設定 → 服務帳戶 → 產生新的私密金鑰」，將完整 JSON 放到 Vercel 的 **環境變數** `FIREBASE_SERVICE_ACCOUNT_JSON`，不要放進 Git 或任何 `VITE_` 變數。
4. Vercel 匯入此 Git 儲存庫，Framework 選 Vite，Build `npm run build`，Output `dist`，Node 24。
5. 在 Vercel 設定以下伺服器環境變數後部署：

| 變數                            | 用途                                                           |
| ------------------------------- | -------------------------------------------------------------- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase 服務帳戶完整 JSON                                     |
| `INITIAL_ADMIN_PASSWORD`        | 首次初始化 Wolf 的密碼，填需求指定值；既有帳號不會被此變數覆蓋 |
| `SESSION_SECRET`                | 長隨機字串，用於簽署登入 Cookie                                |
| `DISCORD_WEBHOOK_URL`           | 選填，也可以登入管理後台再填                                   |

產生 Session Secret：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`api/app.js` 是 Vercel Node Function，前端透過同網域 `/api/app` 存取。修改環境變數後需重新部署。Preview 部署建議使用獨立 Firebase 測試專案，避免修改正式資料。

本機資料不會自動搬進 Firebase，首次部署會建立新的 Wolf 帳號、預設副本與空白資料清單。

### 儲存規模

此版本以小型公會為目標，使用 `dnweb/state` 單一 Firestore 文件與交易保持售出／領取一致性，避免重複結算。Firestore 單文件有 1 MiB 上限；成員、角色或長期交易歷史大量增加前，應改成分集合儲存及歷史分頁。前端每 30 秒同步一次，非即時推播。

## Discord

管理後台 → Discord 通知，貼上 Webhook URL。管理員再為各帳號填入 Discord 使用者 ID（17–20 位數字）。物品賣出後會標記成員、列出金額與結算編號；未填 ID 的成員只顯示名稱。`allowed_mentions` 限制只標記指定使用者。

售出會先可靠保存結算，再發送通知。通知失敗不會回滾交易，卡片顯示失敗並可重試；未設定 URL 時顯示未設定。成功紀錄不重送。若 Discord 已收到但回應中斷，手動重試可能產生重複通知，可用結算編號辨識。沒有背景通知工作程序，失敗後需手動重試。

## 驗證

```powershell
npm test
npm run build
npm audit
```

測試包含台灣時間的每日／週六界線、跨週補算、分帳餘數、權限、重複售出、同時領取、歷史歸檔、密碼變更後工作階段失效、跨站操作阻擋及 Discord 模擬成功／失敗／重試。API 測試會在 5174 啟動隔離本機伺服器，使用獨立暫存資料。

已用內建瀏覽器及 Playwright + Edge 驗證 1536×1024、390×844。Firebase 雲端與 Discord 真實投遞需實際憑證後驗證。

密碼經 scrypt 雜湊，登入使用 HttpOnly Cookie；帳號流程沒有電子郵件驗證、忘記密碼或複雜密碼政策，由管理員統一管理。

## 官方參考

- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
- [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js)
