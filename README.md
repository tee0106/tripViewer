# tripViewer

把 Google 試算表裡的行程，變成手機上好讀的時間軸卡片。

每人用 Gmail 登入後，只看得到自己建立的方案。兩個人貼同一個試算表連結，會各自有一份，置頂和置底不會互相影響。

<p align="center">
<img width="256" height="521" alt="Screenshot_2026-11-20-02-19-58-073_com android chrome-edit" src="https://github.com/user-attachments/assets/26215e21-af7d-42f1-b180-e034f8e58ae9" />
</p>

## 試算表怎麼排

只讀**第一個工作表**，**第一列是欄位名稱**。連結若指到第二個分頁，仍會讀第一個。

| 日期 | 時間 | 地點 | 事件 | 備註 | 費用 |
| --- | --- | --- | --- | --- | --- |
| 11/20 | 08:30 | 京都車站 | 集合 | | |
| | 09:30 | 清水寺 | 參觀 | 官網 https://www.kiyomizudera.or.jp/ | |
| | | | | 這列不會出現 | |
| | 12:30 | | 午餐 | 自行解決 | 500 |

- 日期空著，代表還是上一個日期。
- 有「地點」或「事件」這一類欄位時，兩格都空著的列不會變成卡片。
- 某一格是空的，卡片上就不顯示那個欄位名稱。日期用來分組，不在卡片裡重複一行空白日期。
- 備註裡的網址會變成可點的連結。
- 欄位名稱不固定。地點類欄位（地點、景點、地址、location…）會出現地圖按鈕；事件欄裡若像地名（例如「千本鳥居」）也會出現。午餐、集合、純時間、金額、備註不會出現地圖按鈕。
- 卡片順序依照試算表由上到下，不依時間欄重新排序。

登入的 Google 帳號必須打得開這張表（擁有者、編輯者或檢視者）。若表單設成「知道連結的任何人可檢視」，也可以。

## 1. 建立 Firebase

1. 打開 [Firebase 主控台](https://console.firebase.google.com/) 並用你的 Gmail 登入。
2. 新增專案，名稱可取 `tripViewer`。Analytics 可關閉。
3. 左側 **Build → Authentication → 開始使用**。
4. 選擇 **Google**，啟用，支援電子郵件選你的 Gmail，儲存。
5. 左側 **Build → Firestore Database → 建立資料庫**。
6. 選**正式模式**。地區選 **asia-east1（台灣）**。地區之後不能改。
7. 到 **規則** 分頁，把專案裡 `firestore.rules` 的內容全部貼上，按**發布**。

正式模式預設會拒絕所有讀寫。沒貼上規則的話，登入後無法儲存方案。

## 2. 複製網頁設定

1. 專案首頁齒輪 **專案設定 → 一般**。
2. **你的應用程式** 選 Web（`</>`），應用程式暱稱填 `tripViewer`，註冊。
3. 複製設定值，在專案根目錄建立 `.env.local`：

```
VITE_FIREBASE_API_KEY=這裡貼 apiKey
VITE_FIREBASE_AUTH_DOMAIN=這裡貼 authDomain
VITE_FIREBASE_PROJECT_ID=這裡貼 projectId
VITE_FIREBASE_APP_ID=這裡貼 appId
```

不要把 `.env.local` 傳到公開的地方。

## 3. 讓登入者可以讀試算表

Google 登入預設讀不到私人試算表，還要開 Sheets API，並把使用者加進測試名單。

1. 打開 [Google Cloud 主控台](https://console.cloud.google.com/)，右上角專案選剛剛的 Firebase 專案（名稱相同）。
2. 搜尋並啟用 **Google Sheets API**。
3. 打開 **Google Auth platform**（舊名稱是「OAuth 同意畫面」）。
4. User type 選 **External**。應用程式名稱 `tripViewer`，使用者支援電子郵件和開發人員聯絡信箱都填你的 Gmail。
5. 在 **Data Access / 範圍** 新增這個範圍，原本的 email、profile、openid 不要刪：

   `https://www.googleapis.com/auth/spreadsheets.readonly`

6. **Audience / 測試使用者** 加上每一個會登入的 Gmail。
7. 發布狀態維持 **Testing**。不要按發布到正式環境。這個範圍屬於敏感權限，正式公開要經過 Google 審核；個人和親友用測試模式即可。沒被加進測試使用者的帳號會登入失敗。

測試模式下，過一陣子要重新同意權限。這個網站不把 Google 權杖存進資料庫。Firebase 登入會記住，但按「重新整理」讀試算表時，若權限過期，會再跳出 Google 視窗。

## 4. 在自己的電腦看網站

需要已安裝 Node.js 20 以上。

```
cd c:\aProject\tripViewer
npm install
npm run dev
```

瀏覽器打開終端機顯示的 `http://127.0.0.1:5173`。還沒填 `.env.local` 時，可以按「先看範例」。

## 5. 部署到 Cloudflare Pages

金鑰在 `npm run build` 時寫進靜態檔，所以先確認 `.env.local` 已填好，再打包上傳。Cloudflare 上不用再貼一次金鑰。

```
npm run build
```

1. 打開 [Cloudflare 儀表板](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **Upload assets**（直接上傳）。
2. 專案名稱例如 `tripviewer`。
3. 上傳 `dist` 資料夾裡的**內容**（包含 `index.html` 和 `assets`），不要把整個外層空資料夾傳錯。
4. 部署完成後會得到類似 `https://tripviewer.pages.dev` 的網址。
5. 回到 Firebase → **Authentication → Settings → Authorized domains**，新增這個網域，只填網域，不要加 `https://`。例如 `tripviewer.pages.dev`。
6. 用手機打開該網址，用有權限的 Gmail 登入。

之後若改過程式或 `.env.local`，在自己的電腦重新 `npm run build`，再到 Cloudflare 該專案建立新的部署並上傳新的 `dist`。若畫面還是舊的，按 Ctrl+F5。

`localhost` 已在 Firebase 授權網域裡。線上登入失敗、本地成功，多半是漏了第 5 步。

## 6. 平常怎麼用

1. 用 Gmail 登入。
2. **新增方案**，填這趟旅行的標題和日期（用來在列表分類），貼上試算表連結。
3. 到 Google 試算表改行程，回到網站按 **重新整理**。不要在網站裡改每一格內容。
4. **最上 / 最下** 只調整你自己畫面上、那一天裡面的位置，不會寫回試算表。**恢復** 回到試算表原來的相對順序。
5. 搜尋會比對這個方案裡每個欄位的文字。
6. **深色** 和 **中 / EN** 存在這台瀏覽器，不會寫進資料庫。
7. 右上角可登出。刪除方案不會刪除試算表。

## 遇到問題

| 畫面上的意思 | 怎麼處理 |
| --- | --- |
| 沒有這張試算表的權限 | 用打得開該表的 Google 帳號登入，或請擁有者分享 |
| 還沒啟用 Google Sheets API | 回到 Cloud 主控台啟用 Sheets API，等一兩分鐘再試 |
| Firestore 規則還沒放開 | 把 `firestore.rules` 貼到 Firestore 規則並發布 |
| 登入視窗被擋住 | 允許這個網站的彈出視窗 |
| 這個應用程式未獲驗證 | 確認該 Gmail 已加在 OAuth 測試使用者，且同意畫面仍是 Testing |
| 線上網站無法登入 | 把 `xxx.pages.dev` 加到 Firebase Authorized domains |
| 找不到試算表 | 確認連結裡有 `/spreadsheets/d/那串英文` |
