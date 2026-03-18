function normalizePublishedAtMs(publishedAt) {
    if (!publishedAt) return null;
    if (publishedAt instanceof Date) {
        const ms = publishedAt.getTime();
        return Number.isNaN(ms) ? null : ms;
    }

    const ms = Date.parse(publishedAt);
    return Number.isNaN(ms) ? null : ms;
}

function shouldSkipOfficialXItem(item, nowMs, maxAgeMs) {
    if (!item || item.source !== 'x') return false;
    if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0) return false;

    const publishedAtMs = normalizePublishedAtMs(item.publishedAt);
    if (!Number.isFinite(publishedAtMs)) {
        return true;
    }

    return publishedAtMs < nowMs - maxAgeMs;
}

module.exports = {
    shouldSkipOfficialXItem
};
