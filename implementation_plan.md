# 實作計畫：全線上自動化千張大戶歷史資料庫 (TDCC History DB)

為了解決免費 API 無法取得「千張大戶持股」歷史資料的問題，我們將建立一套全線上（Cloud-native / Serverless）的自動化收集機制，從今天起每週自動累積 TDCC 最新資料，並繪製成歷史走勢圖。

## User Review Required

> [!IMPORTANT]
> 為了讓資料能夠「全線上、跨伺服器持久化儲存」，我們需要一個雲端資料庫。由於您的專案是部署在 Vercel 上的 Serverless 架構，伺服器本身不會保留硬碟檔案，因此請您在下方【Open Questions】選擇一個您偏好的免費雲端資料庫方案。

## Open Questions

> [!WARNING]
> 請您決定要使用哪一種雲端儲存方案？
> 
> **選項 1：Supabase (PostgreSQL) - 推薦 ⭐**
> - 優點：關聯式資料庫非常適合儲存時間序列資料，免費額度高，查詢速度極快。
> - 您需要準備：註冊 Supabase，建立一個專案，並提供 `SUPABASE_URL` 與 `SUPABASE_ANON_KEY`。
> 
> **選項 2：Vercel KV (Redis)**
> - 優點：與 Vercel 深度整合，無需離開 Vercel 控制台即可一鍵開啟。
> - 您需要準備：在 Vercel 專案的 Storage 中開啟 KV，取得 `KV_REST_API_URL` 與 `KV_REST_API_TOKEN`。
> 
> **選項 3：Firebase Firestore**
> - 優點：NoSQL 文件資料庫，Google 體系。
> - 您需要準備：Firebase 專案的 Server Credentials JSON。
> 
> **請告訴我您想選哪一個？若您選擇了，請直接將對應的環境變數貼給我就能立刻開始串接！**

## Proposed Changes

### 1. 雲端資料庫連線層
#### [NEW] `api/_lib/db.js`
- 建立連線到您選擇的雲端資料庫（Supabase / Vercel KV / Firebase）的共用模組。

### 2. Vercel Cron Job 定時任務
#### [NEW] `api/cron/tdcc-sync.js`
- 寫一支供 Vercel Cron 排程呼叫的 API。
- 設定每週五晚上（或週六凌晨）自動觸發。
- 運作邏輯：
  1. 去 `https://smart.tdcc.com.tw/opendata/getOD.ashx?id=1-5` 下載最新全市場 CSV。
  2. 解析全市場約 1800 檔股票的「等級 15（千張大戶）」比例與日期。
  3. 將結果批次寫入雲端資料庫中。

### 3. 提供前端使用的歷史 API
#### [NEW] `api/tdcc_history.js`
- 接收 `symbol` 參數（如 2330）。
- 去雲端資料庫撈出該股票所有已累積的歷史日期與大戶比例，回傳 JSON。

### 4. 前端圖表串接與更新
#### [MODIFY] `src/drawer.js`
- 呼叫新的 `/api/tdcc_history`，並將取得的歷史資料與 K 線時間軸對齊。
- 把原本用「外資持股比」代打的圖表，正式切換回畫**真實的「千張大戶持股比例歷史趨勢」**。

## Verification Plan

### 自動化機制測試
- 我會在本地端手動觸發一次 `cron/tdcc-sync.js`，模擬排程抓取並寫入資料庫。
- 檢查資料庫是否成功存入當週（例如 2026-07-24）的全市場大戶比例。

### 圖表渲染驗證
- 打開前端面板，點擊「大戶持股」標籤。
- 確認圖表線條是否正確畫出資料庫中取出的數值，且與 K 線對齊。
