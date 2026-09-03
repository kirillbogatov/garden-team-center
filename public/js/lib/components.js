// View registry and empty-state primitive.
const Views = {};

function emptyState(title, hint, iconName) {
  return `<div class="empty-state">
    <div class="icon">${icon(iconName || 'search', 30)}</div>
    <div class="title">${escapeHtml(title)}</div>
    <div class="tiny">${escapeHtml(hint || '')}</div>
  </div>`;
}

