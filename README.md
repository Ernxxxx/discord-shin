# Shin Discord Bot

Node.js 24.22.1 / discord.jsで動くDiscord Botです。

## 起動

`.nvmrc`のNode.jsを用意し、`npm ci`で依存を導入します。Discordトークン等はサーバー上の`.env`に設定し、`npm start`で起動します。

## 主な機能

- `!b` / `!防衛軍` / `!boueigun`: 防衛軍の現在・次の兵団。公式の33時間周期と冥黒の悪夢兵団に対応。
- 公式広場のニュース・トピックス転送、リマインダー、ネタ系コマンド。
- 旧チームイベントの自動処理は`TEAM_EVENT_LAST_AUTOMATED_WEEKEND_KEY`までが対象です。既定値は2026-04-04で、現在の本番設定を維持しています。月次の日程アンケートは別の`discord_schedule_bot`が担当します。

## 検証

`scripts/test-*.js`をNode.jsで実行します。防衛軍コマンドの確認は仮クライアントを使い、Discordへの接続・投稿は行いません。

## 配備とデータ

通常はmainへのpushで既存のGitHub ActionsがOracle Cloudへ配備します。`.env`、リマインダー、投票・配信状態、ローカルの引き継ぎ記録はGit管理から除外します。

2026-10-22の同期では、稼働中の本番コードを基準に未保存の停止条件と補助モジュールを反映しました。内容が同じコードの改行・JSON整形を統一し、再起動やDiscordへの投稿を避けるため`[skip ci]`で保存しています。

古い単発投稿スクリプトと未使用のカレンダー生成スクリプトは、本番アプリの外の`/home/ubuntu/shin-sync-20261022/legacy`へ退避しました。通常の起動・テスト・配備では実行しません。
