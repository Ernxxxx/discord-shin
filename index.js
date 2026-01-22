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
});

// Listen for messages
client.on(Events.MessageCreate, message => {
    // Ignore messages from bots
    if (message.author.bot) return;

    // Basic Ping-Pong command
    if (message.content === '!ping') {
        message.reply('Pong!');
    }

    // New Commands
    if (message.content === '!nekemasu' || message.content === '!ねけます' || message.content === '!n') {
        message.reply('ねけます');
    }

    if (message.content === '!moumuri' || message.content === '!もう無理' || message.content === '!m') {
        message.reply('もう無理');
    }

    if (message.content === '!sorry' || message.content === '!申し訳なさございません' || message.content === '!s') {
        message.reply('申し訳なさございません。');
    }

    if (message.content === '!d') {
        message.reply('ディスコ上げときますねー');
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
