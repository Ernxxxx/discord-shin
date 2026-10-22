const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { getBoueigunInfo } = require('../boueigun-schedule');
const fixture = require('./fixtures/boueigun-official-2026-10-22.json');

const HOUR_MS = 3600000;
assert.equal(fixture.entries.length, 120);

for (const [index, entry] of fixture.entries.entries()) {
    const at = Date.parse(entry.at);
    const info = getBoueigunInfo(at);
    assert.equal(info.current, entry.current, entry.at);
    assert.equal(info.remainingMinutes, 60, entry.at);
    assert.equal(getBoueigunInfo(at + HOUR_MS - 1).current, entry.current, `${entry.at} end`);
    assert.equal(getBoueigunInfo(at + HOUR_MS - 1).remainingMinutes, 0);
    if (fixture.entries[index + 1]) {
        assert.equal(info.next, fixture.entries[index + 1].current, `${entry.at} next`);
    }
}

assert.deepEqual(getBoueigunInfo(Date.parse('2026-10-22T15:30:00+09:00')), {
    current: '紅爆の暴賊兵団', next: '冥黒の悪夢兵団', remainingMinutes: 30
});
assert.deepEqual(getBoueigunInfo(Date.parse('2026-10-22T22:59:59.999+09:00')), {
    current: '冥黒の悪夢兵団', next: '全兵団', remainingMinutes: 0
});
assert.equal(getBoueigunInfo(Date.parse('2026-10-23T00:00:00+09:00')).current, '鋼塊の重滅兵団');

const epoch = Date.parse('2026-10-21T03:00:00+09:00');
assert.deepEqual(getBoueigunInfo(epoch - 1), {
    current: '冥黒の悪夢兵団', next: '全兵団', remainingMinutes: 0
});
assert.deepEqual(getBoueigunInfo(epoch - 33 * HOUR_MS), getBoueigunInfo(epoch));
assert.deepEqual(getBoueigunInfo(epoch + 33 * HOUR_MS), getBoueigunInfo(epoch));
assert.throws(() => getBoueigunInfo(NaN), TypeError);

// Every army in the official forecast must have an existing image mapping.
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const imageMapSource = indexSource.match(/const BOUEIGUN_IMAGES = (\{[\s\S]*?\n\});/)[1];
const images = vm.runInNewContext(`(${imageMapSource})`);
for (const army of new Set(fixture.entries.map(entry => entry.current))) {
    assert.ok(images[army], `Missing image mapping: ${army}`);
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'images', 'boueigun', images[army])), `Missing image: ${army}`);
}

console.log('boueigun schedule tests passed: 120 official hours, 119 next-hour transitions, boundaries, and 17 army images');
