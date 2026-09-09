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

  function stripMentionTokens(text) {
    return String(text || '')
      .replace(/@\[([^\]]+)\]\((?:person|project|stakeholder|team):[a-zA-Z0-9_]+\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function journalProblemTitle(text) {
    const plain = stripMentionTokens(text);
    return plain.length <= 140 ? plain : plain.slice(0, 137).trimEnd() + '…';
  }

  // Обратное превращение relatedPersonIds/projectId в @[Имя](type:id) — чтобы при
  // прямом создании/редактировании проблемы, договорённости или идеи (не через
  // Журнал) связанные люди/проект не терялись при следующем редактировании
  // синхронизированной записи журнала: mentions там всегда пересчитываются из text
  // (см. MENTION_COLLECTIONS в db.js), поэтому связи нужно записать прямо в текст.
  function mentionTokensText(personIds, projectId) {
    const tokens = [];
    for (const id of personIds || []) {
      const person = db.people.get(id);
      if (person) tokens.push(`@[${person.name}](person:${id})`);
    }
    if (projectId) {
      const project = db.projects.get(projectId);
      if (project) tokens.push(`@[${project.name}](project:${projectId})`);
    }
    return tokens.join(' ');
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
      journal = db.journal.update(journal.id, { issueId: issue.id, agreementId: null, labId: null });
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
      journal = db.journal.update(journal.id, { agreementId: agreement.id, issueId: null, labId: null });
    } else if (journal.kind === 'idea') {
      const clean = stripMentionTokens(journal.text);
      const firstLine = clean.split(/\r?\n/)[0].trim();
      const title = firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : (firstLine || 'Идея из журнала');
      const authorPersonId = user?.personId || null;
      const payload = {
        entityType: 'idea',
        title,
        description: clean,
        authorId: authorPersonId,
        private: Boolean(journal.private),
        sourceJournalId: journal.id,
        createdByUserId: journal.authorUserId || user?.id || null,
      };
      let idea = journal.labId ? db.labs.get(journal.labId) : null;
      idea = idea ? db.labs.update(idea.id, payload) : db.labs.create(payload);
      journal = db.journal.update(journal.id, { labId: idea.id, issueId: null, agreementId: null });
    }
    return journal;
  }

  // Обратная синхронизация: проблема/договорённость/идея, созданная или изменённая
  // напрямую в своём разделе (минуя Журнал), заводит или обновляет связанную запись
  // в Журнале. Пишет прямо в db.journal, а не через POST/PUT /api/journal — поэтому
  // syncJournalDerivedEntity выше не запускается повторно и зацикливания нет.
  function syncEntityToJournal(collectionName, entity, user) {
    if (!entity) return entity;
    let kind, text, linkField;
    if (collectionName === 'issues') {
      kind = 'problem';
      linkField = 'issueId';
      const tokens = mentionTokensText(entity.relatedPersonIds, entity.projectId);
      text = [entity.title, tokens].filter(Boolean).join(' ');
    } else if (collectionName === 'agreements') {
      kind = 'agreement';
      linkField = 'agreementId';
      const tokens = mentionTokensText(entity.withPersonIds, entity.projectId);
      text = [entity.text, tokens].filter(Boolean).join(' ');
    } else if (collectionName === 'labs' && entity.entityType === 'idea') {
      kind = 'idea';
      linkField = 'labId';
      text = [entity.title, entity.description].filter(Boolean).join('\n');
    } else {
      return entity;
    }
    if (!text.trim()) return entity;

    const journalPatch = {
      kind,
      text,
      issueId: linkField === 'issueId' ? entity.id : null,
      agreementId: linkField === 'agreementId' ? entity.id : null,
      labId: linkField === 'labId' ? entity.id : null,
    };
    if (kind === 'idea') journalPatch.private = Boolean(entity.private);

    let journal = entity.sourceJournalId ? db.journal.get(entity.sourceJournalId) : null;
    if (journal) {
      journal = db.journal.update(journal.id, journalPatch);
    } else {
      journal = db.journal.create({
        ...journalPatch,
        authorUserId: entity.createdByUserId || user?.id || null,
        createdAt: entity.createdAt || new Date().toISOString(),
      });
    }
    return db[collectionName].update(entity.id, { sourceJournalId: journal.id });
  }

  // Когда проблему/договорённость/идею удаляют напрямую (не из Журнала), связанная
  // запись в Журнале остаётся (мы не удаляем чужие заметки без спроса), но ссылка на
  // уже несуществующую сущность снимается, чтобы «Открыть» не вела в никуда.
  function unlinkJournalFor(entity) {
    if (!entity || !entity.sourceJournalId) return;
    const journal = db.journal.get(entity.sourceJournalId);
    if (!journal) return;
    const field = journal.issueId === entity.id ? 'issueId' : journal.agreementId === entity.id ? 'agreementId' : journal.labId === entity.id ? 'labId' : null;
    if (field) db.journal.update(journal.id, { [field]: null });
  }

  return { journalMentionLinks, journalProblemTitle, syncJournalDerivedEntity, syncEntityToJournal, unlinkJournalFor };
};
