'use strict';

module.exports = function createTeamleadSync({ db, normalizedRoles, isTeamlead, syncRecurringMeetingsForPerson }) {
  function ensureTeamleadSelfAssignment(personId, roles, actorUser) {
    if (!normalizedRoles(roles).includes('teamlead') || !personId) return null;
    const person = db.people.get(personId);
    if (!person || person.type !== 'team' || person.teamLeadId) return person || null;
    const updated = db.people.update(personId, { teamLeadId: personId });
    try { syncRecurringMeetingsForPerson(personId, actorUser || null); } catch (err) {
      console.warn('Не удалось обновить плановые встречи после назначения тимлида самому себе', err);
    }
    return updated;
  }

  function syncExistingTeamleadSelfAssignments() {
    for (const user of db.auth.users.all()) {
      if (!user.active || !isTeamlead(user) || !user.personId) continue;
      const person = db.people.get(user.personId);
      if (person && person.type === 'team' && !person.teamLeadId) db.people.update(person.id, { teamLeadId: person.id });
    }
  }

  return { ensureTeamleadSelfAssignment, syncExistingTeamleadSelfAssignments };
};
