# iPhone 風格網頁碼錶 — 設計文件

> 建立日期：2026-05-13
> 範圍：`/Users/lizhenyi/www/stopwatch/`

## 1. 目標

製作一個網頁版碼錶，滿足三項核心需求：

1. **視覺與互動** 仿 iPhone 內建「碼錶」App。
2. **跨關閉持續計時**：關掉分頁、整個瀏覽器、甚至重開機後再打開，時間繼續走（不會回到關閉時的點）。
3. **純前端實作**：無後端、無框架、無建構工具。

## 2. 為什麼純前端可行（核心洞察）

碼錶不需要「在背景持續執行」——它本質上是
`現在經過時間 = (Date.now()) − (startedAt) + accumulated`。

只要把 `startedAt` 寫入 `localStorage`，下次頁面開啟時用當下的 `Date.now()`
重新計算即可。即使瀏覽器完全關閉、電腦關機後重開，只要 localStorage
沒被清除，時間都能正確還原。

結論：**Service Worker、Web Worker、後端、定時器持久化一概不需要。**

## 3. 已確認決策

| 項目 | 決定 |
|------|------|
| 功能 | Start/Stop、Lap（含最快/最慢標示）、Reset |
| 顯示精度 | 毫秒（百分秒，`.SS`） |
| 視覺風格 | 深色 OLED：純黑底、白字、綠 Start、紅 Stop、灰 Lap/Reset |
| 視圖 | 僅數位（不做類比錶盤） |
| 技術 | 純 HTML / CSS / JavaScript，無框架、無建構工具 |
| 裝置 | 手機優先，桌面也可用（窗體置中，max-width 約 430px） |

## 4. 檔案結構

```
/Users/lizhenyi/www/stopwatch/
├── docs/
│   └── 2026-05-13-stopwatch-design.md   # 本文件
├── index.html      # 結構：時間顯示、按鈕、Lap 列表
├── style.css       # 深色 OLED 風格、版面、按鈕圓形樣式
└── app.js          # 狀態機、persistence、render loop
```

雙擊 `index.html` 即可開啟，不需要 dev server。

## 5. 狀態模型

localStorage 單一鍵 `stopwatch:v1`，內容為 JSON：

```js
{
  status: "idle" | "running" | "paused",
  startedAt: number | null,    // 本次 running 區段的 Date.now()；paused/idle 為 null
  accumulated: number,         // 先前所有 running 區段累積的毫秒數
  laps: [                      // 每個 lap 記「該圈開始時的累積總時間」
    { index: 1, totalAtLap: 12345 },
    ...
  ]
}
```

**當前經過時間** 計算：

```js
function currentElapsed(state) {
  if (state.status === "running") {
    return state.accumulated + (Date.now() - state.startedAt);
  }
  return state.accumulated;
}
```

**寫入時機**：start / stop / lap / reset 時各寫一次。顯示更新只用
`requestAnimationFrame`，不寫 storage（避免每幀寫盤）。

## 6. 操作流程（對照 iPhone）

| 目前狀態 | 左按鈕 | 右按鈕 |
|---------|--------|--------|
| idle    | 灰 `Lap`（disabled） | 綠 `Start` |
| running | 灰 `Lap`（active）   | 紅 `Stop`  |
| paused  | 灰 `Reset`           | 綠 `Start` |

- idle → running：`startedAt = Date.now()`
- running 按 Lap：新增一筆 lap 至列表（最新在上）
- running → paused：`accumulated += now − startedAt`、`startedAt = null`
- paused → running：再次 `startedAt = Date.now()`
- paused → idle：清空 `accumulated` 與 `laps`

Lap 列顯示三欄：`Lap N | 該圈時間 | 累積時間`。
當 lap 數 ≥ 3，以綠字標最快、紅字標最慢。

## 7. 時間格式

- < 1 小時：`mm:ss.SS`（例：`05:43.21`）
- ≥ 1 小時：`hh:mm:ss.SS`
- 字體：system monospace + `font-variant-numeric: tabular-nums`，避免數字跳動

## 8. 視覺規格（iOS 對照）

- 背景 `#000`，主時間 `#fff`、`font-weight: 200`、極大字級（手機約 88–96px）
- 圓形按鈕 88×88px
  - Start：背景 `rgba(48,209,88,0.18)`、文字 `#30d158`
  - Stop：背景 `rgba(255,69,58,0.18)`、文字 `#ff453a`
  - Lap/Reset：背景 `rgba(142,142,147,0.18)`、文字 `#fff`（disabled 時 `#8e8e93`）
- Lap 列表分隔線 `rgba(255,255,255,0.12)`
- 桌面寬度上限 430px，手機全寬，整體垂直置中於 viewport

## 9. 邊界情況

| 情況 | 行為 |
|------|------|
| 載入時 localStorage 為空 | 視為 idle |
| 載入時 status=running、`startedAt` 為很久以前 | 直接照算（這正是「持續計時」的核心） |
| 系統時鐘被往回調 | 不主動修正；下次 Lap/Stop 即重新校準 |
| 同分頁開兩個視窗 | 監聽 `storage` 事件，跨分頁同步重讀狀態 |
| localStorage 寫入失敗（隱私模式） | catch 並於 console 警告；當前分頁仍可運作，僅無法跨關閉持續 |

## 10. 驗證計畫

1. 開 `index.html`，按 Start → 數字以毫秒精度滾動
2. 計時 5 秒按 Lap → 列表出現第 1 圈；再走 → 第 2 圈出現於最上
3. 累積 3 圈以上 → 最快/最慢分別以綠/紅字標示
4. 按 Stop → 數字凍結，左按鈕變 Reset
5. **持續計時驗證**：按 Start，記下系統時鐘，**完全關閉瀏覽器**，等 30 秒以上重開頁面 → 顯示時間應約等於「離開前時間 + 經過秒數」
6. 同時開兩個分頁 → 一邊按 Stop，另一邊也停（storage 事件同步）
7. 手機/桌面尺寸切換 → 版面置中、按鈕可點

## 11. 非本次範圍（未來可選）

- PWA manifest + Service Worker → 加到主畫面、離線使用
- Lap 時手機震動回饋 `navigator.vibrate(10)`
- 多計時器分頁
