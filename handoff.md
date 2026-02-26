# Handoff - discord_shin

更新: 2026-02-26 10:32:53

## 今回やったこと
- 期間設定の `.env` 化を追加
  - `OFFICIAL_POLL_INTERVAL_MINUTES`
  - `TEAM_EVENT_CHECK_INTERVAL_MINUTES`
  - `TEAM_EVENT_INTERVAL_DAYS`
  - `TEAM_EVENT_TALLY_DELAY_HOURS`
  - `TEAM_EVENT_REMINDER_DAYS_BEFORE`
  - `TEAM_EVENT_REMINDER_HOURS_BEFORE`
  - `TEAM_EVENT_HISTORY_MAX`
  - 変更ファイル: `C:\Users\longs\Projects\tools\discord_shin\index.js`
- 送信先チャンネルをテスト用に固定
  - 本番 `.env` に `OFFICIAL_TARGET_ID=1473565419066495109`
  - 本番 `.env` に `TEAM_EVENT_CHANNEL_ID=1473565419066495109`
- 本番 `index.js` へ反映
  - 大きいファイルの `scp` が接続リセットで不安定だったため、サーバー上で直接パッチ適用
- 本番再起動
  - `pm2 restart discord-bot --update-env`
  - restart count: 48
- テスト投稿送信（指定チャンネルのみ）
  - チャンネル: `1473565419066495109`
  - メッセージID: `1476391508402765885`

## 現在の状態
- 本番 `discord-bot` は `online`
- 期間値は `.env` で変更可能
- テスト中は公式情報/チームイベントともに `1473565419066495109` が送信先
- ローカル構文チェック: `node --check index.js` 成功
- 未コミット変更あり
  - `C:\Users\longs\Projects\tools\discord_shin\index.js`
  - `C:\Users\longs\Projects\tools\discord_shin\handoff.md`
  - `C:\Users\longs\Projects\tools\discord_shin\team_event_state_test.json`（一時）
  - `C:\Users\longs\Projects\tools\discord_shin\remote_patch_index.py`（一時）

## 残りのタスク
- [ ] ボタン挙動と自動確定/リマインドの実機確認
- [ ] テスト終了後、`OFFICIAL_TARGET_ID` を本番値へ戻すか判断
- [ ] 一時ファイル (`team_event_state_test.json`, `remote_patch_index.py`) の整理

## 注意点
- この環境から大きいファイルを `scp` すると接続リセットが起きることがある
- 本番操作はSSH経由（ローカルに `pm2` は無い）

## 関連ファイル
- `C:\Users\longs\Projects\tools\discord_shin\index.js`
- `C:\Users\longs\Projects\tools\discord_shin\handoff.md`
- `C:\Users\longs\Projects\tools\discord_shin\team_event_state_test.json`
- `C:\Users\longs\Projects\tools\discord_shin\remote_patch_index.py`
- `/home/ubuntu/discord-bot/index.js`
- `/home/ubuntu/discord-bot/.env`
