const assert = require('assert');
const { shouldSkipOfficialXItem } = require('../official-feed-utils');

const NOW_MS = Date.parse('2026-03-19T00:00:00Z');
const MAX_AGE_MS = 72 * 60 * 60 * 1000;

function testAllowsRecentXItem() {
    const item = {
        source: 'x',
        key: 'recent',
        publishedAt: new Date('2026-03-18T12:00:00Z')
    };

    assert.strictEqual(
        shouldSkipOfficialXItem(item, NOW_MS, MAX_AGE_MS),
        false,
        'recent X item should not be skipped'
    );
}

function testSkipsOldXItem() {
    const item = {
        source: 'x',
        key: 'stale',
        publishedAt: new Date('2025-10-27T12:00:00Z')
    };

    assert.strictEqual(
        shouldSkipOfficialXItem(item, NOW_MS, MAX_AGE_MS),
        true,
        'stale X item should be skipped'
    );
}

function testSkipsXItemWithoutTimestamp() {
    const item = {
        source: 'x',
        key: 'missing-time',
        publishedAt: null
    };

    assert.strictEqual(
        shouldSkipOfficialXItem(item, NOW_MS, MAX_AGE_MS),
        true,
        'X item without publishedAt should be skipped'
    );
}

function run() {
    testAllowsRecentXItem();
    testSkipsOldXItem();
    testSkipsXItemWithoutTimestamp();
    console.log('official-feed-utils tests passed');
}

run();
