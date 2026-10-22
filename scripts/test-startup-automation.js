const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const discord = require('discord.js');
const root = path.join(__dirname, '..');
const rootRequire = require('node:module').createRequire(path.join(root, 'index.js'));
for (const deferred of [false, true]) {
    let client;
    const intervals = [], calls = [];
    class FakeClient extends EventEmitter { constructor() { super(); client = this; this.user = { tag: 'fake' }; } login() { return Promise.resolve(); } }
    const context = vm.createContext({ require(name) { if (name === 'dotenv') return { config() {} }; if (name === 'discord.js') return { ...discord, Client: FakeClient }; return rootRequire(name); }, __dirname: root, process: { env: { SHIN_SKIP_STARTUP_AUTOMATION: deferred ? '1' : '0' } }, Buffer, URL, console: { log() {}, warn() {}, error() {} }, setInterval(_fn, delay) { intervals.push(delay); }, record: name => calls.push(name) });
    vm.runInContext(fs.readFileSync(path.join(root, 'index.js'), 'utf8'), context);
    vm.runInContext('loadReminders=()=>{};loadOfficialFeedState=()=>{};loadTeamEventState=()=>{};pollOfficialFeeds=()=>record("feed");maybePostTeamEventProposal=()=>record("proposal");runTeamEventMaintenance=()=>record("maintenance");', context);
    client.emit(discord.Events.ClientReady, client);
    assert.deepEqual(calls, deferred ? [] : ['feed', 'proposal', 'maintenance']);
    assert.deepEqual(intervals, [60000, 300000, 600000]);
}
console.log('startup automation tests passed: optional deferral makes no startup posts and retains normal polling timers');
