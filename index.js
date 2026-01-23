require('dotenv').config();
const { Client, GatewayIntentBits, Events, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

// ========== アストルティア防衛軍スケジュール ==========
// 基準日時: 2025年1月22日 13:00 JST (周期Aの0時)
const BOUEIGUN_EPOCH = new Date('2025-01-22T13:00:00+09:00').getTime();

// ローテーション表
const BOUEIGUN_SCHEDULE = {
    common: {
        0: '全兵団',
        1: '金神の遺宝兵団',
        2: '紅爆の暴賊兵団',
        3: '全兵団',
        8: '鋼塊の重滅兵団',
        9: '紅爆の暴賊兵団'
    },
    A: { 4: '闇朱の獣牙兵団', 5: '蒼怨の屍獄兵団', 6: '灰塵の竜鱗兵団', 7: '白雲の冥翼兵団' },
    B: { 4: '紫炎の鉄機兵団', 5: '銀甲の凶蟲兵団', 6: '彩虹の粘塊兵団', 7: '腐緑の樹葬兵団' },
    C: { 4: '深碧の造魔兵団', 5: '翠煙の海妖兵団', 6: '芳墨の華烈兵団', 7: '青鮮の菜果兵団' }
};

// 兵団ごとの画像ファイル名（images/boueigun/ フォルダに配置）
const BOUEIGUN_IMAGES = {
    '全兵団': 'zenheidan.png',
    '金神の遺宝兵団': 'kinjin.png',
    '紅爆の暴賊兵団': 'koubaku.png',
    '鋼塊の重滅兵団': 'koukai.png',
    '闇朱の獣牙兵団': 'anshu.png',
    '蒼怨の屍獄兵団': 'souen.png',
    '灰塵の竜鱗兵団': 'kaijin.png',
    '白雲の冥翼兵団': 'hakuun.png',
    '紫炎の鉄機兵団': 'shien.png',
    '銀甲の凶蟲兵団': 'ginkou.png',
    '彩虹の粘塊兵団': 'saikou.png',
    '腐緑の樹葬兵団': 'furyoku.png',
    '深碧の造魔兵団': 'shinpeki.png',
    '翠煙の海妖兵団': 'suien.png',
    '芳墨の華烈兵団': 'houboku.png',
    '青鮮の菜果兵団': 'seisen.png'
};

function getBoueigunInfo() {
    const now = Date.now();
    const hoursSinceEpoch = Math.floor((now - BOUEIGUN_EPOCH) / (1000 * 60 * 60));

    // 30時間周期の中での位置
    const positionIn30h = ((hoursSinceEpoch % 30) + 30) % 30;

    // 周期 A/B/C の判定 (0=A, 1=B, 2=C)
    const cycleIndex = Math.floor(positionIn30h / 10);
    const cycleName = ['A', 'B', 'C'][cycleIndex];

    // 表の時間帯（0-9）
    const tableHour = positionIn30h % 10;

    // 現在の兵団を取得
    let currentHeidan;
    if (tableHour in BOUEIGUN_SCHEDULE.common) {
        currentHeidan = BOUEIGUN_SCHEDULE.common[tableHour];
    } else {
        currentHeidan = BOUEIGUN_SCHEDULE[cycleName][tableHour];
    }

    // 次の時間帯
    const nextPositionIn30h = (positionIn30h + 1) % 30;
    const nextCycleIndex = Math.floor(nextPositionIn30h / 10);
    const nextCycleName = ['A', 'B', 'C'][nextCycleIndex];
    const nextTableHour = nextPositionIn30h % 10;

    // 次の兵団を取得
    let nextHeidan;
    if (nextTableHour in BOUEIGUN_SCHEDULE.common) {
        nextHeidan = BOUEIGUN_SCHEDULE.common[nextTableHour];
    } else {
        nextHeidan = BOUEIGUN_SCHEDULE[nextCycleName][nextTableHour];
    }

    // 残り時間を計算
    const msPerHour = 1000 * 60 * 60;
    const msSinceHourStart = (now - BOUEIGUN_EPOCH) % msPerHour;
    const remainingMs = msPerHour - msSinceHourStart;
    const remainingMinutes = Math.floor(remainingMs / (1000 * 60));

    return {
        current: currentHeidan,
        next: nextHeidan,
        remainingMinutes: remainingMinutes
    };
}

// ========== リマインダー機能 ==========
const reminders = new Map(); // channelId -> [{ time: Date, userId: string, message: string }]
const fixedCalendars = new Map(); // channelId -> { messageId: string, year: number, month: number }

function getRemindersForChannel(channelId) {
    if (!reminders.has(channelId)) {
        reminders.set(channelId, []);
    }
    return reminders.get(channelId);
}

function generateCalendar(year, month, channelId) {
    const channelReminders = getRemindersForChannel(channelId);
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDay = new Date(year, month - 1, 1).getDay(); // 0=日曜

    // リマインダーがある日を取得
    const reminderDays = new Map(); // day -> count
    channelReminders.forEach(r => {
        const d = r.time;
        if (d.getFullYear() === year && d.getMonth() + 1 === month) {
            reminderDays.set(d.getDate(), (reminderDays.get(d.getDate()) || 0) + 1);
        }
    });

    const today = new Date();
    const todayDate = (today.getFullYear() === year && today.getMonth() + 1 === month) ? today.getDate() : -1;

    // ヘッダー
    let cal = '┌──────────────────────────┐\n';
    cal += '│ 日   月   火   水   木   金   土  │\n';
    cal += '├──────────────────────────┤\n';

    let line = '│';

    // 最初の空白
    for (let i = 0; i < firstDay; i++) {
        line += '     ';
    }

    for (let day = 1; day <= daysInMonth; day++) {
        let dayStr;
        if (day === todayDate && reminderDays.has(day)) {
            dayStr = `》${String(day).padStart(2)}◆`;
        } else if (day === todayDate) {
            dayStr = `》${String(day).padStart(2)} `;
        } else if (reminderDays.has(day)) {
            dayStr = ` ${String(day).padStart(2)}◆`;
        } else {
            dayStr = ` ${String(day).padStart(2)}  `;
        }
        line += dayStr;

        const dayOfWeek = (firstDay + day - 1) % 7;
        if (dayOfWeek === 6) {
            line += '│';
            cal += line + '\n';
            line = '│';
        } else if (day === daysInMonth) {
            // 最後の行の残りを埋める
            for (let i = dayOfWeek + 1; i <= 6; i++) {
                line += '     ';
            }
            line += '│';
            cal += line + '\n';
        }
    }

    cal += '└──────────────────────────┘';
    return cal;
}

function buildCalendarEmbed(year, month, channelId) {
    const channelReminders = getRemindersForChannel(channelId);
    const cal = generateCalendar(year, month, channelId);

    const monthNames = ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

    const embed = new EmbedBuilder()
        .setColor(0x2B2D31)
        .setTitle(`📅  ${year}年 ${monthNames[month]}`)
        .setDescription(`\`\`\`\n${cal}\n\`\`\``);

    // 今月の予定一覧
    const monthReminders = channelReminders
        .filter(r => r.time.getFullYear() === year && r.time.getMonth() + 1 === month)
        .sort((a, b) => a.time - b.time);

    if (monthReminders.length > 0) {
        const reminderList = monthReminders.map(r => {
            const d = r.time;
            const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
            const timeStr = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
            const msg = r.message || 'リマインダー';
            return `> 🔔 **${dateStr}** ${timeStr} - ${msg}`;
        }).join('\n');
        embed.addFields({ name: '📋 今月の予定', value: reminderList });
    } else {
        embed.addFields({ name: '📋 今月の予定', value: '> 予定はありません' });
    }

    embed.setFooter({ text: '》= 今日  ◆ = 予定あり  │  !cal fix で固定表示' });
    embed.setTimestamp();

    return embed;
}

async function updateFixedCalendar(channelId) {
    const fixed = fixedCalendars.get(channelId);
    if (!fixed) return;

    try {
        const channel = client.channels.cache.get(channelId);
        if (!channel) return;
        const msg = await channel.messages.fetch(fixed.messageId);
        if (!msg) return;

        const now = new Date();
        const embed = buildCalendarEmbed(now.getFullYear(), now.getMonth() + 1, channelId);
        await msg.edit({ embeds: [embed] });
    } catch (e) {
        // メッセージが削除された場合は固定を解除
        fixedCalendars.delete(channelId);
    }
}

// Create a new client instance with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// When the client is ready, run this code (only once)
client.once(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);

    // リマインダーチェック（1分ごと）
    setInterval(() => {
        const now = new Date();
        reminders.forEach((reminderList, channelId) => {
            const triggered = [];
            reminderList.forEach((reminder, index) => {
                if (now >= reminder.time) {
                    const channel = client.channels.cache.get(channelId);
                    if (channel) {
                        const msg = reminder.message || 'リマインダーの時間です！';
                        channel.send(`⏰ <@${reminder.userId}> ${msg}`);
                    }
                    triggered.push(index);
                }
            });
            // 発火済みを削除（逆順）
            triggered.reverse().forEach(i => reminderList.splice(i, 1));
            if (triggered.length > 0) updateFixedCalendar(channelId);
        });
    }, 60000); // 60秒ごとにチェック

    // 固定カレンダーを1時間ごとに更新（今日マーク更新用）
    setInterval(() => {
        fixedCalendars.forEach((_, channelId) => {
            updateFixedCalendar(channelId);
        });
    }, 3600000);
});

// Listen for messages
client.on(Events.MessageCreate, async message => {
    // Ignore messages from bots
    if (message.author.bot) return;

    // Basic Ping-Pong command
    if (message.content === '!ping') {
        message.reply('Pong!');
    }

    // ヘルプコマンド
    if (message.content === '!help' || message.content === '!h') {
        const helpEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📖 コマンド一覧')
            .setDescription('使用可能なコマンド')
            .addFields(
                { name: '🎮 ネタ系', value: '`!n` ねけます\n`!m` もう無理\n`!mo` どうせｵﾚがﾋｰﾗｰ\n`!s` 申し訳なさございません\n`!d` ディスコ上げときますねー\n`!i` いいよ。ｵﾚ要らない\n`!a` あーいーいーいー\n`!si` 最近ｵﾚにあたり強くない？', inline: true },
                { name: '📅 スケジュール', value: '`!b` 防衛軍スケジュール', inline: true },
                { name: '⏰ リマインダー', value: '`!remind 21:00` 時刻指定\n`!remind 1/25 21:00` 日付指定\n`!remind 30m` 分指定\n`!r` 一覧表示', inline: true },
                { name: '📅 カレンダー', value: '`!cal` 今月表示\n`!cal 2` 月指定\n`!cal fix` 固定表示\n`!cal unfix` 固定解除', inline: true },
                { name: '🎉 イベント', value: '`!3` 3月イベント告知', inline: true }
            )
            .setFooter({ text: 'Shin Bot' });
        message.reply({ embeds: [helpEmbed] });
    }

    // New Commands
    if (message.content === '!nekemasu' || message.content === '!ねけます' || message.content === '!n') {
        message.reply('ねけます');
    }

    if (message.content === '!moumuri' || message.content === '!もう無理' || message.content === '!m') {
        message.reply('もう無理');
    }

    if (message.content === '!mo') {
        message.reply('もう分かったよ！どうせｵﾚがﾋｰﾗｰなんでしょ！？');
    }

    if (message.content === '!sorry' || message.content === '!申し訳なさございません' || message.content === '!s') {
        message.reply('申し訳なさございません。');
    }

    if (message.content === '!d') {
        message.reply('ディスコ上げときますねー');
    }

    if (message.content === '!i') {
        message.reply('いいよ。ｵﾚ要らない。人から物貰うの嫌い。');
    }

    if (message.content === '!a') {
        message.reply('あーいーいーいー！\n何もいらないから！');
    }

    if (message.content === '!3') {
        message.reply('3月にやるイベントなんですけど\nやるのは\n★大★富★豪★');
    }

    if (message.content === '!si') {
        message.reply('最近ｵﾚにあたり強くない？');
    }

    // リマインダーコマンド
    if (message.content.startsWith('!remind ') || message.content.startsWith('!r ')) {
        const args = message.content.split(' ').slice(1).join(' ').trim();
        let targetTime;
        let reminderMessage = '';

        // 日付+時刻形式 (例: 1/25 21:00 メッセージ)
        const dateTimeMatch = args.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})(?:\s+(.+))?$/);
        // 時刻形式 (例: 21:00 メッセージ)
        const timeMatch = args.match(/^(\d{1,2}):(\d{2})(?:\s+(.+))?$/);
        // 分形式 (例: 30m メッセージ)
        const minuteMatch = args.match(/^(\d+)(m|分)(?:\s+(.+))?$/);

        if (dateTimeMatch) {
            const month = parseInt(dateTimeMatch[1]) - 1;
            const day = parseInt(dateTimeMatch[2]);
            const hours = parseInt(dateTimeMatch[3]);
            const minutes = parseInt(dateTimeMatch[4]);
            reminderMessage = dateTimeMatch[5] || '';
            const now = new Date();
            targetTime = new Date(now.getFullYear(), month, day, hours, minutes, 0, 0);
            if (targetTime <= now) {
                targetTime.setFullYear(targetTime.getFullYear() + 1);
            }
        } else if (timeMatch) {
            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            reminderMessage = timeMatch[3] || '';
            targetTime = new Date();
            targetTime.setHours(hours, minutes, 0, 0);
            if (targetTime <= new Date()) {
                targetTime.setDate(targetTime.getDate() + 1);
            }
        } else if (minuteMatch) {
            const mins = parseInt(minuteMatch[1]);
            reminderMessage = minuteMatch[3] || '';
            targetTime = new Date(Date.now() + mins * 60 * 1000);
        } else {
            message.reply('⚠️ 形式:\n`!remind 21:00` 時刻指定\n`!remind 1/25 21:00` 日付+時刻\n`!remind 30m` 分指定\n末尾にメッセージ追加可');
            return;
        }

        const channelReminders = getRemindersForChannel(message.channel.id);
        channelReminders.push({
            time: targetTime,
            userId: message.author.id,
            message: reminderMessage
        });

        const dateStr = `${targetTime.getMonth() + 1}/${targetTime.getDate()}`;
        const timeStr = `${targetTime.getHours()}:${String(targetTime.getMinutes()).padStart(2, '0')}`;
        const msgInfo = reminderMessage ? `\n📝 ${reminderMessage}` : '';
        message.reply(`⏰ ${dateStr} ${timeStr} にリマインドします！${msgInfo}`);

        // 固定カレンダーを更新
        updateFixedCalendar(message.channel.id);
    }

    // リマインダー一覧
    if (message.content === '!remind' || message.content === '!r') {
        const channelReminders = getRemindersForChannel(message.channel.id);
        if (channelReminders.length > 0) {
            const list = channelReminders.map((r, i) => {
                const d = r.time;
                const dateStr = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
                const msg = r.message ? ` - ${r.message}` : '';
                return `${i + 1}. ${dateStr}${msg}`;
            }).join('\n');
            message.reply(`⏰ リマインダー一覧:\n${list}`);
        } else {
            message.reply('リマインダーは設定されていません。\n使い方: `!remind 21:00` または `!remind 1/25 21:00`');
        }
    }

    // カレンダー表示
    if (message.content === '!cal' || message.content === '!calendar' || message.content.startsWith('!cal ')) {
        const now = new Date();
        let year = now.getFullYear();
        let month = now.getMonth() + 1;

        if (message.content.startsWith('!cal ')) {
            const calArgs = message.content.split(' ').slice(1).join(' ');

            // !cal fix - 固定カレンダー
            if (calArgs === 'fix') {
                const embed = buildCalendarEmbed(year, month, message.channel.id);
                const sent = await message.channel.send({ embeds: [embed] });
                fixedCalendars.set(message.channel.id, {
                    messageId: sent.id,
                    year: year,
                    month: month
                });
                return;
            }

            // !cal unfix - 固定解除
            if (calArgs === 'unfix') {
                fixedCalendars.delete(message.channel.id);
                message.reply('📅 固定カレンダーを解除しました');
                return;
            }

            // !cal 2 - 月指定
            const calMatch = calArgs.match(/^(\d{1,2})(?:\/(\d{4}))?$/);
            if (calMatch) {
                month = parseInt(calMatch[1]);
                year = calMatch[2] ? parseInt(calMatch[2]) : now.getFullYear();
            }
        }

        const embed = buildCalendarEmbed(year, month, message.channel.id);
        message.reply({ embeds: [embed] });
    }

    // 防衛軍スケジュールコマンド
    if (message.content === '!boueigun' || message.content === '!防衛軍' || message.content === '!b') {
        const info = getBoueigunInfo();

        // 画像ファイルのパスを取得
        const currentImageFile = BOUEIGUN_IMAGES[info.current];
        const currentImagePath = path.join(__dirname, 'images', 'boueigun', currentImageFile);
        const nextImageFile = BOUEIGUN_IMAGES[info.next];
        const nextImagePath = path.join(__dirname, 'images', 'boueigun', nextImageFile);

        const files = [];
        const embeds = [];

        // 現在の兵団Embed
        const currentEmbed = new EmbedBuilder()
            .setColor(0xFF6B6B)
            .setAuthor({ name: 'アストルティア防衛軍', iconURL: 'https://i.imgur.com/AfFp7pu.png' })
            .setTitle('🔥 現在の兵団')
            .setDescription(`**${info.current}**`)
            .addFields(
                { name: '⏱️ 残り時間', value: `\`${info.remainingMinutes}分\``, inline: true }
            );

        if (fs.existsSync(currentImagePath)) {
            const currentAttachment = new AttachmentBuilder(currentImagePath, { name: currentImageFile });
            files.push(currentAttachment);
            currentEmbed.setImage(`attachment://${currentImageFile}`);
        }
        embeds.push(currentEmbed);

        // 次回予告Embed
        const nextEmbed = new EmbedBuilder()
            .setColor(0x4ECDC4)
            .setTitle('📢 次回予告')
            .setDescription(`**${info.next}**`)
            .setFooter({ text: '!b または !防衛軍 で確認' });

        if (fs.existsSync(nextImagePath)) {
            const nextAttachment = new AttachmentBuilder(nextImagePath, { name: `next_${nextImageFile}` });
            files.push(nextAttachment);
            nextEmbed.setThumbnail(`attachment://next_${nextImageFile}`);
        }
        embeds.push(nextEmbed);

        message.reply({ embeds: embeds, files: files });
    }
});

// Log in to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);
