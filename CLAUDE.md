# Project Instructions

This project uses global Superpowers and Skills from `~/.claude/`.

See `~/.claude/CLAUDE.md` for available skills and usage.

## Deployment (Oracle Cloud)

Bot is hosted on Oracle Cloud. Use these commands to manage:

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

コード変更後はSSH接続して `pm2 restart discord-bot` で反映。
