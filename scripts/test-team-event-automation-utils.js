const assert = require('assert');
const { isTeamEventWeekendKeyAutomated } = require('../team-event-automation-utils');

function testAllowsWhenCutoffMissing() {
    assert.strictEqual(
        isTeamEventWeekendKeyAutomated('2026-04-18', ''),
        true,
        'weekendKey should be allowed when cutoff is empty'
    );
}

function testAllowsEqualCutoff() {
    assert.strictEqual(
        isTeamEventWeekendKeyAutomated('2026-04-04', '2026-04-04'),
        true,
        'cutoff weekendKey itself should stay allowed'
    );
}

function testAllowsEarlierWeekendKey() {
    assert.strictEqual(
        isTeamEventWeekendKeyAutomated('2026-03-21', '2026-04-04'),
        true,
        'earlier weekendKey should stay allowed'
    );
}

function testBlocksLaterWeekendKey() {
    assert.strictEqual(
        isTeamEventWeekendKeyAutomated('2026-04-18', '2026-04-04'),
        false,
        'later weekendKey should be blocked'
    );
}

function run() {
    testAllowsWhenCutoffMissing();
    testAllowsEqualCutoff();
    testAllowsEarlierWeekendKey();
    testBlocksLaterWeekendKey();
    console.log('team-event-automation-utils tests passed');
}

run();
