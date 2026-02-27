require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    Events,
    EmbedBuilder,
    AttachmentBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits
} = require('discord.js');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { execFile } = require('child_process');

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

// ========== Official feed relay (X + DQX news) ==========
const OFFICIAL_TARGET_ID = (process.env.OFFICIAL_TARGET_ID || '1261502032037154976').trim();
const OFFICIAL_POLL_INTERVAL_MINUTES = parseInt(process.env.OFFICIAL_POLL_INTERVAL_MINUTES || '5', 10);
const OFFICIAL_POLL_INTERVAL_MS = (
    Number.isFinite(OFFICIAL_POLL_INTERVAL_MINUTES) ? Math.max(1, OFFICIAL_POLL_INTERVAL_MINUTES) : 5
) * 60 * 1000;
const OFFICIAL_DQX_NEWS_URL = 'https://hiroba.dqx.jp/sc/news/information/';
const OFFICIAL_DQX_TOPICS_URL = 'https://hiroba.dqx.jp/sc/topics/';
const OFFICIAL_X_API_BASE_URL = process.env.X_API_BASE_URL || 'https://api.x.com/2';
const OFFICIAL_X_ACCOUNT_URL = (process.env.X_API_ACCOUNT_URL || '').trim();
const OFFICIAL_X_ACCOUNT_URLS = (process.env.X_API_ACCOUNT_URLS || '').trim();
const OFFICIAL_X_DEFAULT_ACCOUNT_URLS = [
    'https://x.com/dq_tora',
    'https://x.com/DQ_X'
];
const OFFICIAL_FEED_STATE_FILE = path.join(__dirname, 'official_feed_state.json');
const TEAM_EVENT_ENABLED = (process.env.TEAM_EVENT_ENABLED || '1') !== '0';
const TEAM_EVENT_TARGET_CHANNEL_ID = (process.env.TEAM_EVENT_CHANNEL_ID || '').trim();
const TEAM_EVENT_CHECK_INTERVAL_MINUTES = parseInt(process.env.TEAM_EVENT_CHECK_INTERVAL_MINUTES || '10', 10);
const TEAM_EVENT_CHECK_INTERVAL_MS = (
    Number.isFinite(TEAM_EVENT_CHECK_INTERVAL_MINUTES) ? Math.max(1, TEAM_EVENT_CHECK_INTERVAL_MINUTES) : 10
) * 60 * 1000;
const TEAM_EVENT_POST_HOUR_JST = parseInt(process.env.TEAM_EVENT_POST_HOUR_JST || '18', 10);
const TEAM_EVENT_LEAD_DAYS = parseInt(process.env.TEAM_EVENT_LEAD_DAYS || '3', 10);
const TEAM_EVENT_INTERVAL_DAYS_RAW = parseInt(process.env.TEAM_EVENT_INTERVAL_DAYS || '14', 10);
const TEAM_EVENT_INTERVAL_DAYS = Number.isFinite(TEAM_EVENT_INTERVAL_DAYS_RAW)
    ? Math.max(1, TEAM_EVENT_INTERVAL_DAYS_RAW)
    : 14;
const TEAM_EVENT_EPOCH_SATURDAY = (process.env.TEAM_EVENT_EPOCH_SATURDAY || '2026-03-07').trim();
const TEAM_EVENT_STATE_FILE = path.join(__dirname, 'team_event_state.json');
const TEAM_EVENT_TALLY_DELAY_HOURS = parseInt(process.env.TEAM_EVENT_TALLY_DELAY_HOURS || '48', 10);
const TEAM_EVENT_REMINDER_DAYS_BEFORE = parseInt(process.env.TEAM_EVENT_REMINDER_DAYS_BEFORE || '3', 10);
const TEAM_EVENT_REMINDER_HOURS_BEFORE = parseInt(process.env.TEAM_EVENT_REMINDER_HOURS_BEFORE || '2', 10);
const TEAM_EVENT_HISTORY_MAX_RAW = parseInt(process.env.TEAM_EVENT_HISTORY_MAX || '120', 10);
const TEAM_EVENT_HISTORY_MAX = Number.isFinite(TEAM_EVENT_HISTORY_MAX_RAW)
    ? Math.max(1, TEAM_EVENT_HISTORY_MAX_RAW)
    : 120;
const TEAM_EVENT_BUTTON_PREFIX = 'team_event';
const TEAM_EVENT_AVAIL_BUTTON_PREFIX = 'team_event_avail';
const TEAM_EVENT_FIXED_TIME = '21:00';
const TEAM_EVENT_TIME_SLOTS = [TEAM_EVENT_FIXED_TIME];
const TEAM_EVENT_AVAILABILITY_WEEK_DAYS = 7;
const TEAM_EVENT_SLOT_WINDOW_DAYS_RAW = parseInt(process.env.TEAM_EVENT_SLOT_WINDOW_DAYS || '7', 10);
const TEAM_EVENT_SLOT_WINDOW_DAYS = Number.isFinite(TEAM_EVENT_SLOT_WINDOW_DAYS_RAW)
    ? Math.max(2, TEAM_EVENT_SLOT_WINDOW_DAYS_RAW)
    : 7;
const TEAM_EVENT_SHIFT_WEIGHT_RAW = parseFloat(process.env.TEAM_EVENT_SHIFT_WEIGHT || '2');
const TEAM_EVENT_SHIFT_WEIGHT = Number.isFinite(TEAM_EVENT_SHIFT_WEIGHT_RAW)
    ? Math.max(0, TEAM_EVENT_SHIFT_WEIGHT_RAW)
    : 2;
const TEAM_EVENT_SHIFT_USER_IDS = Array.from(new Set(
    String(process.env.TEAM_EVENT_SHIFT_USER_IDS || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
));
const TEAM_EVENT_DAY_CODES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const TEAM_EVENT_DAY_LABELS = {
    sun: '日曜',
    mon: '月曜',
    tue: '火曜',
    wed: '水曜',
    thu: '木曜',
    fri: '金曜',
    sat: '土曜'
};
const TEAM_EVENT_ACTIVITIES = [
    '咎人8人同盟を周回',
    '防衛軍を1時間周回',
    'パニガルム・週課消化',
    'コインボス持ち寄り',
    'すごろくで遊ぶ',
    '季節イベント消化',
    '別ゲーで遊ぶ',
    '大富豪で遊ぶ',
    'チームかくれんぼ',
    'ドレアコンテスト',
    'チーム鬼ごっこ'
];

const officialFeedState = {
    bootstrapped: {
        x: false,
        dqx: false
    },
    seenKeys: {
        x: [],
        dqx: []
    }
};

const teamEventState = {
    postedWeekendKeys: [],
    proposals: {},
    participationHistory: []
};

let officialFeedTargetChannel = null;
let officialFeedPolling = false;
let teamEventTargetChannel = null;
let teamEventPosting = false;
let teamEventMaintenanceRunning = false;

function resolveXUsername(accountInput, fallbackUsername) {
    const fallback = (fallbackUsername || 'DQ_X').trim();
    const raw = (accountInput || '').trim();
    if (!raw) return fallback;

    const normalize = value => value.replace(/^@/, '').trim();
    const isValid = value => /^[A-Za-z0-9_]{1,15}$/.test(value);

    const direct = normalize(raw);
    if (isValid(direct)) return direct;

    try {
        const parsed = new URL(raw);
        const host = parsed.hostname.toLowerCase();
        const isXHost = host === 'x.com' || host === 'www.x.com' || host === 'twitter.com' || host === 'www.twitter.com';
        if (!isXHost) return fallback;

        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts.length === 0) return fallback;

        const username = normalize(parts[0]);
        return isValid(username) ? username : fallback;
    } catch (e) {
        return fallback;
    }
}

function resolveXProfileUrl(accountInput, username) {
    const fallback = `https://x.com/${username}`;
    const raw = (accountInput || '').trim();
    if (!raw) return fallback;

    try {
        const parsed = new URL(raw);
        const host = parsed.hostname.toLowerCase();
        const isXHost = host === 'x.com' || host === 'www.x.com' || host === 'twitter.com' || host === 'www.twitter.com';
        if (!isXHost) return fallback;
        return `${parsed.protocol}//${parsed.host}/${username}`;
    } catch (e) {
        return fallback;
    }
}

function parseXAccountInputs(rawValue) {
    if (!rawValue) return [];
    return rawValue
        .split(/[\r\n,\s]+/)
        .map(value => value.trim())
        .filter(Boolean);
}

function getXMonitorAccounts() {
    const dedup = new Set();
    const accounts = [];

    const addAccount = (input, fallbackUsername = 'DQ_X') => {
        const username = resolveXUsername(input, fallbackUsername);
        if (!username || dedup.has(username.toLowerCase())) return;
        dedup.add(username.toLowerCase());
        const profileUrl = resolveXProfileUrl(input, username);
        const timelineUrl = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(username)}`;
        accounts.push({ username, profileUrl, timelineUrl });
    };

    const configuredInputs = parseXAccountInputs(OFFICIAL_X_ACCOUNT_URLS);
    if (configuredInputs.length > 0) {
        configuredInputs.forEach(input => addAccount(input));
        return accounts;
    }

    if (OFFICIAL_X_ACCOUNT_URL) {
        addAccount(OFFICIAL_X_ACCOUNT_URL);
    }

    OFFICIAL_X_DEFAULT_ACCOUNT_URLS.forEach(input => addAccount(input));

    return accounts;
}

function loadOfficialFeedState() {
    if (!fs.existsSync(OFFICIAL_FEED_STATE_FILE)) return;

    try {
        const raw = fs.readFileSync(OFFICIAL_FEED_STATE_FILE, 'utf8');
        const data = JSON.parse(raw);

        if (data.bootstrapped && typeof data.bootstrapped === 'object') {
            if (typeof data.bootstrapped.x === 'boolean') {
                officialFeedState.bootstrapped.x = data.bootstrapped.x;
            }
            if (typeof data.bootstrapped.dqx === 'boolean') {
                officialFeedState.bootstrapped.dqx = data.bootstrapped.dqx;
            }
        } else if (typeof data.initialized === 'boolean') {
            // Backward compatibility with old state format.
            officialFeedState.bootstrapped.x = data.initialized;
            officialFeedState.bootstrapped.dqx = data.initialized;
        }

        if (data.seenKeys && typeof data.seenKeys === 'object') {
            if (Array.isArray(data.seenKeys.x)) {
                officialFeedState.seenKeys.x = data.seenKeys.x.slice(0, 200);
            }
            if (Array.isArray(data.seenKeys.dqx)) {
                officialFeedState.seenKeys.dqx = data.seenKeys.dqx.slice(0, 200);
            }
        }
    } catch (e) {
        console.error('Failed to load official feed state:', e.message);
    }
}

function saveOfficialFeedState() {
    fs.writeFileSync(OFFICIAL_FEED_STATE_FILE, JSON.stringify(officialFeedState, null, 2), 'utf8');
}

function loadTeamEventState() {
    if (!fs.existsSync(TEAM_EVENT_STATE_FILE)) return;

    try {
        const raw = fs.readFileSync(TEAM_EVENT_STATE_FILE, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.postedWeekendKeys)) {
            teamEventState.postedWeekendKeys = data.postedWeekendKeys.slice(0, 40);
        }
        if (data.proposals && typeof data.proposals === 'object') {
            teamEventState.proposals = {};
            for (const [weekendKey, record] of Object.entries(data.proposals)) {
                teamEventState.proposals[weekendKey] = normalizeTeamEventProposalRecord(record, weekendKey);
            }
        }
        if (Array.isArray(data.participationHistory)) {
            teamEventState.participationHistory = data.participationHistory
                .filter(entry => entry && typeof entry === 'object')
                .slice(-TEAM_EVENT_HISTORY_MAX);
        }
    } catch (e) {
        console.error('Failed to load team event state:', e.message);
    }
}

function normalizeUserIdList(list) {
    if (!Array.isArray(list)) return [];
    const dedup = new Set();
    const result = [];
    list.forEach(value => {
        if (typeof value !== 'string') return;
        const v = value.trim();
        if (!v || dedup.has(v)) return;
        dedup.add(v);
        result.push(v);
    });
    return result;
}

function isValidDateKey(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function normalizeTimeText(value, fallback = '21:00') {
    const text = String(value || '').trim();
    const match = text.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return fallback;
    const hh = parseInt(match[1], 10);
    const mm = parseInt(match[2], 10);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return fallback;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return fallback;
    return `${pad2(hh)}:${pad2(mm)}`;
}

function getTeamEventDayInfoFromDateKey(dateKey) {
    if (!isValidDateKey(dateKey)) {
        return { dayCode: 'sat', dayLabel: TEAM_EVENT_DAY_LABELS.sat };
    }
    const baseMs = Date.parse(`${dateKey}T00:00:00+09:00`);
    if (Number.isNaN(baseMs)) {
        return { dayCode: 'sat', dayLabel: TEAM_EVENT_DAY_LABELS.sat };
    }
    const jst = new Date(baseMs + 9 * 60 * 60 * 1000);
    const dayCode = TEAM_EVENT_DAY_CODES[jst.getUTCDay()] || 'sat';
    return {
        dayCode,
        dayLabel: TEAM_EVENT_DAY_LABELS[dayCode] || TEAM_EVENT_DAY_LABELS.sat
    };
}

function getTeamEventSlotKey(dateKey, timeText) {
    return `${dateKey} ${timeText}`;
}

function parseTeamEventSlotKey(slotKey) {
    const match = String(slotKey || '').trim().match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})$/);
    if (!match) return null;
    const dateKey = match[1];
    const time = normalizeTimeText(match[2], '');
    if (!time) return null;
    return {
        dateKey,
        time,
        slotKey: getTeamEventSlotKey(dateKey, time)
    };
}

function normalizeTeamEventAvailabilityMap(rawAvailability) {
    if (!rawAvailability || typeof rawAvailability !== 'object') return {};
    const result = {};

    for (const [userIdRaw, entryRaw] of Object.entries(rawAvailability)) {
        const userId = String(userIdRaw || '').trim();
        if (!userId) continue;
        const entry = entryRaw && typeof entryRaw === 'object' ? entryRaw : {};
        const slotSet = new Set();
        const slotsRaw = Array.isArray(entry.slots) ? entry.slots : [];
        slotsRaw.forEach(slot => {
            const parsed = parseTeamEventSlotKey(slot);
            if (!parsed) return;
            slotSet.add(getTeamEventSlotKey(parsed.dateKey, TEAM_EVENT_FIXED_TIME));
        });
        const slots = Array.from(slotSet).sort();
        const unknown = entry.unknown === true;
        const updatedAt = typeof entry.updatedAt === 'string' && entry.updatedAt
            ? entry.updatedAt
            : new Date().toISOString();
        if (slots.length === 0 && !unknown) continue;
        result[userId] = {
            slots,
            unknown,
            updatedAt
        };
    }

    return result;
}

function normalizeTeamEventSlotRecord(slotObj, fallbackDateKey, fallbackTime) {
    const safeDateKey = isValidDateKey(fallbackDateKey)
        ? fallbackDateKey
        : getJstDateKeyFromMs(Date.now());
    const hasDateKey = isValidDateKey(slotObj?.dateKey);
    let dateKey = hasDateKey ? slotObj.dateKey : safeDateKey;
    if (!hasDateKey && slotObj?.dayCode === 'sun') {
        dateKey = getJstDateKeyPlusDays(safeDateKey, 1);
    }
    const dayInfo = getTeamEventDayInfoFromDateKey(dateKey);
    const rawDayCode = typeof slotObj?.dayCode === 'string' ? slotObj.dayCode : '';
    const dayCode = TEAM_EVENT_DAY_CODES.includes(rawDayCode) ? rawDayCode : dayInfo.dayCode;
    const dayLabel = typeof slotObj?.dayLabel === 'string' && slotObj.dayLabel
        ? slotObj.dayLabel
        : (TEAM_EVENT_DAY_LABELS[dayCode] || dayInfo.dayLabel);
    return {
        dateKey,
        dayCode,
        dayLabel,
        time: normalizeTimeText(slotObj?.time, fallbackTime),
        votes: normalizeUserIdList(slotObj?.votes)
    };
}

function normalizeTeamEventAvailabilityCursorMap(rawCursorMap) {
    if (!rawCursorMap || typeof rawCursorMap !== 'object') return {};
    const result = {};
    for (const [userIdRaw, indexRaw] of Object.entries(rawCursorMap)) {
        const userId = String(userIdRaw || '').trim();
        if (!userId) continue;
        const idx = Number(indexRaw);
        if (!Number.isFinite(idx)) continue;
        const safeIdx = Math.max(0, Math.floor(idx));
        result[userId] = safeIdx;
    }
    return result;
}

function normalizeTeamEventProposalRecord(record, weekendKeyFallback = '') {
    const recordObj = (record && typeof record === 'object') ? record : {};
    const weekendKey = typeof recordObj.weekendKey === 'string' && recordObj.weekendKey
        ? recordObj.weekendKey
        : weekendKeyFallback;

    const primary = (recordObj.primary && typeof recordObj.primary === 'object') ? recordObj.primary : {};
    const backup = (recordObj.backup && typeof recordObj.backup === 'object') ? recordObj.backup : {};
    const attendance = (recordObj.attendance && typeof recordObj.attendance === 'object') ? recordObj.attendance : {};
    const finalized = (recordObj.finalized && typeof recordObj.finalized === 'object') ? recordObj.finalized : {};
    const reminders = (recordObj.reminders && typeof recordObj.reminders === 'object') ? recordObj.reminders : {};
    const availability = normalizeTeamEventAvailabilityMap(recordObj.availability);
    const availabilityCursor = normalizeTeamEventAvailabilityCursorMap(recordObj.availabilityCursor);
    const weekDateKeys = buildTeamEventWindowDateKeys(weekendKey);
    const defaultPrimaryDate = isValidDateKey(weekDateKeys[0]) ? weekDateKeys[0] : getJstDateKeyFromMs(Date.now());
    const defaultBackupDate = isValidDateKey(weekDateKeys[1]) ? weekDateKeys[1] : getJstDateKeyPlusDays(defaultPrimaryDate, 1);

    return {
        weekendKey,
        weekendRangeLabel: typeof recordObj.weekendRangeLabel === 'string' ? recordObj.weekendRangeLabel : '',
        channelId: typeof recordObj.channelId === 'string' ? recordObj.channelId : '',
        proposalMessageId: typeof recordObj.proposalMessageId === 'string' ? recordObj.proposalMessageId : '',
        availabilityMessageId: typeof recordObj.availabilityMessageId === 'string' ? recordObj.availabilityMessageId : '',
        createdAt: typeof recordObj.createdAt === 'string' ? recordObj.createdAt : new Date().toISOString(),
        activities: Array.isArray(recordObj.activities) ? recordObj.activities.slice(0, 10) : [],
        primary: normalizeTeamEventSlotRecord(primary, defaultPrimaryDate, TEAM_EVENT_FIXED_TIME),
        backup: normalizeTeamEventSlotRecord(backup, defaultBackupDate, TEAM_EVENT_FIXED_TIME),
        attendance: {
            join: normalizeUserIdList(attendance.join),
            maybe: normalizeUserIdList(attendance.maybe),
            absent: normalizeUserIdList(attendance.absent)
        },
        finalized: {
            slot: finalized.slot === 'backup' ? 'backup' : (finalized.slot === 'primary' ? 'primary' : null),
            eventDateKey: typeof finalized.eventDateKey === 'string' ? finalized.eventDateKey : null,
            eventLabel: typeof finalized.eventLabel === 'string' ? finalized.eventLabel : null,
            eventAt: typeof finalized.eventAt === 'string' ? finalized.eventAt : null,
            decidedAt: typeof finalized.decidedAt === 'string' ? finalized.decidedAt : null,
            summaryMessageId: typeof finalized.summaryMessageId === 'string' ? finalized.summaryMessageId : null
        },
        reminders: {
            d3Sent: reminders.d3Sent === true,
            h2Sent: reminders.h2Sent === true
        },
        availability,
        availabilityCursor
    };
}

function saveTeamEventState() {
    fs.writeFileSync(TEAM_EVENT_STATE_FILE, JSON.stringify(teamEventState, null, 2), 'utf8');
}

function getTeamEventProposalRecord(weekendKey) {
    if (!teamEventState.proposals || typeof teamEventState.proposals !== 'object') {
        teamEventState.proposals = {};
    }
    const record = teamEventState.proposals[weekendKey];
    return record ? normalizeTeamEventProposalRecord(record, weekendKey) : null;
}

function upsertTeamEventProposalRecord(record) {
    if (!record || !record.weekendKey) return;
    if (!teamEventState.proposals || typeof teamEventState.proposals !== 'object') {
        teamEventState.proposals = {};
    }
    teamEventState.proposals[record.weekendKey] = normalizeTeamEventProposalRecord(record, record.weekendKey);
}

function appendTeamEventHistory(entry) {
    if (!entry || typeof entry !== 'object') return;
    if (!Array.isArray(teamEventState.participationHistory)) {
        teamEventState.participationHistory = [];
    }
    teamEventState.participationHistory.push(entry);
    if (teamEventState.participationHistory.length > TEAM_EVENT_HISTORY_MAX) {
        teamEventState.participationHistory = teamEventState.participationHistory.slice(-TEAM_EVENT_HISTORY_MAX);
    }
}

function hasTeamEventPosted(weekendKey) {
    return teamEventState.postedWeekendKeys.includes(weekendKey);
}

function markTeamEventPosted(weekendKey) {
    if (teamEventState.postedWeekendKeys.includes(weekendKey)) return;
    teamEventState.postedWeekendKeys.push(weekendKey);
    if (teamEventState.postedWeekendKeys.length > 40) {
        teamEventState.postedWeekendKeys = teamEventState.postedWeekendKeys.slice(-40);
    }
}

function pad2(value) {
    return String(value).padStart(2, '0');
}

function getJstParts(now = new Date()) {
    const shifted = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        hour: shifted.getUTCHours(),
        dayOfWeek: shifted.getUTCDay()
    };
}

function getJstDateKeyFromMs(ms) {
    const shifted = new Date(ms + 9 * 60 * 60 * 1000);
    const year = shifted.getUTCFullYear();
    const month = pad2(shifted.getUTCMonth() + 1);
    const day = pad2(shifted.getUTCDate());
    return `${year}-${month}-${day}`;
}

function getCurrentJstMidnightMs(now = new Date()) {
    const parts = getJstParts(now);
    return Date.parse(
        `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T00:00:00+09:00`
    );
}

function getTeamEventBaseSaturdayMs() {
    const epochMs = Date.parse(`${TEAM_EVENT_EPOCH_SATURDAY}T00:00:00+09:00`);
    return Number.isNaN(epochMs) ? Date.parse('2026-03-07T00:00:00+09:00') : epochMs;
}

function getJstDateKeyPlusDays(baseDateKey, diffDays) {
    const baseMs = Date.parse(`${baseDateKey}T00:00:00+09:00`);
    if (Number.isNaN(baseMs)) return baseDateKey;
    return getJstDateKeyFromMs(baseMs + diffDays * 24 * 60 * 60 * 1000);
}

function getTeamEventDateTimeMs(weekendKey, dayCode, timeText, dateKeyOverride = '') {
    let eventDateKey = isValidDateKey(dateKeyOverride) ? dateKeyOverride : '';
    if (!eventDateKey) {
        eventDateKey = dayCode === 'sun'
            ? getJstDateKeyPlusDays(weekendKey, 1)
            : weekendKey;
    }
    const normalizedTime = normalizeTimeText(timeText, '21:00');
    const eventMs = Date.parse(`${eventDateKey}T${normalizedTime}:00+09:00`);
    return Number.isNaN(eventMs) ? null : eventMs;
}

function getTeamEventWeekStartDateKey(weekendKey) {
    if (!isValidDateKey(weekendKey)) return weekendKey;
    const baseMs = Date.parse(`${weekendKey}T00:00:00+09:00`);
    if (Number.isNaN(baseMs)) return weekendKey;
    const shifted = new Date(baseMs + 9 * 60 * 60 * 1000);
    const dayOfWeek = shifted.getUTCDay(); // 0:Sun ... 6:Sat
    const diffToMonday = (dayOfWeek + 6) % 7;
    return getJstDateKeyFromMs(baseMs - diffToMonday * 24 * 60 * 60 * 1000);
}

function buildTeamEventWindowDateKeys(weekendKey) {
    const weekStart = getTeamEventWeekStartDateKey(weekendKey);
    const result = [];
    for (let i = 0; i < TEAM_EVENT_AVAILABILITY_WEEK_DAYS; i += 1) {
        result.push(getJstDateKeyPlusDays(weekStart, i));
    }
    return result;
}

function buildTeamEventCandidateSlots(weekendKey) {
    return buildTeamEventWindowDateKeys(weekendKey).map(dateKey => {
        const dayInfo = getTeamEventDayInfoFromDateKey(dateKey);
        return {
            dateKey,
            dayCode: dayInfo.dayCode,
            dayLabel: dayInfo.dayLabel,
            time: TEAM_EVENT_FIXED_TIME,
            slotKey: getTeamEventSlotKey(dateKey, TEAM_EVENT_FIXED_TIME)
        };
    });
}

function getTeamEventWindowRangeLabel(weekendKey) {
    const dateKeys = buildTeamEventWindowDateKeys(weekendKey);
    const startKey = dateKeys[0] || weekendKey;
    const endKey = dateKeys[dateKeys.length - 1] || weekendKey;
    return `${startKey} - ${endKey} (JST)`;
}

function getTeamEventAvailableUserIdsForSlot(slotKey, availability) {
    const users = [];
    for (const [userId, entry] of Object.entries(availability || {})) {
        const slots = Array.isArray(entry?.slots) ? entry.slots : [];
        if (slots.includes(slotKey)) {
            users.push(userId);
        }
    }
    return users.sort();
}

function scoreTeamEventCandidateSlot(slot, weekendKey, availability, seed) {
    const availableUserIds = getTeamEventAvailableUserIdsForSlot(slot.slotKey, availability);
    const availableCount = availableUserIds.length;
    const historyScore = getHistoricalDayScore(slot.dayCode);
    const deterministic = hashString(`${weekendKey}|${slot.slotKey}|${seed}`);
    const score = availableCount + (historyScore * 0.1);
    return {
        ...slot,
        availableUserIds,
        score,
        availableCount,
        historyScore,
        deterministic
    };
}

function sortTeamEventScoredCandidates(a, b) {
    if (a.score !== b.score) return b.score - a.score;
    if (a.availableCount !== b.availableCount) return b.availableCount - a.availableCount;
    if (a.historyScore !== b.historyScore) return b.historyScore - a.historyScore;
    return a.deterministic - b.deterministic;
}

function getAnnouncementSaturdayMsJst(now = new Date()) {
    const leadDays = Number.isFinite(TEAM_EVENT_LEAD_DAYS) ? Math.max(0, TEAM_EVENT_LEAD_DAYS) : 3;
    const dayMs = 24 * 60 * 60 * 1000;
    const intervalMs = TEAM_EVENT_INTERVAL_DAYS * dayMs;
    const currentDayMs = getCurrentJstMidnightMs(now);
    const baseSaturdayMs = getTeamEventBaseSaturdayMs();
    const approxIndex = Math.floor((currentDayMs - baseSaturdayMs) / intervalMs);

    for (let offset = -1; offset <= 2; offset += 1) {
        const saturdayMs = baseSaturdayMs + (approxIndex + offset) * intervalMs;
        const announcementDayMs = saturdayMs - leadDays * dayMs;
        if (announcementDayMs === currentDayMs) {
            return saturdayMs;
        }
    }

    return null;
}

function hashString(input) {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function pickUniqueFromList(list, count, seed) {
    const pool = list.slice();
    const picked = [];
    let cursor = seed >>> 0;

    while (picked.length < count && pool.length > 0) {
        cursor = (Math.imul(cursor, 1664525) + 1013904223) >>> 0;
        const idx = cursor % pool.length;
        picked.push(pool.splice(idx, 1)[0]);
    }

    return picked;
}

function getHistoricalSlotScore(dayCode, timeText) {
    const list = Array.isArray(teamEventState.participationHistory)
        ? teamEventState.participationHistory
        : [];
    const filtered = list.filter(entry => (
        entry &&
        entry.dayCode === dayCode &&
        entry.time === timeText &&
        typeof entry.attendanceScore === 'number'
    ));
    if (filtered.length === 0) return 0;
    const total = filtered.reduce((acc, entry) => acc + entry.attendanceScore, 0);
    return total / filtered.length;
}

function getHistoricalDayScore(dayCode) {
    const list = Array.isArray(teamEventState.participationHistory)
        ? teamEventState.participationHistory
        : [];
    const filtered = list.filter(entry => (
        entry &&
        entry.dayCode === dayCode &&
        typeof entry.attendanceScore === 'number'
    ));
    if (filtered.length === 0) return 0;
    const total = filtered.reduce((acc, entry) => acc + entry.attendanceScore, 0);
    return total / filtered.length;
}

function pickBestTimeForDay(dayCode, seed) {
    let bestTime = null;
    let bestScore = -1;
    let bestCount = -1;

    TEAM_EVENT_TIME_SLOTS.forEach(slot => {
        const list = Array.isArray(teamEventState.participationHistory)
            ? teamEventState.participationHistory
            : [];
        const filtered = list.filter(entry => (
            entry &&
            entry.dayCode === dayCode &&
            entry.time === slot &&
            typeof entry.attendanceScore === 'number'
        ));
        const count = filtered.length;
        const score = count === 0
            ? 0
            : filtered.reduce((acc, entry) => acc + entry.attendanceScore, 0) / count;

        if (
            score > bestScore ||
            (score === bestScore && count > bestCount) ||
            (score === bestScore && count === bestCount && bestTime === null)
        ) {
            bestScore = score;
            bestCount = count;
            bestTime = slot;
        }
    });

    if (bestScore > 0 && bestTime) {
        return bestTime;
    }

    return TEAM_EVENT_TIME_SLOTS[seed % TEAM_EVENT_TIME_SLOTS.length];
}

function buildTeamEventProposal(weekendKey, availability = {}) {
    const seed = hashString(`team-event-${weekendKey}`);
    const candidateSlots = buildTeamEventCandidateSlots(weekendKey);
    const scored = candidateSlots
        .map(slot => scoreTeamEventCandidateSlot(slot, weekendKey, availability, seed))
        .sort(sortTeamEventScoredCandidates);
    const primaryCandidate = scored[0] || null;
    const backupCandidate = scored.find(item => item.slotKey !== primaryCandidate?.slotKey) || primaryCandidate;

    const activities = pickUniqueFromList(TEAM_EVENT_ACTIVITIES, 3, seed ^ 0x9e3779b9);
    const fallbackDateKeys = buildTeamEventWindowDateKeys(weekendKey);
    const primaryInfo = primaryCandidate || {
        dateKey: fallbackDateKeys[0] || weekendKey,
        dayCode: getTeamEventDayInfoFromDateKey(fallbackDateKeys[0] || weekendKey).dayCode,
        dayLabel: getTeamEventDayInfoFromDateKey(fallbackDateKeys[0] || weekendKey).dayLabel,
        time: TEAM_EVENT_FIXED_TIME,
        availableUserIds: []
    };
    const backupInfo = backupCandidate || {
        dateKey: fallbackDateKeys[1] || getJstDateKeyPlusDays(weekendKey, 1),
        dayCode: getTeamEventDayInfoFromDateKey(fallbackDateKeys[1] || getJstDateKeyPlusDays(weekendKey, 1)).dayCode,
        dayLabel: getTeamEventDayInfoFromDateKey(fallbackDateKeys[1] || getJstDateKeyPlusDays(weekendKey, 1)).dayLabel,
        time: TEAM_EVENT_FIXED_TIME,
        availableUserIds: []
    };

    return {
        weekendKey,
        weekendRangeLabel: getTeamEventWindowRangeLabel(weekendKey),
        primaryDateKey: primaryInfo.dateKey,
        primaryDayCode: primaryInfo.dayCode,
        primaryDay: primaryInfo.dayLabel,
        primaryTime: primaryInfo.time,
        backupDateKey: backupInfo.dateKey,
        backupDayCode: backupInfo.dayCode,
        backupDay: backupInfo.dayLabel,
        backupTime: backupInfo.time,
        primaryAvailableUserIds: Array.isArray(primaryInfo.availableUserIds) ? primaryInfo.availableUserIds : [],
        backupAvailableUserIds: Array.isArray(backupInfo.availableUserIds) ? backupInfo.availableUserIds : [],
        activities
    };
}

function canChannelEmbedLinks(channel) {
    const me = channel.guild?.members?.me || null;
    const perms = me ? channel.permissionsFor(me) : null;
    return perms ? perms.has(PermissionFlagsBits.EmbedLinks) : true;
}

function buildTeamEventActivitiesText(record) {
    if (!Array.isArray(record.activities) || record.activities.length === 0) {
        return '1. 未設定';
    }
    return record.activities.map((item, idx) => `${idx + 1}. ${item}`).join('\n');
}

function getTeamEventTallyDelayHoursSafe() {
    return Number.isFinite(TEAM_EVENT_TALLY_DELAY_HOURS)
        ? Math.max(0, TEAM_EVENT_TALLY_DELAY_HOURS)
        : 48;
}

function getTeamEventVoteCloseAtMs(record) {
    const createdAtMs = Date.parse(record?.createdAt || '');
    if (Number.isNaN(createdAtMs)) return null;
    const tallyDelayMs = getTeamEventTallyDelayHoursSafe() * 60 * 60 * 1000;
    return createdAtMs + tallyDelayMs;
}

function buildTeamEventVoteCloseLabel(record) {
    const closeAtMs = getTeamEventVoteCloseAtMs(record);
    if (closeAtMs === null) {
        return `${getTeamEventTallyDelayHoursSafe()}時間後`;
    }
    return `${formatDateForEmbed(new Date(closeAtMs))} JST`;
}

function buildTeamEventShiftPromptText(record) {
    const closeLabel = buildTeamEventVoteCloseLabel(record);
    return `対象週の月〜日で行ける日を複数選択してください（開催時刻は ${TEAM_EVENT_FIXED_TIME} 固定）。投票締切: ${closeLabel}`;
}

function buildTeamEventSlotLabelWithDate(record, slotRecord) {
    const dateKey = isValidDateKey(slotRecord?.dateKey)
        ? slotRecord.dateKey
        : (slotRecord.dayCode === 'sun'
            ? getJstDateKeyPlusDays(record.weekendKey, 1)
            : record.weekendKey);
    return `${dateKey} ${slotRecord.dayLabel} ${slotRecord.time}`;
}

function buildTeamEventTimeVoteText(record) {
    return [
        `第1候補: ${buildTeamEventSlotLabelWithDate(record, record.primary)} (${record.primary.votes.length}人)`,
        `第2候補: ${buildTeamEventSlotLabelWithDate(record, record.backup)} (${record.backup.votes.length}人)`
    ].join('\n');
}

function buildTeamEventAttendanceVoteText(record) {
    return [
        `参加: ${record.attendance.join.length}人`,
        `未定: ${record.attendance.maybe.length}人`,
        `不参加: ${record.attendance.absent.length}人`
    ].join('\n');
}

function buildTeamEventProposalPlainText(record) {
    const voteCloseLabel = buildTeamEventVoteCloseLabel(record);
    const lines = [
        '【チームイベント提案（隔週）】',
        `対象週: ${record.weekendRangeLabel}`,
        '',
        '候補日（可用日集計）',
        buildTeamEventTimeVoteText(record),
        '',
        '出欠（自動集計）',
        buildTeamEventAttendanceVoteText(record),
        '',
        'やること案',
        buildTeamEventActivitiesText(record),
        ''
    ];

    if (record.finalized.slot && record.finalized.eventLabel) {
        lines.push(`確定済み: ${record.finalized.eventLabel}`);
    } else {
        lines.push(`投票受付中: ${voteCloseLabel} まで（自動確定）`);
    }

    return lines.join('\n');
}

function buildTeamEventProposalEmbed(record) {
    const voteCloseLabel = buildTeamEventVoteCloseLabel(record);
    const statusText = record.finalized.slot && record.finalized.eventLabel
        ? `確定済み: ${record.finalized.eventLabel}`
        : `投票受付中: ${voteCloseLabel} まで（自動確定）`;

    return new EmbedBuilder()
        .setColor(record.finalized.slot ? 0x2ECC71 : 0xF39C12)
        .setTitle('チームイベント提案（隔週）')
        .setDescription(`対象週: ${record.weekendRangeLabel}`)
        .addFields(
            { name: '候補日（可用日集計）', value: buildTeamEventTimeVoteText(record) },
            { name: '出欠（自動集計）', value: buildTeamEventAttendanceVoteText(record) },
            { name: 'やること案', value: buildTeamEventActivitiesText(record) },
            { name: '状態', value: statusText }
        );
}

function buildTeamEventButtonCustomId(weekendKey, category, value) {
    return `${TEAM_EVENT_BUTTON_PREFIX}|${weekendKey}|${category}|${value}`;
}

function buildTeamEventProposalComponents(record) {
    const disabled = !!record.finalized.slot;
    const attendanceRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(buildTeamEventButtonCustomId(record.weekendKey, 'attendance', 'join'))
            .setLabel(`参加 ${record.attendance.join.length}`)
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(buildTeamEventButtonCustomId(record.weekendKey, 'attendance', 'maybe'))
            .setLabel(`未定 ${record.attendance.maybe.length}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(buildTeamEventButtonCustomId(record.weekendKey, 'attendance', 'absent'))
            .setLabel(`不参加 ${record.attendance.absent.length}`)
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled)
    );
    return [attendanceRow];
}

function createTeamEventProposalRecord(channelId, proposal) {
    return normalizeTeamEventProposalRecord({
        weekendKey: proposal.weekendKey,
        weekendRangeLabel: proposal.weekendRangeLabel,
        channelId,
        proposalMessageId: '',
        availabilityMessageId: '',
        createdAt: new Date().toISOString(),
        activities: Array.isArray(proposal.activities) ? proposal.activities.slice(0, 10) : [],
        primary: {
            dateKey: proposal.primaryDateKey || proposal.weekendKey,
            dayCode: TEAM_EVENT_DAY_CODES.includes(proposal.primaryDayCode) ? proposal.primaryDayCode : 'sat',
            dayLabel: proposal.primaryDay || TEAM_EVENT_DAY_LABELS.sat,
            time: proposal.primaryTime || '21:00',
            votes: []
        },
        backup: {
            dateKey: proposal.backupDateKey || getJstDateKeyPlusDays(proposal.weekendKey, 1),
            dayCode: TEAM_EVENT_DAY_CODES.includes(proposal.backupDayCode) ? proposal.backupDayCode : 'sun',
            dayLabel: proposal.backupDay || TEAM_EVENT_DAY_LABELS.sun,
            time: proposal.backupTime || TEAM_EVENT_FIXED_TIME,
            votes: []
        },
        attendance: {
            join: [],
            maybe: [],
            absent: []
        },
        finalized: {
            slot: null,
            eventDateKey: null,
            eventLabel: null,
            eventAt: null,
            decidedAt: null,
            summaryMessageId: null
        },
        reminders: {
            d3Sent: false,
            h2Sent: false
        },
        availability: {},
        availabilityCursor: {}
    }, proposal.weekendKey);
}

function parseTeamEventButtonCustomId(customId) {
    const parts = String(customId || '').split('|');
    if (parts.length !== 4) return null;
    if (parts[0] !== TEAM_EVENT_BUTTON_PREFIX) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parts[1])) return null;
    if (parts[2] !== 'slot' && parts[2] !== 'attendance') return null;
    if (parts[2] === 'slot' && !['primary', 'backup'].includes(parts[3])) return null;
    if (parts[2] === 'attendance' && !['join', 'maybe', 'absent'].includes(parts[3])) return null;
    return {
        weekendKey: parts[1],
        category: parts[2],
        value: parts[3]
    };
}

function assignTeamEventVoteSingleChoice(record, category, value, userId) {
    const removeUser = list => {
        const idx = list.indexOf(userId);
        if (idx >= 0) list.splice(idx, 1);
    };
    const addUser = list => {
        if (!list.includes(userId)) list.push(userId);
    };

    if (category === 'slot') {
        return false;
    }

    if (category === 'attendance') {
        const wasJoin = record.attendance.join.includes(userId);
        const wasMaybe = record.attendance.maybe.includes(userId);
        const wasAbsent = record.attendance.absent.includes(userId);
        removeUser(record.attendance.join);
        removeUser(record.attendance.maybe);
        removeUser(record.attendance.absent);
        if (
            (value === 'join' && wasJoin) ||
            (value === 'maybe' && wasMaybe) ||
            (value === 'absent' && wasAbsent)
        ) {
            // Pressing the same button again cancels selection in this category.
            return true;
        }
        if (value === 'join') {
            addUser(record.attendance.join);
            return true;
        }
        if (value === 'maybe') {
            addUser(record.attendance.maybe);
            return true;
        }
        if (value === 'absent') {
            addUser(record.attendance.absent);
            return true;
        }
        return false;
    }

    return false;
}

function decideTeamEventFinalSlot(record) {
    const primaryVotes = record.primary.votes.length;
    const backupVotes = record.backup.votes.length;
    if (primaryVotes !== backupVotes) {
        return primaryVotes > backupVotes ? 'primary' : 'backup';
    }

    const primaryHistory = getHistoricalDayScore(record.primary.dayCode);
    const backupHistory = getHistoricalDayScore(record.backup.dayCode);
    if (primaryHistory !== backupHistory) {
        return primaryHistory >= backupHistory ? 'primary' : 'backup';
    }

    return 'primary';
}

function getTeamEventSlotRecord(record, slot) {
    return slot === 'backup' ? record.backup : record.primary;
}

function buildTeamEventSlotVoteSummary(record) {
    return [
        `第1候補 ${buildTeamEventSlotLabelWithDate(record, record.primary)}: ${record.primary.votes.length}人`,
        `第2候補 ${buildTeamEventSlotLabelWithDate(record, record.backup)}: ${record.backup.votes.length}人`
    ].join('\n');
}

function getTeamEventAttendanceScore(record) {
    return record.attendance.join.length + record.attendance.maybe.length * 0.5;
}

function getLatestOpenTeamEventProposalRecord() {
    const entries = Object.entries(teamEventState.proposals || {})
        .map(([weekendKey, record]) => normalizeTeamEventProposalRecord(record, weekendKey))
        .filter(record => !record.finalized.slot)
        .sort((a, b) => b.weekendKey.localeCompare(a.weekendKey));
    return entries[0] || null;
}

function getTeamEventSlotKeyFromRecordSlot(record, slotRecord) {
    const dateKey = isValidDateKey(slotRecord?.dateKey)
        ? slotRecord.dateKey
        : (slotRecord?.dayCode === 'sun'
            ? getJstDateKeyPlusDays(record.weekendKey, 1)
            : record.weekendKey);
    const time = normalizeTimeText(slotRecord?.time, '21:00');
    return getTeamEventSlotKey(dateKey, time);
}

function buildTeamEventCandidateSlotKeySet(weekendKey) {
    return new Set(buildTeamEventCandidateSlots(weekendKey).map(slot => slot.slotKey));
}

function ensureTeamEventAvailabilityEntry(record, userId) {
    if (!record.availability || typeof record.availability !== 'object') {
        record.availability = {};
    }
    const existing = record.availability[userId] && typeof record.availability[userId] === 'object'
        ? record.availability[userId]
        : {};
    const slots = Array.isArray(existing.slots) ? existing.slots : [];
    const entry = {
        slots: Array.from(new Set(slots.map(value => String(value || '').trim()).filter(Boolean))).sort(),
        unknown: existing.unknown === true,
        updatedAt: typeof existing.updatedAt === 'string' && existing.updatedAt
            ? existing.updatedAt
            : new Date().toISOString()
    };
    record.availability[userId] = entry;
    return entry;
}

function cleanupTeamEventAvailabilityEntry(record, userId) {
    if (!record.availability || typeof record.availability !== 'object') return;
    const entry = record.availability[userId];
    if (!entry || typeof entry !== 'object') {
        delete record.availability[userId];
        return;
    }
    const slots = Array.isArray(entry.slots) ? entry.slots : [];
    if (slots.length === 0 && entry.unknown !== true) {
        delete record.availability[userId];
    }
}

function recalculateTeamEventProposalSlots(record) {
    const proposal = buildTeamEventProposal(record.weekendKey, record.availability || {});
    const prevPrimaryKey = getTeamEventSlotKeyFromRecordSlot(record, record.primary);
    const prevBackupKey = getTeamEventSlotKeyFromRecordSlot(record, record.backup);
    const prevPrimaryVotes = JSON.stringify(normalizeUserIdList(record.primary.votes));
    const prevBackupVotes = JSON.stringify(normalizeUserIdList(record.backup.votes));
    const nextPrimaryKey = getTeamEventSlotKey(proposal.primaryDateKey, proposal.primaryTime);
    const nextBackupKey = getTeamEventSlotKey(proposal.backupDateKey, proposal.backupTime);
    const slotChanged = prevPrimaryKey !== nextPrimaryKey || prevBackupKey !== nextBackupKey;

    record.weekendRangeLabel = proposal.weekendRangeLabel;
    record.primary.dateKey = proposal.primaryDateKey;
    record.primary.dayCode = proposal.primaryDayCode;
    record.primary.dayLabel = proposal.primaryDay;
    record.primary.time = proposal.primaryTime;
    record.primary.votes = Array.isArray(proposal.primaryAvailableUserIds)
        ? proposal.primaryAvailableUserIds.slice()
        : [];
    record.backup.dateKey = proposal.backupDateKey;
    record.backup.dayCode = proposal.backupDayCode;
    record.backup.dayLabel = proposal.backupDay;
    record.backup.time = proposal.backupTime;
    record.backup.votes = Array.isArray(proposal.backupAvailableUserIds)
        ? proposal.backupAvailableUserIds.slice()
        : [];
    if (Array.isArray(proposal.activities) && proposal.activities.length > 0) {
        record.activities = proposal.activities.slice(0, 10);
    }
    const nextPrimaryVotes = JSON.stringify(normalizeUserIdList(record.primary.votes));
    const nextBackupVotes = JSON.stringify(normalizeUserIdList(record.backup.votes));
    const voteCountsChanged = prevPrimaryVotes !== nextPrimaryVotes || prevBackupVotes !== nextBackupVotes;

    return {
        slotChanged,
        voteCountsChanged,
        primarySlotKey: nextPrimaryKey,
        backupSlotKey: nextBackupKey
    };
}

function buildTeamEventAvailabilityButtonCustomId(weekendKey, category, value) {
    return `${TEAM_EVENT_AVAIL_BUTTON_PREFIX}|${weekendKey}|${category}|${value}`;
}

function parseTeamEventAvailabilityButtonCustomId(customId) {
    const parts = String(customId || '').split('|');
    if (parts.length !== 4) return null;
    if (parts[0] !== TEAM_EVENT_AVAIL_BUTTON_PREFIX) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parts[1])) return null;
    const category = parts[2];
    const value = parts[3];
    if (category === 'day') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    } else if (category === 'cmd') {
        if (!['list', 'clear', 'unknown', 'known'].includes(value)) return null;
    } else {
        return null;
    }
    return {
        weekendKey: parts[1],
        category,
        value
    };
}

function getTeamEventAvailabilityDateCounts(record) {
    const dateKeys = buildTeamEventWindowDateKeys(record.weekendKey);
    const counts = {};
    dateKeys.forEach(dateKey => {
        counts[dateKey] = 0;
    });
    const validDateSet = new Set(dateKeys);

    for (const entry of Object.values(record.availability || {})) {
        const slots = Array.isArray(entry?.slots) ? entry.slots : [];
        const dateSet = new Set();
        slots.forEach(slotKey => {
            const parsed = parseTeamEventSlotKey(slotKey);
            if (!parsed) return;
            if (validDateSet.has(parsed.dateKey)) {
                dateSet.add(parsed.dateKey);
            }
        });
        dateSet.forEach(dateKey => {
            counts[dateKey] += 1;
        });
    }

    return counts;
}

function getTeamEventAvailabilityDateLabel(dateKey) {
    const info = getTeamEventDayInfoFromDateKey(dateKey);
    const [yyyy, mm, dd] = dateKey.split('-');
    const shortDay = info.dayLabel.replace('曜', '');
    return `${mm}/${dd}(${shortDay})`;
}

function buildTeamEventAvailabilityDateButtonLabel(dateKey, count) {
    return `${getTeamEventAvailabilityDateLabel(dateKey)} ${count}`;
}

function getTeamEventAvailabilityDateSlotKey(dateKey) {
    return getTeamEventSlotKey(dateKey, TEAM_EVENT_FIXED_TIME);
}

function buildTeamEventAvailabilityPanelPlainText(record) {
    const dateCounts = getTeamEventAvailabilityDateCounts(record);
    const dateLines = buildTeamEventWindowDateKeys(record.weekendKey)
        .map(dateKey => `${getTeamEventAvailabilityDateLabel(dateKey)}: ${dateCounts[dateKey] || 0}人`);
    return [
        '【可用日登録パネル】',
        `対象週: ${record.weekendRangeLabel}`,
        `投票締切: ${buildTeamEventVoteCloseLabel(record)}`,
        `開催時刻: ${TEAM_EVENT_FIXED_TIME} 固定`,
        '',
        buildTeamEventShiftPromptText(record),
        '',
        '日別集計:',
        ...dateLines,
        '',
        '使い方:',
        '1) 月〜日のボタンを押して行ける日を複数選択',
        '2) 同じ日付をもう一度押すと解除',
        '3) 「登録一覧」で自分の登録を確認',
        '4) 「未確定/確定」ボタンでシフト状態を切替'
    ].join('\n');
}

function buildTeamEventAvailabilityPanelEmbed(record) {
    const dateCounts = getTeamEventAvailabilityDateCounts(record);
    const dateSummary = buildTeamEventWindowDateKeys(record.weekendKey)
        .map(dateKey => `${getTeamEventAvailabilityDateLabel(dateKey)}: ${dateCounts[dateKey] || 0}人`)
        .join('\n');
    return new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('可用日登録パネル')
        .setDescription([
            `対象週: ${record.weekendRangeLabel}`,
            `投票締切: ${buildTeamEventVoteCloseLabel(record)}`,
            `開催時刻: ${TEAM_EVENT_FIXED_TIME} 固定`,
            '',
            '日別集計:',
            dateSummary,
            '',
            '月〜日のボタンを押して行ける日を複数選択できます。'
        ].join('\n'));
}

function buildTeamEventAvailabilityPanelComponents(record) {
    const disabled = !!record.finalized.slot;
    const dateCounts = getTeamEventAvailabilityDateCounts(record);
    const dateRows = [];
    const dateKeys = buildTeamEventWindowDateKeys(record.weekendKey);
    for (let i = 0; i < dateKeys.length; i += 5) {
        const row = new ActionRowBuilder();
        dateKeys.slice(i, i + 5).forEach(dateKey => {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(buildTeamEventAvailabilityButtonCustomId(record.weekendKey, 'day', dateKey))
                    .setLabel(buildTeamEventAvailabilityDateButtonLabel(dateKey, dateCounts[dateKey] || 0))
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled)
            );
        });
        dateRows.push(row);
    }

    const commandRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(buildTeamEventAvailabilityButtonCustomId(record.weekendKey, 'cmd', 'list'))
            .setLabel('登録一覧')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(buildTeamEventAvailabilityButtonCustomId(record.weekendKey, 'cmd', 'clear'))
            .setLabel('全削除')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(buildTeamEventAvailabilityButtonCustomId(record.weekendKey, 'cmd', 'unknown'))
            .setLabel('未確定')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(buildTeamEventAvailabilityButtonCustomId(record.weekendKey, 'cmd', 'known'))
            .setLabel('確定')
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled)
    );

    return [...dateRows, commandRow];
}

function buildTeamEventAvailabilityListForUser(record, userId) {
    const entry = record.availability?.[userId];
    const slots = Array.isArray(entry?.slots) ? entry.slots : [];
    const unknown = entry?.unknown === true;
    const lines = [];
    lines.push(`対象週: ${record.weekendRangeLabel}`);
    if (slots.length === 0) {
        lines.push('登録日時: なし');
    } else {
        const uniqueDates = Array.from(new Set(
            slots
                .map(slot => parseTeamEventSlotKey(slot))
                .filter(parsed => parsed && isValidDateKey(parsed.dateKey))
                .map(parsed => parsed.dateKey)
        )).sort();
        lines.push(`登録日 (${TEAM_EVENT_FIXED_TIME} 固定):`);
        uniqueDates.forEach((dateKey, idx) => lines.push(`${idx + 1}. ${getTeamEventAvailabilityDateLabel(dateKey)} (${dateKey})`));
    }
    lines.push(`シフト: ${unknown ? '未確定' : '確定/通常'}`);
    return lines.join('\n');
}

function hasSeenOfficialKey(source, key) {
    if (!officialFeedState.seenKeys[source]) {
        officialFeedState.seenKeys[source] = [];
    }
    return officialFeedState.seenKeys[source].includes(key);
}

function markOfficialKeySeen(source, key) {
    if (!officialFeedState.seenKeys[source]) {
        officialFeedState.seenKeys[source] = [];
    }
    if (!officialFeedState.seenKeys[source].includes(key)) {
        officialFeedState.seenKeys[source].push(key);
        if (officialFeedState.seenKeys[source].length > 200) {
            officialFeedState.seenKeys[source].splice(0, officialFeedState.seenKeys[source].length - 200);
        }
    }
}

function decodeHtmlEntities(text) {
    if (!text) return '';

    return text
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x2F;/gi, '/')
        .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
        .replace(/\s+/g, ' ')
        .trim();
}

function fetchText(url, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DiscordShinBot/1.0',
                ...extraHeaders
            }
        }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = new URL(res.headers.location, url).toString();
                res.resume();
                resolve(fetchText(redirectUrl, extraHeaders));
                return;
            }

            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                return;
            }

            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        });

        req.setTimeout(15000, () => req.destroy(new Error(`Timeout for ${url}`)));
        req.on('error', reject);
    });
}

async function fetchJson(url, extraHeaders = {}) {
    const raw = await fetchText(url, extraHeaders);
    return JSON.parse(raw);
}

function buildQueryString(params) {
    return Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
}

function fetchTextViaCurl(url) {
    return new Promise((resolve, reject) => {
        execFile(
            'curl',
            ['-L', '-s', '-A', 'Mozilla/5.0', url],
            { timeout: 20000, maxBuffer: 10 * 1024 * 1024 },
            (error, stdout) => {
                if (error) {
                    reject(new Error(`curl failed for ${url}: ${error.message}`));
                    return;
                }
                if (!stdout) {
                    reject(new Error(`curl empty response for ${url}`));
                    return;
                }
                resolve(stdout);
            }
        );
    });
}

function parseDqxNewsItems(html) {
    const items = [];
    const rowRegex = /<tr>\s*<td class="news"[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td class="date"><div>([^<]+)<\/div><\/td>\s*<\/tr>/g;
    let match;

    while ((match = rowRegex.exec(html)) !== null) {
        const newsCellHtml = match[1];
        const dateText = (match[2] || '').trim();
        const linkMatch = newsCellHtml.match(/<a class="newsListLnk" href="([^"]+)">([\s\S]*?)<\/a>/);
        if (!linkMatch) continue;

        const categoryMatch = newsCellHtml.match(/<b class="news-subject-category">([\s\S]*?)<\/b>/);
        const category = categoryMatch
            ? decodeHtmlEntities(categoryMatch[1].replace(/<[^>]*>/g, ''))
            : '';

        const href = linkMatch[1].trim();
        const titleText = decodeHtmlEntities(linkMatch[2].replace(/<[^>]*>/g, ''));
        const title = category ? `${category} ${titleText}` : titleText;
        const url = href.startsWith('http') ? href : `https://hiroba.dqx.jp${href}`;
        const key = href.replace(/\/+$/, '');
        const publishedAt = new Date(`${dateText.replace(' ', 'T')}:00+09:00`);

        items.push({
            source: 'dqx',
            key,
            title,
            url,
            publishedAt: Number.isNaN(publishedAt.getTime()) ? null : publishedAt
        });
    }

    return items.sort((a, b) => {
        const aTime = a.publishedAt ? a.publishedAt.getTime() : 0;
        const bTime = b.publishedAt ? b.publishedAt.getTime() : 0;
        return aTime - bTime;
    });
}

function parseDqxTopicsItems(html) {
    const items = [];
    const linkRegex = /<a class="newsListLnk" href="([^"]+)">([\s\S]*?)<\/a>/g;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1].trim();
        if (!href.includes('/sc/topics/detail/')) continue;

        const rawTitle = decodeHtmlEntities(match[2].replace(/<[^>]*>/g, ''));
        if (!rawTitle) continue;

        const url = href.startsWith('http') ? href : `https://hiroba.dqx.jp${href}`;
        const key = href.replace(/\/+$/, '');
        const dateMatch = rawTitle.match(/[（(]\s*(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s*更新)?\s*[）)]/);
        const publishedAt = dateMatch
            ? new Date(`${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}T00:00:00+09:00`)
            : null;
        const title = `[トピックス] ${rawTitle}`;

        items.push({
            source: 'dqx',
            key,
            title,
            url,
            publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null
        });
    }

    const dedup = new Set();
    return items
        .filter(item => {
            if (dedup.has(item.key)) return false;
            dedup.add(item.key);
            return true;
        })
        .sort((a, b) => {
            const aTime = a.publishedAt ? a.publishedAt.getTime() : 0;
            const bTime = b.publishedAt ? b.publishedAt.getTime() : 0;
            return aTime - bTime;
        });
}

function parseXTimelineItems(html, account) {
    const items = [];
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!nextDataMatch) return items;

    let data;
    try {
        data = JSON.parse(nextDataMatch[1]);
    } catch (e) {
        console.error('Failed to parse X timeline data:', e.message);
        return items;
    }

    const entries = data?.props?.pageProps?.timeline?.entries;
    if (!Array.isArray(entries)) return items;

    entries.forEach(entry => {
        if (entry?.type !== 'tweet') return;

        const tweet = entry?.content?.tweet;
        if (!tweet || !tweet.id_str) return;

        const rawText = (typeof tweet.full_text === 'string' && tweet.full_text.trim())
            ? tweet.full_text
            : (tweet.text || '');
        const cleanText = rawText.replace(/\s+/g, ' ').trim();
        const publishedAt = tweet.created_at ? new Date(tweet.created_at) : null;

        items.push({
            source: 'x',
            key: tweet.id_str,
            title: cleanText || '(no text)',
            url: tweet.permalink ? `https://x.com${tweet.permalink}` : `${account.profileUrl}/status/${tweet.id_str}`,
            publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null
        });
    });

    return items.sort((a, b) => {
        const aTime = a.publishedAt ? a.publishedAt.getTime() : 0;
        const bTime = b.publishedAt ? b.publishedAt.getTime() : 0;
        return aTime - bTime;
    });
}

async function fetchXApiItemsForAccount(account, bearerToken) {
    const authHeaders = {
        Authorization: `Bearer ${bearerToken}`
    };

    const userUrl = `${OFFICIAL_X_API_BASE_URL}/users/by/username/${encodeURIComponent(account.username)}?${buildQueryString({
        'user.fields': 'id'
    })}`;

    const userResp = await fetchJson(userUrl, authHeaders);
    const userId = userResp?.data?.id;
    if (!userId) {
        throw new Error(`X API user lookup failed for ${account.username}`);
    }

    const tweetsUrl = `${OFFICIAL_X_API_BASE_URL}/users/${userId}/tweets?${buildQueryString({
        max_results: 5,
        exclude: 'retweets,replies',
        'tweet.fields': 'created_at'
    })}`;

    const tweetsResp = await fetchJson(tweetsUrl, authHeaders);
    const tweets = Array.isArray(tweetsResp?.data) ? tweetsResp.data : [];

    return tweets
        .map(tweet => {
            const text = (tweet?.text || '').replace(/\s+/g, ' ').trim();
            const publishedAt = tweet?.created_at ? new Date(tweet.created_at) : null;
            return {
                source: 'x',
                key: tweet.id,
                title: text || '(no text)',
                url: `${account.profileUrl}/status/${tweet.id}`,
                publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null
            };
        })
        .filter(item => !!item.key)
        .sort((a, b) => {
            const aTime = a.publishedAt ? a.publishedAt.getTime() : 0;
            const bTime = b.publishedAt ? b.publishedAt.getTime() : 0;
            return aTime - bTime;
        });
}

async function fetchXApiItems() {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) return [];

    const allItems = [];
    const accounts = getXMonitorAccounts();

    for (const account of accounts) {
        try {
            const items = await fetchXApiItemsForAccount(account, bearerToken);
            allItems.push(...items);
        } catch (e) {
            console.error(`Official X API fetch failed for ${account.username}:`, e.message);
        }
    }

    return allItems.sort((a, b) => {
        const aTime = a.publishedAt ? a.publishedAt.getTime() : 0;
        const bTime = b.publishedAt ? b.publishedAt.getTime() : 0;
        return aTime - bTime;
    });
}

function formatDateForEmbed(date) {
    if (!date) return 'N/A';
    return new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(date);
}

async function resolveOfficialFeedTargetChannel(readyClient) {
    const isSendableTextChannel = (channel, member) => {
        if (!channel || !channel.isTextBased()) return false;

        // Ignore voice/stage/forum; use only standard text/announcement channels.
        if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
            return false;
        }

        const perms = channel.permissionsFor(member);
        return !!(
            perms &&
            perms.has(PermissionFlagsBits.ViewChannel) &&
            perms.has(PermissionFlagsBits.SendMessages)
        );
    };

    try {
        const targetAsChannel = await readyClient.channels.fetch(OFFICIAL_TARGET_ID);
        if (targetAsChannel && targetAsChannel.isTextBased() && targetAsChannel.isSendable()) {
            return targetAsChannel;
        }
    } catch (e) {
        // ignore
    }

    try {
        const guild = await readyClient.guilds.fetch(OFFICIAL_TARGET_ID);
        await guild.channels.fetch();
        const me = guild.members.me || await guild.members.fetchMe();

        if (guild.systemChannel && isSendableTextChannel(guild.systemChannel, me)) {
            return guild.systemChannel;
        }

        const preferredNames = ['bot-log', 'status-alerts', 'daily-digest', 'weekly-digest', '情報共有', '雑談'];
        let fallbackChannel = null;

        for (const name of preferredNames) {
            const found = guild.channels.cache.find(ch => ch.name === name && isSendableTextChannel(ch, me));
            if (found) {
                fallbackChannel = found;
                break;
            }
        }

        if (!fallbackChannel) {
            fallbackChannel = guild.channels.cache
                .filter(ch => isSendableTextChannel(ch, me))
                .sort((a, b) => a.position - b.position)[0] || null;
        }

        return fallbackChannel || null;
    } catch (e) {
        console.error('Failed to resolve official feed target:', e.message);
        return null;
    }
}

async function resolveTeamEventTargetChannel(readyClient) {
    if (TEAM_EVENT_TARGET_CHANNEL_ID) {
        try {
            const direct = await readyClient.channels.fetch(TEAM_EVENT_TARGET_CHANNEL_ID);
            if (direct && direct.isTextBased() && direct.isSendable()) {
                return direct;
            }
        } catch (e) {
            console.error('Failed to resolve team event target channel:', e.message);
        }
    }

    return resolveOfficialFeedTargetChannel(readyClient);
}

async function sendTeamEventProposal(channel, record) {
    const components = buildTeamEventProposalComponents(record);
    if (!canChannelEmbedLinks(channel)) {
        return channel.send({
            content: buildTeamEventProposalPlainText(record),
            components
        });
    }

    return channel.send({
        embeds: [buildTeamEventProposalEmbed(record)],
        components
    });
}

function buildTeamEventProposalEditPayload(channel, record) {
    const components = buildTeamEventProposalComponents(record);
    if (!canChannelEmbedLinks(channel)) {
        return {
            content: buildTeamEventProposalPlainText(record),
            embeds: [],
            components
        };
    }

    return {
        embeds: [buildTeamEventProposalEmbed(record)],
        components
    };
}

async function sendTeamEventAvailabilityPanel(channel, record) {
    const components = buildTeamEventAvailabilityPanelComponents(record);
    const promptText = buildTeamEventShiftPromptText(record);
    if (!canChannelEmbedLinks(channel)) {
        return channel.send({
            content: buildTeamEventAvailabilityPanelPlainText(record),
            components
        });
    }

    return channel.send({
        content: promptText,
        embeds: [buildTeamEventAvailabilityPanelEmbed(record)],
        components
    });
}

function buildTeamEventAvailabilityPanelEditPayload(channel, record) {
    const components = buildTeamEventAvailabilityPanelComponents(record);
    const promptText = buildTeamEventShiftPromptText(record);
    if (!canChannelEmbedLinks(channel)) {
        return {
            content: buildTeamEventAvailabilityPanelPlainText(record),
            embeds: [],
            components
        };
    }

    return {
        content: promptText,
        embeds: [buildTeamEventAvailabilityPanelEmbed(record)],
        components
    };
}

async function resolveTeamEventChannelById(readyClient, channelId) {
    if (!channelId) return null;
    try {
        const channel = await readyClient.channels.fetch(channelId);
        if (channel && channel.isTextBased() && channel.isSendable()) {
            return channel;
        }
    } catch (e) {
        console.error('Failed to resolve team event channel by id:', e.message);
    }
    return null;
}

async function updateTeamEventProposalMessage(readyClient, record) {
    if (!record.channelId || !record.proposalMessageId) return;
    const channel = await resolveTeamEventChannelById(readyClient, record.channelId);
    if (!channel || !channel.messages || typeof channel.messages.fetch !== 'function') return;

    try {
        const message = await channel.messages.fetch(record.proposalMessageId);
        if (!message) return;
        await message.edit(buildTeamEventProposalEditPayload(channel, record));
    } catch (e) {
        console.error(`Failed to update team event proposal message: ${record.weekendKey}`, e.message);
    }
}

async function updateTeamEventAvailabilityPanelMessage(readyClient, record) {
    if (!record.channelId || !record.availabilityMessageId) return;
    const channel = await resolveTeamEventChannelById(readyClient, record.channelId);
    if (!channel || !channel.messages || typeof channel.messages.fetch !== 'function') return;

    try {
        const message = await channel.messages.fetch(record.availabilityMessageId);
        if (!message) return;
        await message.edit(buildTeamEventAvailabilityPanelEditPayload(channel, record));
    } catch (e) {
        console.error(`Failed to update team event availability panel: ${record.weekendKey}`, e.message);
    }
}

async function sendTeamEventFinalizedSummary(channel, record) {
    const slotRecord = getTeamEventSlotRecord(record, record.finalized.slot);
    const finalizedLabel = record.finalized.eventLabel || `${slotRecord.dayLabel} ${slotRecord.time} (JST)`;
    const voteSummary = buildTeamEventSlotVoteSummary(record);
    const attendanceSummary = buildTeamEventAttendanceVoteText(record);
    const activitiesText = buildTeamEventActivitiesText(record);

    if (!canChannelEmbedLinks(channel)) {
        const text = [
            '【チームイベント日時確定】',
            `対象週: ${record.weekendRangeLabel}`,
            `確定日時: ${finalizedLabel}`,
            '',
            '可用日集計結果',
            voteSummary,
            '',
            '出欠（自動集計）',
            attendanceSummary,
            '',
            'やること案',
            activitiesText
        ].join('\n');
        return channel.send(text);
    }

    const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('チームイベント日時確定')
        .setDescription(`対象週: ${record.weekendRangeLabel}`)
        .addFields(
            { name: '確定日時', value: finalizedLabel },
            { name: '可用日集計結果', value: voteSummary },
            { name: '出欠（自動集計）', value: attendanceSummary },
            { name: 'やること案', value: activitiesText }
        );

    return channel.send({ embeds: [embed] });
}

async function sendTeamEventReminder(channel, record, reminderType) {
    const reminderDays = Number.isFinite(TEAM_EVENT_REMINDER_DAYS_BEFORE)
        ? Math.max(0, TEAM_EVENT_REMINDER_DAYS_BEFORE)
        : 3;
    const reminderHours = Number.isFinite(TEAM_EVENT_REMINDER_HOURS_BEFORE)
        ? Math.max(0, TEAM_EVENT_REMINDER_HOURS_BEFORE)
        : 2;
    const label = reminderType === 'h2'
        ? `${reminderHours}時間前`
        : `${reminderDays}日前`;
    const finalizedLabel = record.finalized.eventLabel || '日時確定済み';
    const attendanceSummary = buildTeamEventAttendanceVoteText(record);
    const activitiesText = buildTeamEventActivitiesText(record);

    if (!canChannelEmbedLinks(channel)) {
        const text = [
            `【チームイベントリマインド（${label}）】`,
            `開催日時: ${finalizedLabel}`,
            '',
            '出欠（自動集計）',
            attendanceSummary,
            '',
            'やること案',
            activitiesText
        ].join('\n');
        await channel.send(text);
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle(`チームイベントリマインド（${label}）`)
        .setDescription(`開催日時: ${finalizedLabel}`)
        .addFields(
            { name: '出欠（自動集計）', value: attendanceSummary },
            { name: 'やること案', value: activitiesText }
        );

    await channel.send({ embeds: [embed] });
}

async function finalizeTeamEventProposal(readyClient, record, nowMs) {
    if (record.finalized.slot) return false;

    const finalSlot = decideTeamEventFinalSlot(record);
    const finalSlotRecord = getTeamEventSlotRecord(record, finalSlot);
    const eventDateKey = isValidDateKey(finalSlotRecord?.dateKey)
        ? finalSlotRecord.dateKey
        : (finalSlotRecord.dayCode === 'sun'
            ? getJstDateKeyPlusDays(record.weekendKey, 1)
            : record.weekendKey);
    const eventAtMs = getTeamEventDateTimeMs(
        record.weekendKey,
        finalSlotRecord.dayCode,
        finalSlotRecord.time,
        eventDateKey
    );

    record.finalized.slot = finalSlot;
    record.finalized.eventDateKey = eventDateKey;
    record.finalized.eventLabel = `${eventDateKey} ${finalSlotRecord.dayLabel} ${finalSlotRecord.time} (JST)`;
    record.finalized.eventAt = eventAtMs ? new Date(eventAtMs).toISOString() : null;
    record.finalized.decidedAt = new Date(nowMs).toISOString();

    appendTeamEventHistory({
        weekendKey: record.weekendKey,
        decidedAt: record.finalized.decidedAt,
        dayCode: finalSlotRecord.dayCode,
        time: finalSlotRecord.time,
        attendanceScore: getTeamEventAttendanceScore(record),
        joinCount: record.attendance.join.length,
        maybeCount: record.attendance.maybe.length,
        absentCount: record.attendance.absent.length
    });

    const channel = await resolveTeamEventChannelById(readyClient, record.channelId);
    if (channel) {
        try {
            const message = await sendTeamEventFinalizedSummary(channel, record);
            if (message && message.id) {
                record.finalized.summaryMessageId = message.id;
            }
        } catch (e) {
            console.error(`Failed to send team event finalized summary: ${record.weekendKey}`, e.message);
        }
    }

    await updateTeamEventProposalMessage(readyClient, record);
    await updateTeamEventAvailabilityPanelMessage(readyClient, record);
    upsertTeamEventProposalRecord(record);
    return true;
}

async function processTeamEventReminders(readyClient, record, nowMs) {
    if (!record.finalized.slot || !record.finalized.eventAt) {
        return false;
    }

    const eventAtMs = Date.parse(record.finalized.eventAt);
    if (Number.isNaN(eventAtMs)) {
        return false;
    }

    const reminderDays = Number.isFinite(TEAM_EVENT_REMINDER_DAYS_BEFORE)
        ? Math.max(0, TEAM_EVENT_REMINDER_DAYS_BEFORE)
        : 3;
    const reminderHours = Number.isFinite(TEAM_EVENT_REMINDER_HOURS_BEFORE)
        ? Math.max(0, TEAM_EVENT_REMINDER_HOURS_BEFORE)
        : 2;
    const daysBeforeMs = reminderDays * 24 * 60 * 60 * 1000;
    const hoursBeforeMs = reminderHours * 60 * 60 * 1000;
    let changed = false;
    const channel = await resolveTeamEventChannelById(readyClient, record.channelId);
    if (!channel) {
        return false;
    }

    if (
        !record.reminders.d3Sent &&
        nowMs >= eventAtMs - daysBeforeMs &&
        nowMs < eventAtMs - hoursBeforeMs
    ) {
        try {
            await sendTeamEventReminder(channel, record, 'd3');
            record.reminders.d3Sent = true;
            changed = true;
        } catch (e) {
            console.error(`Failed to send team event ${reminderDays}day reminder: ${record.weekendKey}`, e.message);
        }
    }

    if (
        !record.reminders.h2Sent &&
        nowMs >= eventAtMs - hoursBeforeMs &&
        nowMs < eventAtMs
    ) {
        try {
            await sendTeamEventReminder(channel, record, 'h2');
            record.reminders.h2Sent = true;
            changed = true;
        } catch (e) {
            console.error(`Failed to send team event ${reminderHours}hour reminder: ${record.weekendKey}`, e.message);
        }
    }

    if (changed) {
        upsertTeamEventProposalRecord(record);
    }
    return changed;
}

async function runTeamEventMaintenance(readyClient) {
    if (!TEAM_EVENT_ENABLED || teamEventMaintenanceRunning) return;
    teamEventMaintenanceRunning = true;

    try {
        const nowMs = Date.now();
        const tallyDelayHours = Number.isFinite(TEAM_EVENT_TALLY_DELAY_HOURS)
            ? Math.max(0, TEAM_EVENT_TALLY_DELAY_HOURS)
            : 48;
        const tallyDelayMs = tallyDelayHours * 60 * 60 * 1000;
        const proposalEntries = Object.entries(teamEventState.proposals || {})
            .map(([weekendKey, record]) => normalizeTeamEventProposalRecord(record, weekendKey))
            .sort((a, b) => a.weekendKey.localeCompare(b.weekendKey));
        let stateChanged = false;

        for (const record of proposalEntries) {
            if (!record.finalized.slot) {
                const { slotChanged, voteCountsChanged } = recalculateTeamEventProposalSlots(record);
                if (slotChanged || voteCountsChanged) {
                    upsertTeamEventProposalRecord(record);
                    stateChanged = true;
                    await updateTeamEventProposalMessage(readyClient, record);
                    await updateTeamEventAvailabilityPanelMessage(readyClient, record);
                }
                const createdAtMs = Date.parse(record.createdAt);
                if (!Number.isNaN(createdAtMs) && nowMs >= createdAtMs + tallyDelayMs) {
                    const finalized = await finalizeTeamEventProposal(readyClient, record, nowMs);
                    if (finalized) {
                        stateChanged = true;
                    }
                }
            }

            const reminderChanged = await processTeamEventReminders(readyClient, record, nowMs);
            if (reminderChanged) {
                stateChanged = true;
            }
        }

        if (stateChanged) {
            saveTeamEventState();
        }
    } catch (e) {
        console.error('Team event maintenance failed:', e.message);
    } finally {
        teamEventMaintenanceRunning = false;
    }
}

async function maybePostTeamEventProposal(readyClient) {
    if (!TEAM_EVENT_ENABLED || teamEventPosting) return;
    if (!Number.isFinite(TEAM_EVENT_POST_HOUR_JST)) return;

    const now = new Date();
    const parts = getJstParts(now);
    if (parts.hour < TEAM_EVENT_POST_HOUR_JST) return;

    const saturdayMs = getAnnouncementSaturdayMsJst(now);
    if (saturdayMs === null) return;

    const weekendKey = getJstDateKeyFromMs(saturdayMs);
    if (hasTeamEventPosted(weekendKey) || getTeamEventProposalRecord(weekendKey)) return;

    teamEventPosting = true;
    try {
        if (!teamEventTargetChannel) {
            teamEventTargetChannel = await resolveTeamEventTargetChannel(readyClient);
        }

        if (!teamEventTargetChannel) {
            console.warn('Team event target channel is not found');
            return;
        }

        const proposal = buildTeamEventProposal(weekendKey);
        const record = createTeamEventProposalRecord(teamEventTargetChannel.id, proposal);
        const message = await sendTeamEventProposal(teamEventTargetChannel, record);
        record.proposalMessageId = message.id;
        try {
            const availabilityMessage = await sendTeamEventAvailabilityPanel(teamEventTargetChannel, record);
            if (availabilityMessage && availabilityMessage.id) {
                record.availabilityMessageId = availabilityMessage.id;
            }
        } catch (e) {
            console.error(`Failed to send team event availability panel: ${weekendKey}`, e.message);
        }
        upsertTeamEventProposalRecord(record);
        markTeamEventPosted(weekendKey);
        saveTeamEventState();
        console.log(`Team event proposal posted: ${weekendKey}`);
    } catch (e) {
        console.error('Team event proposal failed:', e.message);
        teamEventTargetChannel = null;
    } finally {
        teamEventPosting = false;
    }
}

async function sendOfficialFeedItem(channel, item) {
    const isX = item.source === 'x';
    if (isX) {
        // For X updates, post only the tweet URL.
        await channel.send(item.url);
        return;
    }

    const title = 'DQX Official News';
    const description = item.title.length > 350 ? `${item.title.slice(0, 350)}...` : item.title;
    const me = channel.guild?.members?.me || null;
    const perms = me ? channel.permissionsFor(me) : null;
    const canEmbed = perms ? perms.has(PermissionFlagsBits.EmbedLinks) : true;

    if (!canEmbed) {
        const text = `【${title}】\n${description}\n${item.url}\n${formatDateForEmbed(item.publishedAt)}`;
        await channel.send(text);
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(0x00A86B)
        .setTitle(title)
        .setDescription(description)
        .addFields(
            { name: 'Link', value: item.url },
            { name: 'Time', value: formatDateForEmbed(item.publishedAt), inline: true }
        )
        .setTimestamp(item.publishedAt || new Date());

    await channel.send({ embeds: [embed] });
}

async function pollOfficialFeeds(readyClient) {
    if (officialFeedPolling) return;
    officialFeedPolling = true;

    try {
        if (!officialFeedTargetChannel) {
            officialFeedTargetChannel = await resolveOfficialFeedTargetChannel(readyClient);
        }

        if (!officialFeedTargetChannel) {
            console.warn('Official feed target channel is not found');
            return;
        }

        const sourceItems = {
            dqx: [],
            x: []
        };

        try {
            const dqxHtml = await fetchText(OFFICIAL_DQX_NEWS_URL);
            const newsItems = parseDqxNewsItems(dqxHtml).slice(-5);
            const topicsHtml = await fetchText(OFFICIAL_DQX_TOPICS_URL);
            const topicsItems = parseDqxTopicsItems(topicsHtml).slice(-5);
            sourceItems.dqx = [...newsItems, ...topicsItems].sort((a, b) => {
                const aTime = a.publishedAt ? a.publishedAt.getTime() : 0;
                const bTime = b.publishedAt ? b.publishedAt.getTime() : 0;
                return aTime - bTime;
            });
        } catch (e) {
            console.error('Official DQX feed fetch failed:', e.message);
        }

        if (process.env.X_BEARER_TOKEN) {
            try {
                sourceItems.x = (await fetchXApiItems()).slice(-5);
                console.log('Official X feed fetched via API');
            } catch (e) {
                console.error('Official X API fetch failed:', e.message);
            }
        }

        if (sourceItems.x.length === 0) {
            const xFallbackItems = [];

            for (const account of getXMonitorAccounts()) {
                try {
                    const xHtml = await fetchText(account.timelineUrl);
                    xFallbackItems.push(...parseXTimelineItems(xHtml, account).slice(-5));
                } catch (e) {
                    console.error(`Official X feed fetch failed for ${account.username}:`, e.message);
                    try {
                        const xHtml = await fetchTextViaCurl(account.timelineUrl);
                        xFallbackItems.push(...parseXTimelineItems(xHtml, account).slice(-5));
                        console.log(`Official X feed fetched via curl fallback for ${account.username}`);
                    } catch (curlError) {
                        console.error(`Official X curl fallback failed for ${account.username}:`, curlError.message);
                    }
                }
            }

            sourceItems.x = xFallbackItems.sort((a, b) => {
                const aTime = a.publishedAt ? a.publishedAt.getTime() : 0;
                const bTime = b.publishedAt ? b.publishedAt.getTime() : 0;
                return aTime - bTime;
            });
        }

        const candidates = [...sourceItems.dqx, ...sourceItems.x].sort((a, b) => {
            const aTime = a.publishedAt ? a.publishedAt.getTime() : 0;
            const bTime = b.publishedAt ? b.publishedAt.getTime() : 0;
            return aTime - bTime;
        });

        if (candidates.length === 0) {
            return;
        }

        let stateChanged = false;

        for (const source of ['dqx', 'x']) {
            const items = sourceItems[source];
            if (!items || items.length === 0) {
                continue;
            }

            if (!officialFeedState.bootstrapped[source]) {
                items.forEach(item => markOfficialKeySeen(source, item.key));
                officialFeedState.bootstrapped[source] = true;
                stateChanged = true;
                console.log(`Official feed bootstrap completed for ${source}`);
            }
        }

        let postedCount = 0;
        for (const item of candidates) {
            if (!officialFeedState.bootstrapped[item.source]) {
                continue;
            }

            if (hasSeenOfficialKey(item.source, item.key)) {
                continue;
            }

            await sendOfficialFeedItem(officialFeedTargetChannel, item);
            markOfficialKeySeen(item.source, item.key);
            stateChanged = true;
            postedCount += 1;
        }

        if (stateChanged || postedCount > 0) {
            saveOfficialFeedState();
        }

        if (postedCount > 0) {
            console.log(`Official feed posted: ${postedCount}`);
        }
    } catch (e) {
        console.error('Official feed poll failed:', e.message);
    } finally {
        officialFeedPolling = false;
    }
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
    loadOfficialFeedState();
    loadTeamEventState();

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

    pollOfficialFeeds(readyClient);
    setInterval(() => {
        pollOfficialFeeds(readyClient);
    }, OFFICIAL_POLL_INTERVAL_MS);

    maybePostTeamEventProposal(readyClient);
    runTeamEventMaintenance(readyClient);
    setInterval(() => {
        maybePostTeamEventProposal(readyClient);
        runTeamEventMaintenance(readyClient);
    }, TEAM_EVENT_CHECK_INTERVAL_MS);
});

async function applyTeamEventAvailabilityChangeAndRefresh(readyClient, record) {
    const { slotChanged } = recalculateTeamEventProposalSlots(record);
    upsertTeamEventProposalRecord(record);
    saveTeamEventState();
    await updateTeamEventProposalMessage(readyClient, record);
    await updateTeamEventAvailabilityPanelMessage(readyClient, record);
    return slotChanged;
}

async function handleTeamEventAvailabilityButtonInteraction(interaction, record, parsed) {
    const userId = interaction.user.id;

    if (parsed.category === 'cmd' && parsed.value === 'list') {
        await interaction.reply({
            content: buildTeamEventAvailabilityListForUser(record, userId),
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    if (parsed.category === 'day') {
        const validDateSet = new Set(buildTeamEventWindowDateKeys(record.weekendKey));
        if (!validDateSet.has(parsed.value)) {
            await interaction.editReply('対象週外の日付です。');
            return;
        }
        const slotKey = getTeamEventAvailabilityDateSlotKey(parsed.value);
        const entry = ensureTeamEventAvailabilityEntry(record, userId);
        const exists = entry.slots.includes(slotKey);
        if (exists) {
            entry.slots = entry.slots.filter(value => value !== slotKey);
        } else {
            entry.slots.push(slotKey);
            entry.slots.sort();
        }
        entry.unknown = false;
        entry.updatedAt = new Date().toISOString();
        cleanupTeamEventAvailabilityEntry(record, userId);

        const slotChanged = await applyTeamEventAvailabilityChangeAndRefresh(interaction.client, record);
        const suffix = slotChanged ? '\n候補日を再計算しました。' : '';
        const dayLabel = getTeamEventAvailabilityDateLabel(parsed.value);
        await interaction.editReply(
            exists
                ? `可用日を解除しました: ${dayLabel}${suffix}`
                : `可用日を登録しました: ${dayLabel}${suffix}`
        );
        return;
    }

    if (parsed.category === 'cmd' && parsed.value === 'clear') {
        if (record.availability && typeof record.availability === 'object') {
            delete record.availability[userId];
        }
        if (record.availabilityCursor && typeof record.availabilityCursor === 'object') {
            delete record.availabilityCursor[userId];
        }
        const slotChanged = await applyTeamEventAvailabilityChangeAndRefresh(interaction.client, record);
        await interaction.editReply(
            slotChanged
                ? '可用日を全削除し、候補日を再計算しました。'
                : '可用日を全削除しました。'
        );
        return;
    }

    if (parsed.category === 'cmd' && parsed.value === 'unknown') {
        const entry = ensureTeamEventAvailabilityEntry(record, userId);
        entry.slots = [];
        entry.unknown = true;
        entry.updatedAt = new Date().toISOString();
        const slotChanged = await applyTeamEventAvailabilityChangeAndRefresh(interaction.client, record);
        await interaction.editReply(
            slotChanged
                ? 'シフト未確定として登録し、候補日を再計算しました。'
                : 'シフト未確定として登録しました。'
        );
        return;
    }

    if (parsed.category === 'cmd' && parsed.value === 'known') {
        const entry = ensureTeamEventAvailabilityEntry(record, userId);
        entry.unknown = false;
        entry.updatedAt = new Date().toISOString();
        cleanupTeamEventAvailabilityEntry(record, userId);
        const slotChanged = await applyTeamEventAvailabilityChangeAndRefresh(interaction.client, record);
        await interaction.editReply(
            slotChanged
                ? 'シフト未確定を解除し、候補日を再計算しました。'
                : 'シフト未確定を解除しました。'
        );
        return;
    }

    await interaction.editReply('未対応の操作です。');
}

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    try {
        const voteParsed = parseTeamEventButtonCustomId(interaction.customId);
        const availParsed = parseTeamEventAvailabilityButtonCustomId(interaction.customId);
        if (!voteParsed && !availParsed) return;

        const parsed = voteParsed || availParsed;
        const record = getTeamEventProposalRecord(parsed.weekendKey);
        if (!record) {
            await interaction.reply({ content: 'proposal not found', ephemeral: true });
            return;
        }

        const channel = interaction.channel;
        if (!channel || !channel.isTextBased()) {
            await interaction.reply({ content: 'failed to resolve channel', ephemeral: true });
            return;
        }

        if (voteParsed) {
            if (record.proposalMessageId && interaction.message?.id !== record.proposalMessageId) {
                await interaction.reply({ content: 'invalid vote button', ephemeral: true });
                return;
            }

            if (voteParsed.category === 'slot') {
                await interaction.reply({ content: '候補日の手動投票は無効です。可用日パネルを使ってください。', ephemeral: true });
                return;
            }

            if (record.finalized.slot) {
                await interaction.reply({ content: 'already finalized', ephemeral: true });
                return;
            }

            const updated = assignTeamEventVoteSingleChoice(record, voteParsed.category, voteParsed.value, interaction.user.id);
            if (!updated) {
                await interaction.reply({ content: 'failed to update vote', ephemeral: true });
                return;
            }

            await interaction.deferUpdate();
            upsertTeamEventProposalRecord(record);
            saveTeamEventState();
            if (interaction.message && typeof interaction.message.edit === 'function') {
                await interaction.message.edit(buildTeamEventProposalEditPayload(channel, record));
            }
            return;
        }

        if (record.availabilityMessageId && interaction.message?.id !== record.availabilityMessageId) {
            await interaction.reply({ content: 'invalid availability button', ephemeral: true });
            return;
        }

        if (record.finalized.slot) {
            await interaction.reply({ content: 'already finalized', ephemeral: true });
            return;
        }

        await handleTeamEventAvailabilityButtonInteraction(interaction, record, availParsed);
    } catch (e) {
        console.error('Team event interaction failed:', e.message);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'failed to apply interaction', ephemeral: true });
        } else if (interaction.deferred) {
            await interaction.followUp({ content: 'failed to apply interaction', ephemeral: true });
        }
    }
});

function buildTeamEventCommandUsageText() {
    return [
        'チームイベント可用日コマンド',
        '`!te status` 現在の対象週と設定を表示',
        '`!te panel` 可用日ボタンパネルを再送信',
        '`!te recalc` 可用日を反映して候補を再計算',
        '`!te avail list` 自分の登録状況を表示',
        '`!te avail add YYYY-MM-DD` 可用日を追加',
        '`!te avail remove YYYY-MM-DD` 可用日を削除',
        '`!te avail clear` 可用日を全削除',
        '`!te avail unknown` シフト未確定として登録',
        '`!te avail known` シフト未確定フラグを解除',
        `開催時刻: ${TEAM_EVENT_FIXED_TIME} 固定`
    ].join('\n');
}

function buildTeamEventAvailabilityListText(record, userId) {
    const entry = record.availability?.[userId];
    const slots = Array.isArray(entry?.slots) ? entry.slots : [];
    const unknown = entry?.unknown === true;
    const lines = [];
    lines.push(`対象週: ${record.weekendRangeLabel}`);
    lines.push(`開催時刻: ${TEAM_EVENT_FIXED_TIME} 固定`);
    if (slots.length === 0) {
        lines.push('登録日: なし');
    } else {
        const uniqueDates = Array.from(new Set(
            slots
                .map(slot => parseTeamEventSlotKey(slot))
                .filter(parsed => parsed && isValidDateKey(parsed.dateKey))
                .map(parsed => parsed.dateKey)
        )).sort();
        lines.push('登録日:');
        uniqueDates.forEach((dateKey, idx) => {
            lines.push(`${idx + 1}. ${getTeamEventAvailabilityDateLabel(dateKey)} (${dateKey})`);
        });
    }
    if (unknown) {
        lines.push('シフト: 未確定');
    }
    return lines.join('\n');
}

async function handleTeamEventCommandMessage(message) {
    const content = String(message.content || '').trim();
    if (content !== '!te' && !content.startsWith('!te ')) {
        return false;
    }

    if (!TEAM_EVENT_ENABLED) {
        await message.reply('チームイベント機能は現在無効です。');
        return true;
    }

    const args = content.split(/\s+/).slice(1);
    const sub = (args[0] || '').toLowerCase();
    const record = getLatestOpenTeamEventProposalRecord();

    if (!record) {
        await message.reply('現在、投票中のチームイベント提案はありません。');
        return true;
    }

    if (!sub || sub === 'help') {
        await message.reply(buildTeamEventCommandUsageText());
        return true;
    }

    if (sub === 'status') {
        await message.reply([
            `対象週: ${record.weekendRangeLabel}`,
            `投票締切: ${buildTeamEventVoteCloseLabel(record)}`,
            `開催時刻: ${TEAM_EVENT_FIXED_TIME} 固定`,
            `候補1: ${buildTeamEventSlotLabelWithDate(record, record.primary)}`,
            `候補2: ${buildTeamEventSlotLabelWithDate(record, record.backup)}`
        ].join('\n'));
        return true;
    }

    if (sub === 'panel') {
        const panelMessage = await sendTeamEventAvailabilityPanel(message.channel, record);
        if (panelMessage && panelMessage.id) {
            record.availabilityMessageId = panelMessage.id;
            upsertTeamEventProposalRecord(record);
            saveTeamEventState();
        }
        await message.reply(`可用日パネルを再送信しました: ${panelMessage?.id || '(no id)'}`);
        return true;
    }

    if (sub === 'recalc') {
        const { slotChanged } = recalculateTeamEventProposalSlots(record);
        upsertTeamEventProposalRecord(record);
        saveTeamEventState();
        await updateTeamEventProposalMessage(message.client, record);
        await updateTeamEventAvailabilityPanelMessage(message.client, record);
        await message.reply(slotChanged
            ? '可用日を反映して候補日を再計算しました。'
            : '可用日を反映して候補を再計算しました。候補は変更なしです。');
        return true;
    }

    if (sub !== 'avail') {
        await message.reply(buildTeamEventCommandUsageText());
        return true;
    }

    const action = (args[1] || 'list').toLowerCase();
    const userId = message.author.id;

    if (action === 'list') {
        await message.reply(buildTeamEventAvailabilityListText(record, userId));
        return true;
    }

    if (action === 'clear') {
        if (record.availability && typeof record.availability === 'object') {
            delete record.availability[userId];
        }
        const { slotChanged } = recalculateTeamEventProposalSlots(record);
        upsertTeamEventProposalRecord(record);
        saveTeamEventState();
        await updateTeamEventProposalMessage(message.client, record);
        await updateTeamEventAvailabilityPanelMessage(message.client, record);
        await message.reply(slotChanged
            ? '可用日を削除し、候補日を再計算しました。'
            : '可用日を削除しました。');
        return true;
    }

    if (action === 'unknown') {
        const entry = ensureTeamEventAvailabilityEntry(record, userId);
        entry.slots = [];
        entry.unknown = true;
        entry.updatedAt = new Date().toISOString();
        const { slotChanged } = recalculateTeamEventProposalSlots(record);
        upsertTeamEventProposalRecord(record);
        saveTeamEventState();
        await updateTeamEventProposalMessage(message.client, record);
        await updateTeamEventAvailabilityPanelMessage(message.client, record);
        await message.reply(slotChanged
            ? 'シフト未確定として登録しました。候補を再計算しました。'
            : 'シフト未確定として登録しました。');
        return true;
    }

    if (action === 'known') {
        const entry = ensureTeamEventAvailabilityEntry(record, userId);
        entry.unknown = false;
        entry.updatedAt = new Date().toISOString();
        cleanupTeamEventAvailabilityEntry(record, userId);
        const { slotChanged } = recalculateTeamEventProposalSlots(record);
        upsertTeamEventProposalRecord(record);
        saveTeamEventState();
        await updateTeamEventProposalMessage(message.client, record);
        await updateTeamEventAvailabilityPanelMessage(message.client, record);
        await message.reply(slotChanged
            ? 'シフト未確定フラグを解除し、候補を再計算しました。'
            : 'シフト未確定フラグを解除しました。');
        return true;
    }

    if (action !== 'add' && action !== 'remove') {
        await message.reply(buildTeamEventCommandUsageText());
        return true;
    }

    const dateText = args[2] || '';
    const timeText = args[3] || '';
    if (!isValidDateKey(dateText)) {
        await message.reply('日付形式が不正です。例: `!te avail add 2026-03-10`');
        return true;
    }
    if (timeText && normalizeTimeText(timeText, '') !== TEAM_EVENT_FIXED_TIME) {
        await message.reply(`開催時刻は ${TEAM_EVENT_FIXED_TIME} 固定です。`);
        return true;
    }
    const parsedSlot = {
        dateKey: dateText,
        time: TEAM_EVENT_FIXED_TIME,
        slotKey: getTeamEventAvailabilityDateSlotKey(dateText)
    };

    const validSlotKeys = buildTeamEventCandidateSlotKeySet(record.weekendKey);
    if (!validSlotKeys.has(parsedSlot.slotKey)) {
        await message.reply(`対象週の範囲外です。対象週: ${record.weekendRangeLabel}`);
        return true;
    }

    const entry = ensureTeamEventAvailabilityEntry(record, userId);
    const beforeCount = entry.slots.length;
    if (action === 'add') {
        if (!entry.slots.includes(parsedSlot.slotKey)) {
            entry.slots.push(parsedSlot.slotKey);
            entry.slots.sort();
        }
        entry.unknown = false;
    } else {
        entry.slots = entry.slots.filter(slot => slot !== parsedSlot.slotKey);
    }
    entry.updatedAt = new Date().toISOString();
    cleanupTeamEventAvailabilityEntry(record, userId);

    const afterEntry = record.availability?.[userId];
    const afterCount = Array.isArray(afterEntry?.slots) ? afterEntry.slots.length : 0;
    const { slotChanged } = recalculateTeamEventProposalSlots(record);
    upsertTeamEventProposalRecord(record);
    saveTeamEventState();
    await updateTeamEventProposalMessage(message.client, record);
    await updateTeamEventAvailabilityPanelMessage(message.client, record);

    if (action === 'add' && afterCount === beforeCount) {
        await message.reply(`可用日は既に登録済みです: ${parsedSlot.dateKey}`);
        return true;
    }
    if (action === 'remove' && beforeCount === afterCount) {
        await message.reply(`未登録の可用日です: ${parsedSlot.dateKey}`);
        return true;
    }

    await message.reply(slotChanged
        ? `可用日を更新しました: ${parsedSlot.dateKey}\n候補日を再計算しました。`
        : `可用日を更新しました: ${parsedSlot.dateKey}`);
    return true;
}

// Listen for messages
client.on(Events.MessageCreate, async message => {
    // Ignore messages from bots
    if (message.author.bot) return;

    if (await handleTeamEventCommandMessage(message)) {
        return;
    }

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
