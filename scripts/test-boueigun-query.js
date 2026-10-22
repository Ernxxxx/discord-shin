const assert = require('node:assert/strict');
const { parseBoueigunCommand: parse, formatJst } = require('../boueigun-query');
const { getBoueigunInfo } = require('../boueigun-schedule');
const fixture = require('./fixtures/boueigun-official-2026-10-22.json');
const now = Date.parse('2026-10-22T17:30:00+09:00');

for (const command of ['!b', '!防衛軍', '!boueigun', '  !B  ', '！ｂ']) assert.equal(parse(command, now).kind, 'current', command);
for (const command of ['!ban', '!bot', '!bother', 'hello !b', '!boueigunx', '!bad', null]) assert.equal(parse(command, now), null, String(command));
for (const command of ['!b help', '!防衛軍 ヘルプ', '!b ?']) assert.equal(parse(command, now).kind, 'help', command);

const points = [
    ['!b 21:00', '2026-10-22T21:00:00+09:00'],
    ['!b 21', '2026-10-22T21:00:00+09:00'],
    ['!b21時半', '2026-10-22T21:30:00+09:00'],
    ['！ｂ　２１：３０', '2026-10-22T21:30:00+09:00'],
    ['!b 午後9時', '2026-10-22T21:00:00+09:00'],
    ['!b 9pm', '2026-10-22T21:00:00+09:00'],
    ['!b 17:00', '2026-10-22T17:00:00+09:00'],
    ['!b 9:00', '2026-10-23T09:00:00+09:00'],
    ['!b 24:00', '2026-10-23T00:00:00+09:00'],
    ['!b 明日21時', '2026-10-23T21:00:00+09:00'],
    ['!防衛軍明日の午後9時半', '2026-10-23T21:30:00+09:00'],
    ['!b 明後日 0時', '2026-10-24T00:00:00+09:00'],
    ['!b あさって21:30', '2026-10-24T21:30:00+09:00'],
    ['!b 10/23 21:30', '2026-10-23T21:30:00+09:00'],
    ['!b 10月23日21時', '2026-10-23T21:00:00+09:00'],
    ['!b 2026-10-23T21:00', '2026-10-23T21:00:00+09:00'],
    ['!b 2026/10/23 24時', '2026-10-24T00:00:00+09:00'],
    ['!b 次', '2026-10-22T18:00:00+09:00'],
    ['!b 3時間後', '2026-10-22T20:30:00+09:00'],
    ['!b あと90分', '2026-10-22T19:00:00+09:00'],
    ['!b 1h30m', '2026-10-22T19:00:00+09:00'],
    ['!b あと１時間３０分', '2026-10-22T19:00:00+09:00'],
    ['!b 0分後', '2026-10-22T17:30:00+09:00']
];
for (const [command, expected] of points) {
    const request = parse(command, now);
    assert.equal(request.kind, 'at', command);
    assert.equal(request.atMs, Date.parse(expected), command);
}
for (const [command, expected] of [['!b 今日', '2026-10-22'], ['!b明日', '2026-10-23'], ['!b 10月24日', '2026-10-24'], ['!b 一覧', '2026-10-22']]) {
    const request = parse(command, now);
    assert.equal(request.kind, 'day', command);
    assert.equal(request.startMs, Date.parse(expected + 'T00:00:00+09:00'), command);
}
const tomorrow = parse('!b 明日', now);
for (let hour = 0; hour < 24; hour++) {
    const at = tomorrow.startMs + hour * 3600000;
    const official = fixture.entries.find(entry => Date.parse(entry.at) === at);
    assert.ok(official);
    assert.equal(getBoueigunInfo(at).current, official.current);
}
const yearEnd = Date.parse('2026-12-31T23:30:00+09:00');
assert.equal(parse('!b 1/1 0時', yearEnd).atMs, Date.parse('2027-01-01T00:00:00+09:00'));
assert.equal(parse('!b 0時', yearEnd).atMs, Date.parse('2027-01-01T00:00:00+09:00'));
assert.equal(parse('!b 明日', yearEnd).startMs, Date.parse('2027-01-01T00:00:00+09:00'));
assert.equal(parse('!b 2028/2/29', Date.parse('2028-02-28T12:00:00+09:00')).kind, 'day');
for (const input of ['25:00', '24:01', '21:60', '午後13時', '2/30', '2027/2/29', '10/21', '2026/12/31', '721h', 'foo', '3時間後です', '明日abc', '9'.repeat(150)]) assert.equal(parse('!b ' + input, now).kind, 'error', input);
assert.equal(parse('!b 11/21', now).kind, 'day');
assert.equal(parse('!b 11/22', now).kind, 'error');
assert.equal(parse('!b', NaN).kind, 'error');
assert.equal(formatJst(Date.parse('2026-10-23T00:00:00+09:00')), '2026/10/23（金） 00:00');
console.log('boueigun query tests passed: flexible syntax, JST, 24 official slots, midnight/year/leap boundaries, and invalid input');
