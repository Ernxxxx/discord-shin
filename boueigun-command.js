const fs = require('node:fs');
const path = require('node:path');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { formatJst, jstParts, MAX_FORECAST_DAYS } = require('./boueigun-query');
const HOUR_MS = 3600000;
const SOURCE = 'https://browser.dqx.jp/sc/tokoyami/';
const PREDICTION = '日本時間・現在の33時間周期からの予測。アップデートで変更される場合があります。';

function helpEmbed(message, nowMs) {
    const tomorrow = jstParts((Number.isFinite(nowMs) ? nowMs : Date.now()) + 24 * HOUR_MS);
    const dateExample = `${tomorrow.month}/${tomorrow.day}`;
    const isoExample = `${tomorrow.year}-${String(tomorrow.month).padStart(2, '0')}-${String(tomorrow.day).padStart(2, '0')}`;
    return new EmbedBuilder()
        .setColor(message ? 0xE6A23C : 0x5865F2)
        .setTitle(message ? '日時を確認してください' : '防衛軍の予定の調べ方')
        .setDescription(message || '短縮形・全角・日付と時刻を続けた指定にも対応しています。')
        .addFields(
            { name: '現在・時刻・相対指定', value: '`!b` 現在と次の兵団\n`!b 21:00` / `!b 21時半`\n`!b 午後9時` / `!b 次`\n`!b 3時間後` / `!b あと90分` / `!b 1h30m`' },
            { name: '1日分・日付指定', value: '`!b 今日` / `!b 明日` / `!b 明後日`\n`!b 明日21時` / `!b ' + dateExample + ' 21:30`\n`!b ' + tomorrow.month + '月' + tomorrow.day + '日` / `!b ' + isoExample + ' 21:00`\n`!防衛軍` / `!boueigun`でも同じ指定ができます。' },
            { name: '日時の扱い', value: `すべて日本時間。時刻だけの指定は今日の枠を表示し、その枠が終了済みなら翌日扱いです。日付だけなら24時間分を表示します。今日から${MAX_FORECAST_DAYS}日先まで指定できます。` }
        ).setFooter({ text: PREDICTION });
}

function buildBoueigunReply(request, { root, imageMap, getInfo }) {
    const allowedMentions = { parse: [], repliedUser: false };
    if (request.kind === 'help' || request.kind === 'error') return { embeds: [helpEmbed(request.message, request.nowMs)], allowedMentions };
    if (request.kind === 'day') {
        const lines = Array.from({ length: 24 }, (_, hour) => {
            const at = request.startMs + hour * HOUR_MS;
            return `\`${String(hour).padStart(2, '0')}:00\` ${getInfo(at).current}`;
        });
        const embed = new EmbedBuilder().setColor(0x5865F2)
            .setTitle(`${formatJst(request.startMs, false)}の防衛軍`)
            .setDescription('各時刻から1時間の兵団です。')
            .addFields({ name: '00:00〜11:00', value: lines.slice(0, 12).join('\n'), inline: true }, { name: '12:00〜23:00', value: lines.slice(12).join('\n'), inline: true })
            .setURL(SOURCE).setFooter({ text: PREDICTION });
        return { embeds: [embed], allowedMentions };
    }
    const current = request.kind === 'current';
    const info = getInfo(request.atMs);
    const start = Math.floor(request.atMs / HOUR_MS) * HOUR_MS;
    const files = [];
    const currentEmbed = new EmbedBuilder().setColor(0xFF6B6B)
        .setAuthor({ name: 'アストルティア防衛軍', iconURL: 'https://i.imgur.com/AfFp7pu.png' })
        .setTitle(current ? '🔥 現在の兵団' : '📅 指定日時の兵団')
        .setDescription(`**${info.current}**`);
    if (current) currentEmbed.addFields({ name: '⏱️ 残り時間', value: `\`${info.remainingMinutes}分\``, inline: true });
    else currentEmbed.addFields({ name: '指定日時（日本時間）', value: formatJst(request.atMs) }, { name: '開催枠', value: `${formatJst(start)} 〜 ${formatJst(start + HOUR_MS)}` });
    const nextEmbed = new EmbedBuilder().setColor(0x4ECDC4).setTitle('📢 次回予告').setDescription(`**${info.next}**`)
        .setFooter({ text: current ? '!b 明日 / !b 21:00 / !b help・日本時間' : PREDICTION });
    if (!current) nextEmbed.addFields({ name: '開始日時（日本時間）', value: formatJst(start + HOUR_MS) }).setURL(SOURCE);
    for (const [army, embed, next] of [[info.current, currentEmbed, false], [info.next, nextEmbed, true]]) {
        const file = imageMap[army];
        if (!file) continue;
        const fullPath = path.join(root, 'images', 'boueigun', file);
        if (!fs.existsSync(fullPath)) continue;
        const name = next ? `next_${file}` : file;
        files.push(new AttachmentBuilder(fullPath, { name }));
        if (next) embed.setThumbnail(`attachment://${name}`); else embed.setImage(`attachment://${name}`);
    }
    return { embeds: [currentEmbed, nextEmbed], files, allowedMentions };
}

module.exports = { buildBoueigunReply };
