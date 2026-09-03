// Упоминания в тексте (Журнал, Договорённости) записываются в формате:
//   @[Имя](person:ppl_123)  или  @[Проект X](project:prj_456)  или  @[Имя](stakeholder:ppl_789)
// Эта функция достаёт список упоминаний из произвольного текста.

const MENTION_RE = /@\[([^\]]+)\]\((person|project|stakeholder|team):([a-zA-Z0-9_]+)\)/g;

function extractMentions(text) {
  if (!text) return [];
  const mentions = [];
  let m;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text)) !== null) {
    mentions.push({ label: m[1], type: m[2], id: m[3] });
  }
  return mentions;
}

module.exports = { extractMentions, MENTION_RE };
