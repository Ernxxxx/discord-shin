# Handoff - discord_shin

更新: 2026-02-26 11:07:51

## 今回やったこと
- 本番 `.env` のチームイベント投票期限を変更
  - `TEAM_EVENT_TALLY_DELAY_HOURS=48`
- 前回変更の確認
  - `TEAM_EVENT_LEAD_DAYS=10`
- 本番再起動を実施
  - `pm2 restart discord-bot --update-env`

## 現在の状態
- 本番 `discord-bot` は `online`（restart 51）
- チームイベント主要設定
  - `TEAM_EVENT_LEAD_DAYS=10`
  - `TEAM_EVENT_TALLY_DELAY_HOURS=48`
  - `TEAM_EVENT_REMINDER_DAYS_BEFORE=3`
  - `TEAM_EVENT_REMINDER_HOURS_BEFORE=2`

## 残りのタスク
- [ ] 次回提案で投票期限が48時間で動作することを実機確認

## 注意点
- `.env` 変更は再起動しないと反映されない

## 関連ファイル
- `/home/ubuntu/discord-bot/.env`
- `C:\Users\longs\Projects\tools\discord_shin\handoff.md`
