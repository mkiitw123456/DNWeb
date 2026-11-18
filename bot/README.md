# DDStar 語音時間觀察

此服務只記錄語音時間，不發積分，不錄音、不讀聊天訊息。

## 本機設定

在專案根目錄 `.env` 填入既有 Bot 的 `DISCORD_BOT_TOKEN`、`DISCORD_GUILD_ID`，以及 `DDSTAR_SITE_URL=https://dn-web-roan.vercel.app`。
正式網站必須部署包含 `/api/voice-ingest` 的版本，且 Vercel 已設定相同 Token 與伺服器 ID。不要將 `.env` 提交到 Git。

使用 Node.js 22.12 或更新版，在專案執行 `npm install`，再執行 `npm run bot:voice`。按 Ctrl+C 停止。
背景啟動可執行 `powershell -File D:\DNWeb\bot\start-voice.ps1`，日誌在 `.local/voice-worker.log` 與 `.local/voice-worker-error.log`。此腳本不設定開機自動啟動。
同一時間只能執行一份 Bot；請先停止舊程序再重啟。

Bot 要已加入指定伺服器，並能查看要統計的語音頻道。程式訂閱 Guilds 與 GuildVoiceStates，不需要加入語音、不需要錄音權限，也不需要 Message Content Intent。既有暱稱搜尋所使用的 Server Members Intent 可以保留。

## 如何驗證

網站管理後台 → 語音統計。兩位非 Bot 成員加入同一個非 AFK 語音頻道，等待約 30 秒後重新整理，確認時間增加。只剩一人、轉到 AFK、Bot 斷線時不應增加。當天以台灣時間 09:00 為界，累積時間不歸零。

若 HTTP 401：核對本機與 Vercel 的 Bot Token，及電腦時間。若 HTTP 403：核對伺服器 ID。若 HTTP 404：網站尚未部署本版。Token 更新後須同時更新兩端。

## 計時與資料量

每 30 秒及語音狀態變更時回報快照，HMAC 簽章驗證來源，Token 不放在瀏覽器或傳送內容中。連續序號、伺服器時間與 90 秒間隔上限避免重送、休眠或斷線補算。
斷線重連會重新開始觀察，不補算離線區段；最後未同步的片段可能遺失。此為活躍度觀察，並非逐秒出勤系統。
Firebase 僅保存最近 30 個統計日、總時間與最近快照，不逐秒產生歷史紀錄；最多統計 500 位成員、單次 500 位語音成員。主機必須維持開機及網路連線。

