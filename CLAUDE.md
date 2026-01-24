# Project Instructions

This project uses global Superpowers and Skills from `~/.claude/`.

See `~/.claude/CLAUDE.md` for available skills and usage.

## Deployment (Oracle Cloud + GitHub Actions)

Bot is hosted on Oracle Cloud. GitHub Actionsによる自動デプロイ設定済み。

### 通常のデプロイ（自動）

コード変更後は `git push origin main` するだけで自動デプロイ＆再起動される（約1分）。

### 手動管理（SSHが必要な場合）

.envの変更やトラブルシューティング時のみ使用:

```bash
# SSHで接続
ssh -i "C:\Users\longs\Downloads\ssh-key-2026-01-23.key" ubuntu@141.147.184.121

# 状態確認
pm2 status

# ログ確認
pm2 logs discord-bot

# 再起動
pm2 restart discord-bot
```

### 注意事項
- `.env` はGitHubにプッシュされない。新しい環境変数はSSHで直接編集が必要
- デプロイ失敗時はGitHubの「Actions」タブでログ確認
