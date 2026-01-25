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

const REMINDERS_FILE = path.join(__dirname, 'reminders.json');

// 永続化: 保存
function saveReminders() {
    const data = {
        reminders: {}
    };

    // MapをObjectに変換
    reminders.forEach((list, channelId) => {
        data.reminders[channelId] = list.map(r => ({
            time: r.time.toISOString(),
            userId: r.userId,
            message: r.message
        }));
    });

    fs.writeFileSync(REMINDERS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// 永続化: 読み込み
function loadReminders() {
    if (!fs.existsSync(REMINDERS_FILE)) return;

    try {
        const raw = fs.readFileSync(REMINDERS_FILE, 'utf8');
        const data = JSON.parse(raw);

        // リマインダーを復元（Dateオブジェクトに変換）
        if (data.reminders) {
            for (const [channelId, list] of Object.entries(data.reminders)) {
                reminders.set(channelId, list.map(r => ({
                    time: new Date(r.time),
                    userId: r.userId,
                    message: r.message
                })));
            }
        }

        console.log(`Loaded ${reminders.size} channel(s) with reminders`);
    } catch (e) {
        console.error('Failed to load reminders:', e.message);
    }
}

function getRemindersForChannel(channelId) {
    if (!reminders.has(channelId)) {
        reminders.set(channelId, []);
    }
    return reminders.get(channelId);
}

// Create a new client instance with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// When the client is ready, run this code (only once)
client.once(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);

    // 永続化データを読み込み
    loadReminders();

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
            if (triggered.length > 0) {
                saveReminders();
            }
        });
    }, 60000); // 60秒ごとにチェック
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
                { name: '⏰ リマインダー', value: '`!remind 21:00` 時刻指定\n`!remind 1/25 21:00` 日付指定\n`!remind 2025/1/25 21:00` 年指定\n`!remind 30m` 分指定\n`!r` 一覧 `!r delete 1` 削除\n`!r clear` 全削除', inline: true },
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

    if (message.content === '!u') {
        message.reply('うーーー★');
    }

    if (message.content === '!t') {
        message.reply('チムイベにあつ森はありだと思いますか？');
    }

    // リマインダーコマンド
    if (message.content.startsWith('!remind ') || message.content.startsWith('!r ')) {
        const args = message.content.split(' ').slice(1).join(' ').trim();
        let targetTime;
        let reminderMessage = '';

        // 日付+時刻形式 (例: 1/25 21:00 または 2025/1/25 21:00 メッセージ)
        const dateTimeMatch = args.match(/^(?:(\d{4})\/)?(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})(?:\s+(.+))?$/);
        // 時刻形式 (例: 21:00 メッセージ)
        const timeMatch = args.match(/^(\d{1,2}):(\d{2})(?:\s+(.+))?$/);
        // 分形式 (例: 30m メッセージ)
        const minuteMatch = args.match(/^(\d+)(m|分)(?:\s+(.+))?$/);

        if (dateTimeMatch) {
            const year = dateTimeMatch[1] ? parseInt(dateTimeMatch[1]) : null;
            const month = parseInt(dateTimeMatch[2]) - 1;
            const day = parseInt(dateTimeMatch[3]);
            const hours = parseInt(dateTimeMatch[4]);
            const minutes = parseInt(dateTimeMatch[5]);
            reminderMessage = dateTimeMatch[6] || '';
            const now = new Date();
            targetTime = new Date(year || now.getFullYear(), month, day, hours, minutes, 0, 0);
            // 年指定がない場合のみ、過去なら翌年に
            if (!year && targetTime <= now) {
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

        saveReminders();
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

    // リマインダー削除
    if (message.content.startsWith('!remind delete ') || message.content.startsWith('!r delete ')) {
        const args = message.content.split(' ').slice(2);
        const num = parseInt(args[0]);
        const channelReminders = getRemindersForChannel(message.channel.id);

        if (isNaN(num) || num < 1 || num > channelReminders.length) {
            message.reply(`⚠️ 無効な番号です。1〜${channelReminders.length}の範囲で指定してください。`);
            return;
        }

        const removed = channelReminders.splice(num - 1, 1)[0];
        const d = removed.time;
        const dateStr = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
        const msg = removed.message ? ` - ${removed.message}` : '';

        saveReminders();
        message.reply(`🗑️ 削除しました: ${dateStr}${msg}`);
    }

    // リマインダー全削除
    if (message.content === '!remind clear' || message.content === '!r clear') {
        const channelReminders = getRemindersForChannel(message.channel.id);
        const count = channelReminders.length;

        if (count === 0) {
            message.reply('削除するリマインダーがありません。');
            return;
        }

        channelReminders.length = 0; // 配列をクリア
        saveReminders();
        message.reply(`🗑️ ${count}件のリマインダーを全て削除しました。`);
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

// ボイスチャンネル入室検知
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    // ボイスチャンネルに入った場合（以前いなかった→今いる）
    if (!oldState.channel && newState.channel) {
        const voiceChannel = newState.channel;

        // そのチャンネルにいるのが1人だけ（最初の入室者）
        if (voiceChannel.members.size === 1) {
            const guild = newState.guild;

            // 「ドラクエ10」カテゴリ内の「雑談」チャンネルを探す
            const category = guild.channels.cache.find(ch => ch.name === 'ドラクエ10' && ch.type === 4); // 4 = CategoryChannel
            let textChannel = null;

            if (category) {
                textChannel = guild.channels.cache.find(ch => ch.name === '雑談' && ch.parentId === category.id);
            }

            if (textChannel) {
                textChannel.send('ディスコ上げときますねー');
            }
        }
    }
});

// Log in to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);
