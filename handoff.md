# Handoff - discord_shin

更新: 2026-02-26 13:46:39

## 今回やったこと
- チームイベント可用日機能を「月〜日ボタンの複数選択」方式に変更（`index.js`）
  - 可用日パネルを `◀/▶ + 時刻` から `月〜日(7日)日付ボタン` に置換
  - ボタンラベルに日別集計人数を表示
  - クリックで日付をトグル登録（複数選択可）
- 候補ロジックを日別集計ベースへ変更（`index.js`）
  - 対象週を「イベント週の月〜日」に固定
  - 可用日集計の上位2日を第1/第2候補として自動選定
  - 時刻は固定 `21:00`（`TEAM_EVENT_FIXED_TIME`）
  - 候補人数（第1/第2）は可用日登録人数から自動反映
- 提案UI/文言を新方式へ調整（`index.js`）
  - 提案メッセージの候補欄を「可用日集計」表示に変更
  - 可用日パネル本文/Embedに「21:00固定」「月〜日複数選択」を明示
  - `!te status` / `!te avail` ヘルプ文言を日付ベースに変更
- コマンドの手動登録形式を日付中心へ変更（`index.js`）
  - `!te avail add YYYY-MM-DD`
  - `!te avail remove YYYY-MM-DD`
  - 時刻指定が来ても `21:00` 以外は拒否
- 既存提案との整合対応（`index.js`）
  - `runTeamEventMaintenance` 内で未確定提案を定期再計算し、候補/人数表示を自動同期
  - 旧「候補日手動投票」ボタンは無効化（可用日パネル利用を案内）
- 本番反映を再実施（可用日パネル自動送信入りコード）
  - `tmpfiles` に `index_upload.txt` をアップロードし、ダウンロードハッシュがローカルと一致することを確認
  - 本番 `/home/ubuntu/discord-bot/index.js` を更新
  - 本番で `node --check index.js` 成功
  - `pm2 restart discord-bot --update-env` 実行、`pm2 status` で `online` を確認（pid `567969`, restart `114`）
  - 本番 `index.js` で `maybePostTeamEventProposal` 内の `sendTeamEventAvailabilityPanel(...)` 呼び出しを確認

## 現在の状態
- ローカル `node --check index.js` は成功
- 本番 `node --check /home/ubuntu/discord-bot/index.js` は成功
- 本番 `discord-bot` は `online`（PM2）
- 未コミット変更あり: `index.js`, `handoff.md`

## 残りのタスク
- [ ] Discordで可用日パネルが「月〜日ボタン+人数表示」になっていることを確認
- [ ] 複数人で日付ボタンを押し、上位2日が候補へ反映されることを確認
- [ ] すでに投稿済みの現行提案に可用日パネルが必要な場合は `!te panel` を実行

## 注意点
- WindowsのOpenSSHで known_hosts 未登録時、SSHが待機してタイムアウトすることがある。`StrictHostKeyChecking=accept-new` で一度登録してから実行すると安定
- SSH長時間転送が切れやすく、`scp` は失敗しやすい。緊急時は一時URL経由の更新が有効
- `pm2 logs` の error には過去の `SyntaxError` 行が残るため、現行状態は `pm2 status` の `online` と最新 `out.log` を併せて確認すること
- 文字化け確認時は `Get-Content -Encoding UTF8` を使うこと

## 関連ファイル
- `C:\Users\longs\Projects\tools\discord_shin\index.js`
- `C:\Users\longs\Projects\tools\discord_shin\handoff.md`
- `/home/ubuntu/discord-bot/index.js`
