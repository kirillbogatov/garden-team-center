'use strict';

module.exports = function createRecurringMeetings({ db, isAdmin, isActiveTeamMember, nextMeetingKey }) {
  function addMonthsSafe(dateValue, months) {
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return new Date();
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + Math.max(1, Number(months) || 1));
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return d;
  }

  function nextRecurringDate(anchor, months) {
    let next = addMonthsSafe(anchor, months);
    const now = new Date();
    while (next <= now) next = addMonthsSafe(next, months);
    next.setHours(10, 0, 0, 0);
    const y = next.getFullYear();
    const m = String(next.getMonth() + 1).padStart(2, '0');
    const d = String(next.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function recurringMonthsFor(person, type) {
    if (type === '1:1') return Math.max(0, Number(person.oneOnOneEveryMonths ?? 1));
    if (type === 'pr') return Math.max(0, Number(person.prEveryMonths ?? 3));
    return 0;
  }

  function dateOnly(value) {
    return String(value || '').slice(0, 10);
  }

  // Meetings of `type` where `person` is a participant. Read twice in
  // syncRecurringMeetingsForPerson: once before the participantIds repair
  // loop, once after, so the second read picks up the repaired rows.
  function meetingsForPersonAndType(person, type) {
    return db.meetings.all().filter((m) => m.type === type && (m.participantIds || []).includes(person.id));
  }

  function removeFutureAutoMeetings(person, today, meetings = db.meetings.all()) {
    for (const meeting of meetings) {
      const isFutureAuto = meeting.autoRecurring
        && meeting.recurringPersonId === person.id
        && dateOnly(meeting.date) >= today;
      if (isFutureAuto) db.meetings.remove(meeting.id);
    }
  }

  // An auto-recurring 1:1/PR meeting should only ever have `person` as its
  // sole participant — repair any that drifted (e.g. a manual edit added a
  // co-participant) before recomputing future/past state below.
  function repairAutoMeetingParticipants(person, meetings) {
    for (const meeting of meetings) {
      if (meeting.autoRecurring && meeting.recurringPersonId === person.id) {
        const ids = Array.isArray(meeting.participantIds) ? meeting.participantIds : [];
        if (ids.length !== 1 || ids[0] !== person.id) db.meetings.update(meeting.id, { participantIds: [person.id] });
      }
    }
  }

  function syncRecurringMeetingsForPerson(personId, actorUser) {
    const person = db.people.get(personId);
    if (!person || person.type !== 'team') return;
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    if (!isActiveTeamMember(person)) {
      removeFutureAutoMeetings(person, today);
      return;
    }

    for (const type of ['1:1', 'pr']) {
      const months = recurringMonthsFor(person, type);
      repairAutoMeetingParticipants(person, meetingsForPersonAndType(person, type));
      const meetings = meetingsForPersonAndType(person, type);

      if (months === 0) {
        removeFutureAutoMeetings(person, today, meetings);
        continue;
      }

      const future = meetings
        .filter((m) => dateOnly(m.date) >= today)
        .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
      const futureManual = future.filter((m) => !m.autoRecurring);
      const futureAutos = future.filter((m) => m.autoRecurring && m.recurringPersonId === person.id);

      if (future.length) {
        // Only one auto-scheduled meeting should be pending: if a manual
        // meeting already covers the future, drop every auto one; otherwise
        // keep just the earliest auto one.
        const keepAuto = futureManual.length ? null : futureAutos[0];
        for (const extra of futureAutos) {
          if (!keepAuto || extra.id !== keepAuto.id) db.meetings.remove(extra.id);
        }
        continue;
      }

      const past = meetings
        .filter((m) => dateOnly(m.date) < today)
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      const anchor = past[0]?.date || person.createdAt || now.toISOString();
      const targetDate = nextRecurringDate(anchor, months);
      const title = type === '1:1' ? `1:1 с ${person.name}` : `PR: ${person.name}`;

      db.meetings.create({
        type,
        title,
        date: targetDate,
        participantIds: [person.id],
        projectId: null,
        prepNotes: '',
        notes: '',
        nextSteps: '',
        documentLinks: [],
        actionItems: [],
        autoRecurring: true,
        recurringPersonId: person.id,
        recurringEveryMonths: months,
        createdByUserId: actorUser?.id || db.auth.users.all().find((u) => isAdmin(u))?.id || null,
        meetingKey: typeof nextMeetingKey === 'function' ? nextMeetingKey() : undefined,
      });
    }
  }

  function syncRecurringMeetingsForMeeting(meeting, actorUser) {
    if (!meeting || !['1:1', 'pr'].includes(meeting.type)) return;
    const ids = meeting.participantIds || [];
    for (const personId of ids) {
      const person = db.people.get(personId);
      if (!isActiveTeamMember(person)) continue;
      const isLeadForAnotherParticipant = ids.some((otherId) => db.people.get(otherId)?.teamLeadId === person.id);
      if (!isLeadForAnotherParticipant) syncRecurringMeetingsForPerson(personId, actorUser);
    }
  }

  function ensureRecurringMeetingSchedules() {
    for (const person of db.people.all().filter((person) => person.type === 'team')) {
      syncRecurringMeetingsForPerson(person.id, null);
    }
  }

  return {
    addMonthsSafe,
    nextRecurringDate,
    recurringMonthsFor,
    syncRecurringMeetingsForPerson,
    syncRecurringMeetingsForMeeting,
    ensureRecurringMeetingSchedules,
  };
};
