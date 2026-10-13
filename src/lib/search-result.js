export function searchResultRoute(group, item) {
  if (!item) return null;
  const person = item.person || item;
  const identifiers = {
    tasks: item.taskKey || item.id,
    meetings: item.meetingKey || item.id,
    projects: item.projectKey || item.id,
    goals: item.goalKey || item.id,
    issues: item.issueKey || item.id,
    processes: item.processKey || item.id,
    agreements: item.agreementKey || item.id,
    tools: item.toolKey || item.id,
  };

  if (identifiers[group]) return `/${group}/${encodeURIComponent(identifiers[group])}`;
  if (group === 'people' || group === 'team' || group === 'stakeholders') {
    const ref = person.slug || person.id || item.entityId;
    return ref ? `/people/${encodeURIComponent(ref)}` : null;
  }
  if (group === 'journal') {
    const ref = item.noteKey || item.id;
    return ref ? `/journal?entry=${encodeURIComponent(ref)}` : '/journal';
  }
  if (group === 'labs') {
    if (item.entityType === 'idea') return '/ideas';
    const ref = item.blueprintKey || item.id;
    return ref ? `/workshop/${encodeURIComponent(ref)}` : '/workshop';
  }
  if (group === 'vacations') return '/calendar';
  if (group === 'checkins') return `/weekly${item.personId ? `?person=${encodeURIComponent(item.personId)}` : ''}`;
  if (group === 'documents') return '/knowledge';
  return null;
}

export function searchResultEntity(item) {
  return item?.person || item;
}
