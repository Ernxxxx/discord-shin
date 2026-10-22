const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const discord = require('discord.js');
const { getBoueigunInfo } = require('../boueigun-schedule');
const { parseBoueigunCommand } = require('../boueigun-query');

async function checkCommand(at, command, rejectReply = false) {
    let client;
    class FakeClient extends EventEmitter { constructor() { super(); client = this; } login() { return Promise.resolve(); } }
    const nowMs = Date.parse(at);
    class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [nowMs])); } static now() { return nowMs; } }
    const root = path.join(__dirname, '..');
    const source = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
    const rootRequire = require('node:module').createRequire(path.join(root, 'index.js'));
    const errors = [];
    vm.runInNewContext(source, {
        require(name) {
            if (name === 'dotenv') return { config() {} };
            if (name === 'discord.js') return { ...discord, Client: FakeClient };
            return rootRequire(name);
        },
        __dirname: root, process: { env: {} }, Buffer, URL, Date: FixedDate, console: { ...console, error(...values) { errors.push(values.join(' ')); } },
        setInterval() { throw new Error('The fake client must not start background jobs'); }
    });
    const replies = [];
    const handlers = client.listeners(discord.Events.MessageCreate);
    assert.equal(handlers.length, 1);
    await handlers[0]({ content: command, author: { bot: false }, channel: { id: 'test-channel' }, reply(payload) { replies.push(payload); return rejectReply ? Promise.reject(new Error('simulated reply failure')) : Promise.resolve(); } });
    assert.equal(errors.length, rejectReply ? 1 : 0);
    if (rejectReply) assert.ok(errors[0].includes('simulated reply failure'));
    const request = parseBoueigunCommand(command, nowMs);
    if (!request) { assert.equal(replies.length, 0); return; }
    assert.equal(replies.length, 1);
    const payload = replies[0];
    assert.equal(JSON.stringify(payload.allowedMentions), JSON.stringify({ parse: [], repliedUser: false }));
    const embeds = payload.embeds.map(embed => embed.toJSON());
    for (const embed of embeds) {
        assert.ok((embed.description || '').length <= 4096);
        for (const field of embed.fields || []) assert.ok(field.value.length <= 1024);
    }
    if (request.kind === 'current' || request.kind === 'at') {
        const expected = getBoueigunInfo(request.atMs);
        assert.equal(embeds.length, 2);
        assert.equal(embeds[0].description, `**${expected.current}**`);
        assert.equal(embeds[1].description, `**${expected.next}**`);
        assert.equal(payload.files.length, 2);
        if (expected.current === '冥黒の悪夢兵団') assert.equal(payload.files[0].name, 'meikoku.png');
        if (expected.next === '冥黒の悪夢兵団') assert.equal(payload.files[1].name, 'next_meikoku.png');
        if (request.kind === 'at') assert.ok(embeds[0].fields.some(f => f.name === '指定日時（日本時間）'));
    } else if (request.kind === 'day') {
        const lines = embeds[0].fields.flatMap(f => f.value.split('\n'));
        assert.equal(lines.length, 24);
        for (let hour = 0; hour < 24; hour++) assert.equal(lines[hour], `\`${String(hour).padStart(2, '0')}:00\` ${getBoueigunInfo(request.startMs + hour * 3600000).current}`);
        assert.ok(embeds[0].footer.text.includes('予測'));
        assert.equal(payload.files, undefined);
    } else {
        assert.equal(embeds.length, 1);
        assert.equal(embeds[0].title, request.kind === 'error' ? '日時を確認してください' : '防衛軍の予定の調べ方');
    }
}

async function main() {
    await checkCommand('2026-10-22T15:30:00+09:00', '!b');
    await checkCommand('2026-10-22T16:30:00+09:00', '!防衛軍');
    await checkCommand('2026-10-23T23:59:59+09:00', '!boueigun');
    for (const command of ['!b 21:00', '!b明日21時', '！防衛軍　明日', '!b 今日', '!b 10/24', '!b 3時間後', '!b 午後9時半', '!b help', '!b 25:00', '!b bad-input', '!ban']) await checkCommand('2026-10-22T17:30:00+09:00', command);
    await checkCommand('2026-12-31T23:30:00+09:00', '!b 1/1 0時');
    await checkCommand('2026-12-31T23:30:00+09:00', '!b help');
    await checkCommand('2026-10-22T17:30:00+09:00', '!b 明日', true);
    console.log('boueigun command tests passed: existing aliases, future/day queries, help/errors, images, limits, no mentions, and no Discord connection');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
