/** Resolve a stored mention to its detail page without losing its entity type. */
export function mentionRoute(kind, id) {
  if (!id) return null;
  const ref = encodeURIComponent(id);
  if (kind === 'project') return `/projects/${ref}`;
  if (kind === 'person' || kind === 'team' || kind === 'stakeholder') return `/people/${ref}`;
  return null;
}
