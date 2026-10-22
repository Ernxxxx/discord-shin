const HOUR_MS = 3600000;
const DAY_MS = 24 * HOUR_MS;
const JST_MS = 9 * HOUR_MS;
const MAX_FORECAST_DAYS = 30;

function jstParts(ms) {
    const d = new Date(ms + JST_MS);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), weekday: d.getUTCDay() };
}

function jstMidnight(ms) {
    return Math.floor((ms + JST_MS) / DAY_MS) * DAY_MS - JST_MS;
}

function dateMs(year, month, day) {
    const ms = Date.UTC(year, month - 1, day) - JST_MS;
    const actual = jstParts(ms);
    return actual.year === year && actual.month === month && actual.day === day ? ms : null;
}

function parseClock(text) {
    let value = text.trim().replace(/^の\s*/, '').replace(/^[Tt]\s*/, '').replace(/\s+/g, '');
    let period = '';
    const prefix = value.match(/^(午前|午後|am|pm)/i);
    const suffix = value.match(/(am|pm)$/i);
    if (prefix && suffix) return null;
    if (prefix) { period = prefix[1].toLowerCase(); value = value.slice(prefix[0].length); }
    if (suffix) { period = suffix[1].toLowerCase(); value = value.slice(0, -suffix[0].length); }
    const match = value.match(/^(\d{1,2})(?::(\d{1,2})|時(?:(半)|(\d{1,2})分?)?)?$/);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = match[3] ? 30 : Number(match[2] || match[4] || 0);
    if (minute > 59 || hour > 24 || (hour === 24 && minute !== 0)) return null;
    if (period) {
        if (hour < 1 || hour > 12) return null;
        hour = hour % 12 + (period === '午後' || period === 'pm' ? 12 : 0);
    }
    return { hour, minute };
}

function parseBoueigunCommand(content, nowMs = Date.now()) {
    if (typeof content !== 'string') return null;
    const normalized = content.normalize('NFKC').trim();
    const command = normalized.match(/^!(boueigun|防衛軍|b)(?=$|\s|[0-9今明次あ予一午])/i);
    if (!command) return null;
    const value = normalized.slice(command[0].length).trim();
    const error = message => ({ kind: 'error', message, nowMs });
    if (!Number.isFinite(nowMs)) return error('現在日時を確認できませんでした。');
    if (value.length > 100) return error('日時の指定が長すぎます。`!b help`で指定方法を確認してください。');
    if (!value || /^(今|現在|now)$/i.test(value)) return { kind: 'current', atMs: nowMs, nowMs };
    if (/^(help|ヘルプ|使い方|\?)$/i.test(value)) return { kind: 'help', nowMs };
    const today = jstMidnight(nowMs);
    const withinRange = ms => ms >= today && jstMidnight(ms) <= today + MAX_FORECAST_DAYS * DAY_MS;
    const point = atMs => withinRange(atMs) ? { kind: 'at', atMs, nowMs } : error(`今日から${MAX_FORECAST_DAYS}日先まで指定できます。`);
    const day = startMs => withinRange(startMs) ? { kind: 'day', startMs, nowMs } : error(`今日から${MAX_FORECAST_DAYS}日先まで指定できます。`);
    if (/^(次|次回|次の兵団|next)$/i.test(value)) return point(Math.floor(nowMs / HOUR_MS) * HOUR_MS + HOUR_MS);
    if (/^(予定|一覧|schedule)$/i.test(value)) return day(today);

    const relative = value.replace(/\s+/g, '').match(/^(?:あと)?(?:(\d+)\s*(?:時間|h))?(?:(\d+)\s*(?:分|m))?(?:後)?$/i);
    if (relative && (relative[1] !== undefined || relative[2] !== undefined)) {
        const offset = Number(relative[1] || 0) * HOUR_MS + Number(relative[2] || 0) * 60000;
        if (!Number.isFinite(offset) || offset > MAX_FORECAST_DAYS * DAY_MS) return error(`相対時刻は${MAX_FORECAST_DAYS}日以内で指定してください。`);
        return point(nowMs + offset);
    }

    let startMs;
    let clockText;
    const named = value.match(/^(明後日|あさって|明日|今日|tomorrow|today)(.*)$/i);
    const explicit = value.match(/^(?:(\d{4})[\/年-])?(\d{1,2})[\/月-](\d{1,2})日?(.*)$/);
    if (named) {
        const days = /^(明後日|あさって)$/.test(named[1]) ? 2 : /^(明日|tomorrow)$/i.test(named[1]) ? 1 : 0;
        startMs = today + days * DAY_MS;
        clockText = named[2].trim();
    } else if (explicit) {
        const now = jstParts(nowMs);
        let year = explicit[1] ? Number(explicit[1]) : now.year;
        const month = Number(explicit[2]), date = Number(explicit[3]);
        startMs = dateMs(year, month, date);
        if (startMs === null) return error('存在しない日付です。月日を確認してください。');
        if (!explicit[1] && startMs < today) startMs = dateMs(++year, month, date);
        if (startMs === null) return error('存在しない日付です。年と月日を確認してください。');
        clockText = explicit[4].trim();
    }
    if (startMs !== undefined) {
        if (!clockText) return day(startMs);
        const clock = parseClock(clockText);
        if (!clock) return error('時刻を確認してください。例: `21:00` / `21時半` / `午後9時`');
        return point(startMs + clock.hour * HOUR_MS + clock.minute * 60000);
    }
    const clock = parseClock(value);
    if (clock) {
        let atMs = today + clock.hour * HOUR_MS + clock.minute * 60000;
        // Keep the current hour's slot; use tomorrow only once that slot has ended.
        if (Math.floor(atMs / HOUR_MS) * HOUR_MS + HOUR_MS <= nowMs) atMs += DAY_MS;
        return point(atMs);
    }
    return error('日時を読み取れませんでした。`!b 明日` / `!b 21:00` / `!b 3時間後` / `!b help`で指定できます。');
}

function formatJst(ms, withTime = true) {
    const p = jstParts(ms);
    const date = `${p.year}/${String(p.month).padStart(2, '0')}/${String(p.day).padStart(2, '0')}（${'日月火水木金土'[p.weekday]}）`;
    return withTime ? `${date} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}` : date;
}

module.exports = { parseBoueigunCommand, formatJst, jstParts, MAX_FORECAST_DAYS };
