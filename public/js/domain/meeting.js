// Shared meeting presentation helpers.
// "1:1 с Алёна Богатова" -> "Алёна Богатова" (тип уже показан бейджем рядом, дублировать не нужно).
function meetingDisplayTitle(m) {
  const title = m.title || '';
  const prefixes = ['1:1 с ', '1:1 c ', 'Performance review: ', 'PR: '];
  for (const prefix of prefixes) {
    if (title.toLowerCase().startsWith(prefix.toLowerCase())) {
      const rest = title.slice(prefix.length).trim();
      if (rest) return rest;
    }
  }
  return title;
}

