module.exports = function createJournalSync({ db, isActiveTeamMember }) {
  function journalMentionLinks(journal) {
    const mentions = Array.isArray(journal.mentions) ? journal.mentions : [];
    const projectIds = [...new Set(mentions.filter((m) => m.type === 'project').map((m) => m.id).filter(Boolean))];
    const directPersonIds = mentions.filter((m) => m.type === 'person' || m.type === 'stakeholder').map((m) => m.id).filter(Boolean);
    const teamPersonIds = mentions.some((m) => m.type === 'team')
      ? db.people.all().filter(isActiveTeamMember).map((person) => person.id)
      : [];
    const personIds = [...new Set([...directPersonIds, ...teamPersonIds])];
    return { projectIds, personIds };
  }

  function journalProblemTitle(text) {
    const plain = String(text || '')
      .replace(/@\[([^\]]+)\]\((?:person|project|stakeholder|team):[a-zA-Z0-9_]+\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    return plain.length <= 140 ? plain : plain.slice(0, 137).trimEnd() + '…';
  }

  function syncJournalDerivedEntity(journal, user) {
    if (!journal) return journal;
    const { projectIds, personIds } = journalMentionLinks(journal);

    if (journal.kind === 'problem') {
      const payload = {
        title: journalProblemTitle(journal.text) || 'Проблема из журнала',
        relatedPersonIds: personIds,
        projectId: projectIds[0] || null,
        relatedProjectIds: projectIds,
        sourceJournalId: journal.id,
        createdByUserId: journal.authorUserId || user?.id || null,
      };
      let issue = journal.issueId ? db.issues.get(journal.issueId) : null;
      issue = issue
        ? db.issues.update(issue.id, payload)
        : db.issues.create({ ...payload, description: '', severity: 'normal', status: 'open', solutionOptions: [] });
      journal = db.journal.update(journal.id, { issueId: issue.id, agreementId: null });
    } else if (journal.kind === 'agreement') {
      const payload = {
        text: journal.text,
        date: (journal.createdAt || new Date().toISOString()).slice(0, 10),
        withPersonIds: personIds,
        projectId: projectIds[0] || null,
        relatedProjectIds: projectIds,
        sourceJournalId: journal.id,
        createdByUserId: journal.authorUserId || user?.id || null,
      };
      let agreement = journal.agreementId ? db.agreements.get(journal.agreementId) : null;
      agreement = agreement
        ? db.agreements.update(agreement.id, payload)
        : db.agreements.create({ ...payload, dueDate: null, status: 'open' });
      journal = db.journal.update(journal.id, { agreementId: agreement.id, issueId: null });
    }
    return journal;
  }

  return { journalMentionLinks, journalProblemTitle, syncJournalDerivedEntity };
};
