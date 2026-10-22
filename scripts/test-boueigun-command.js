const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const discord = require('discord.js');
const { getBoueigunInfo } = require('../boueigun-schedule');

async function checkCommand(at, command) {
    let client;
    class FakeClient extends EventEmitter {
        constructor() { super(); client = this; }
        login() { return Promise.resolve(); }
    }
    const nowMs = Date.parse(at);
    const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
    const rootRequire = require('node:module').createRequire(path.join(__dirname, '..', 'index.js'));
    vm.runInNewContext(source, {
        require(name) {
            if (name === 'dotenv') return { config() {} };
            if (name === 'discord.js') return { ...discord, Client: FakeClient };
            if (name === './boueigun-schedule') return { getBoueigunInfo: () => getBoueigunInfo(nowMs) };
            return rootRequire(name);
        },
        __dirname: path.join(__dirname, '..'),
        process: { env: {} },
        Buffer,
        URL,
        console,
        setInterval() { throw new Error('The fake client must not start background jobs'); }
    });
    const replies = [];
    const handlers = client.listeners(discord.Events.MessageCreate);
    assert.equal(handlers.length, 1);
    await handlers[0]({
        content: command,
        author: { bot: false },
        channel: { id: 'test-channel' },
        reply(payload) { replies.push(payload); return Promise.resolve(); }
    });
    assert.equal(replies.length, 1);
    const payload = replies[0];
    const expected = getBoueigunInfo(nowMs);
    assert.equal(payload.embeds.length, 2);
    assert.equal(payload.embeds[0].toJSON().description, `**${expected.current}**`);
    assert.equal(payload.embeds[1].toJSON().description, `**${expected.next}**`);
    assert.equal(payload.files.length, 2);
    if (expected.current === '冥黒の悪夢兵団') {
        assert.equal(payload.files[0].name, 'meikoku.png');
    }
    if (expected.next === '冥黒の悪夢兵団') {
        assert.equal(payload.files[1].name, 'next_meikoku.png');
    }
}

async function main() {
    await checkCommand('2026-10-22T15:30:00+09:00', '!b');
    await checkCommand('2026-10-22T16:30:00+09:00', '!防衛軍');
    await checkCommand('2026-10-23T23:59:59+09:00', '!boueigun');
    console.log('boueigun command tests passed: all three commands, current/next armies, and image attachments; no Discord connection');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
