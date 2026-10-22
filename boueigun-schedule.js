const HOUR_MS = 60 * 60 * 1000;

// Official forecast: 2026-10-21 03:00 JST is the start of cycle A.
// Verified against all 120 hours published on 2026-10-22:
// https://browser.dqx.jp/sc/tokoyami/
const EPOCH_MS = Date.parse('2026-10-21T03:00:00+09:00');
const COMMON_START = [
    '全兵団',
    '鋼塊の重滅兵団',
    '金神の遺宝兵団',
    '紅爆の暴賊兵団',
    '冥黒の悪夢兵団',
    '全兵団'
];
const ROTATION = [
    ['闇朱の獣牙兵団', '蒼怨の屍獄兵団', '灰塵の竜鱗兵団', '白雲の冥翼兵団'],
    ['紫炎の鉄機兵団', '銀甲の凶蟲兵団', '彩虹の粘塊兵団', '腐緑の樹葬兵団'],
    ['深碧の造魔兵団', '翠煙の海妖兵団', '芳墨の華烈兵団', '青鮮の菜果兵団']
].flatMap(cycle => [...COMMON_START, ...cycle, '冥黒の悪夢兵団']);

function getBoueigunInfo(nowMs = Date.now()) {
    if (!Number.isFinite(nowMs)) {
        throw new TypeError('nowMs must be a finite timestamp');
    }

    const elapsedMs = nowMs - EPOCH_MS;
    const elapsedHours = Math.floor(elapsedMs / HOUR_MS);
    const position = ((elapsedHours % ROTATION.length) + ROTATION.length) % ROTATION.length;
    const msIntoHour = ((elapsedMs % HOUR_MS) + HOUR_MS) % HOUR_MS;

    return {
        current: ROTATION[position],
        next: ROTATION[(position + 1) % ROTATION.length],
        remainingMinutes: Math.floor((HOUR_MS - msIntoHour) / (60 * 1000))
    };
}

module.exports = { getBoueigunInfo };
