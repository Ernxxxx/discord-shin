function isDateKey(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTeamEventWeekendKeyAutomated(weekendKey, lastAutomatedWeekendKey) {
    if (!isDateKey(weekendKey)) return false;
    if (!isDateKey(lastAutomatedWeekendKey)) return true;
    return weekendKey <= lastAutomatedWeekendKey;
}

module.exports = {
    isTeamEventWeekendKeyAutomated
};
