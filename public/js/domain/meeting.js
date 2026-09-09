// Shared meeting presentation and outcome helpers.

// "1:1 с Алёна Богатова" -> "Алёна Богатова" (тип уже показан бейджем рядом).
function meetingDisplayTitle(meeting) {
  const title = meeting.title || '';
  const prefixes = ['1:1 с ', '1:1 c ', 'Performance review: ', 'PR: '];
  for (const prefix of prefixes) {
    if (title.toLowerCase().startsWith(prefix.toLowerCase())) {
      const rest = title.slice(prefix.length).trim();
      if (rest) return rest;
    }
  }
  return title;
}

function meetingHasOutcomeRecords(meeting) {
  const hasNotes = String(meeting?.notes || '').trim().length > 0;
  const hasDocuments = Array.isArray(meeting?.documentLinks)
    && meeting.documentLinks.some((doc) => String(doc?.title || doc?.url || '').trim());
  return hasNotes || hasDocuments;
}

function meetingIsPast(meeting, todayKey = todayStr()) {
  const dateKey = String(meeting?.date || '').slice(0, 10);
  return Boolean(dateKey && dateKey < todayKey);
}

function meetingIsMissed(meeting, todayKey = todayStr()) {
  return meetingIsPast(meeting, todayKey) && !meetingHasOutcomeRecords(meeting);
}

function meetingMissedDays(meeting, todayKey = todayStr()) {
  if (!meetingIsMissed(meeting, todayKey)) return 0;
  const [ty, tm, td] = String(todayKey).split('-').map(Number);
  const [my, mm, md] = String(meeting?.date || '').slice(0, 10).split('-').map(Number);
  if (![ty, tm, td, my, mm, md].every(Number.isFinite)) return 0;
  return Math.max(1, Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(my, mm - 1, md)) / 86400000));
}

function normalizedMeetingType(type = 'other') {
  const value = String(type || 'other').trim().toLowerCase();
  return MEETING_TYPE_LABEL[value] ? value : 'other';
}

function meetingTypeBadgeHtml(type = 'other', { className = '' } = {}) {
  const normalized = normalizedMeetingType(type);
  const label = MEETING_TYPE_LABEL[normalized] || MEETING_TYPE_LABEL.other || 'Другое';
  const typeClass = normalized.replace(/[^a-z0-9]+/gi, '-');
  return `<span class="ui-tag meeting-type badge meeting-type-${typeClass}${className ? ` ${escapeHtml(className)}` : ''}">${escapeHtml(label)}</span>`;
}

function meetingTypeOptionsHtml(selected = 'other', { includeAll = false } = {}) {
  const options = includeAll ? ['all', ...MEETING_TYPE_ORDER] : MEETING_TYPE_ORDER;
  return options.map((value) => {
    const label = value === 'all' ? 'Все встречи' : (MEETING_TYPE_LABEL[value] || value);
    const isSelected = value === selected || (!selected && value === 'other');
    return `<option value="${escapeHtml(value)}" ${isSelected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}
