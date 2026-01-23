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

    const width = 800;
    const rows = 6; // max 6 weeks
    const headerHeight = 100;
    const cellHeight = 80;
    const height = headerHeight + cellHeight * rows + 50; // Dynamic height? Fixed is easier.

    const img = PImage.make(width, height);
    const ctx = img.getContext('2d');

    // Background
    ctx.fillStyle = '#2B2D31'; // Discord dark gray
    ctx.fillRect(0, 0, width, height);

    // Title
    ctx.fillStyle = '#FFFFFF';
    ctx.font = "48px 'MPLUS1'";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${year}年 ${month}月`, width / 2, 50);

    // Grid config
    const startX = 50;
    const startY = 100;
    const cellWidth = 100;
    const days = ['日', '月', '火', '水', '木', '金', '土'];

    // Header (Days of week)
    ctx.font = "24px 'MPLUS1'";
    days.forEach((day, i) => {
        const x = startX + i * cellWidth + cellWidth / 2;
        if (i === 0) ctx.fillStyle = '#FF6B6B'; // Sun red
        else if (i === 6) ctx.fillStyle = '#4ECDC4'; // Sat blue/cyan
        else ctx.fillStyle = '#FFFFFF';

        ctx.fillText(day, x, startY - 20);
    });

    // Calendar logic
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = new Date();

    ctx.strokeStyle = '#40444B';
    ctx.lineWidth = 2;

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

        // Highlight Today
        if (year === today.getFullYear() && month === today.getMonth() + 1 && day === today.getDate()) {
            ctx.fillStyle = '#5865F2'; // Discord Blurple
            ctx.fillRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4);
        } else if (reminderCount > 0) {
            ctx.fillStyle = '#3A4047'; // Slightly lighter background
            ctx.fillRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4);
        }

        // Box border
        ctx.strokeRect(x, y, cellWidth, cellHeight);

        // Date number
        ctx.fillStyle = '#FFFFFF';
        ctx.font = "30px 'MPLUS1'";
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(day.toString(), x + cellWidth - 10, y + 10);

        // Reminder indicator
        if (reminderCount > 0) {
            ctx.fillStyle = '#FEE75C'; // Yellow
            ctx.beginPath();
            ctx.arc(x + 25, y + 55, 12, 0, Math.PI * 2);
            ctx.fill();

            // Count text
            ctx.fillStyle = '#000000';
            ctx.font = "16px 'MPLUS1'";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(reminderCount.toString(), x + 25, y + 55);
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
