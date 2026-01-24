const PImage = require('pureimage');
const path = require('path');
const opentype = require('opentype.js');

let fontLoaded = false;
const font = PImage.registerFont(path.join(__dirname, 'fonts', 'MPLUSRounded1c-Regular.ttf'), 'MPLUS1');

function loadFont() {
    return new Promise((resolve, reject) => {
        if (fontLoaded) return resolve();
        console.log('Start loading font (manual)...');
        opentype.load(path.join(__dirname, 'fonts', 'MPLUSRounded1c-Regular.ttf'), (err, loadedFont) => {
            if (err) {
                console.error('Font loading failed:', err);
                reject(err);
            } else {
                console.log('Font loaded successfully');
                font.font = loadedFont;
                font.loaded = true;
                fontLoaded = true;
                resolve();
            }
        });
    });
}

function getGridPosition(index, startX, startY, cellWidth, cellHeight, cols) {
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
        x: startX + col * cellWidth,
        y: startY + row * cellHeight
    };
}

async function createCalendarImage(year, month, reminders) {
    console.log('createCalendarImage called');
    await loadFont();
    console.log('Font loaded, creating image...');

    // Warm Gold デザイン設定
    const width = 840;
    const rows = 6; // max 6 weeks
    const headerHeight = 140;
    const cellHeight = 90;
    const cellWidth = 110;
    const height = headerHeight + cellHeight * rows + 60;

    const img = PImage.make(width, height);
    const ctx = img.getContext('2d');

    // 暖かいダーク背景
    ctx.fillStyle = '#1f1a15';
    ctx.fillRect(0, 0, width, height);

    // タイトル - アンバーゴールド
    ctx.fillStyle = '#fbbf24';
    ctx.font = "52px 'MPLUS1'";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${year}年 ${month}月`, width / 2, 55);

    // Grid config
    const startX = 50;
    const startY = headerHeight;
    const days = ['日', '月', '火', '水', '木', '金', '土'];

    // 曜日ヘッダー
    ctx.font = "26px 'MPLUS1'";
    const dayColors = ['#f87171', '#e5e7eb', '#e5e7eb', '#e5e7eb', '#e5e7eb', '#e5e7eb', '#60a5fa'];
    days.forEach((day, i) => {
        const x = startX + i * cellWidth + cellWidth / 2;
        ctx.fillStyle = dayColors[i];
        ctx.fillText(day, x, startY - 20);
    });

    // Calendar logic
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = new Date();

    for (let day = 1; day <= daysInMonth; day++) {
        const dayIndex = firstDay + day - 1;
        const col = dayIndex % 7;
        const row = Math.floor(dayIndex / 7);

        const x = startX + col * cellWidth;
        const y = startY + row * cellHeight;

        // Count reminders for this day
        const reminderCount = reminders.filter(r => {
            const d = new Date(r.time);
            return d.getFullYear() === year &&
                d.getMonth() + 1 === month &&
                d.getDate() === day;
        }).length;

        const isToday = year === today.getFullYear() && month === today.getMonth() + 1 && day === today.getDate();

        // セル背景
        if (isToday) {
            // 今日 - ゴールド枠 + ダーク内側
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(x + 4, y + 4, cellWidth - 8, cellHeight - 8);
            ctx.fillStyle = '#422006';
            ctx.fillRect(x + 6, y + 6, cellWidth - 12, cellHeight - 12);
        } else if (reminderCount > 0) {
            // リマインダーあり - 少し明るい背景
            ctx.fillStyle = '#2a2520';
            ctx.fillRect(x + 4, y + 4, cellWidth - 8, cellHeight - 8);
        }

        // ボーダー
        ctx.strokeStyle = isToday ? '#fbbf24' : '#4a4035';
        ctx.lineWidth = isToday ? 2 : 1;
        ctx.strokeRect(x + 4, y + 4, cellWidth - 8, cellHeight - 8);

        // 日付番号
        if (col === 0) ctx.fillStyle = '#f87171';  // 日曜 - ソフトレッド
        else if (col === 6) ctx.fillStyle = '#60a5fa';  // 土曜 - ソフトブルー
        else ctx.fillStyle = isToday ? '#fbbf24' : '#e5e7eb';

        ctx.font = "32px 'MPLUS1'";
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(day.toString(), x + cellWidth - 14, y + 12);

        // リマインダーインジケーター
        if (reminderCount > 0) {
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.arc(x + 28, y + 62, 14, 0, Math.PI * 2);
            ctx.fill();

            // カウント数字
            ctx.fillStyle = '#1f1a15';
            ctx.font = "18px 'MPLUS1'";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(reminderCount.toString(), x + 28, y + 62);
        }
    }

    return img;
}

async function getCalendarImageStream(year, month, reminders) {
    const img = await createCalendarImage(year, month, reminders);
    const { PassThrough } = require('stream');
    const stream = new PassThrough();
    // Do not await here to avoid deadlock (no one reading stream yet)
    PImage.encodePNGToStream(img, stream).catch(err => console.error(err));
    return stream;
}

module.exports = { getCalendarImageStream };
