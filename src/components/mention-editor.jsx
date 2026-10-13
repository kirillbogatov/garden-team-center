import * as React from 'react';
import { BriefcaseBusiness, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarkdownInline } from '@/components/markdown';

const MENTION_RE = /@\[([^\]]+)\]\((person|project|stakeholder|team):([^\)]+)\)/g;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalize(value) {
  return String(value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').trim();
}

export function mentionStorageToPlainText(value) {
  return String(value || '').replace(MENTION_RE, (_match, name) => name);
}

export function mentionStorageToQueryText(value) {
  return String(value || '').replace(MENTION_RE, (_match, name) => `@${name}`);
}

export function mentionStorageToHtml(value) {
  const source = String(value || '');
  let out = '';
  let last = 0;
  MENTION_RE.lastIndex = 0;
  let match;
  while ((match = MENTION_RE.exec(source))) {
    out += escapeHtml(source.slice(last, match.index)).replace(/\n/g, '<br>');
    out += `<span contenteditable="false" data-mention="1" data-mention-type="${escapeHtml(match[2])}" data-mention-id="${escapeHtml(match[3])}" data-mention-name="${escapeHtml(match[1])}" class="mention-token">${escapeHtml(match[1])}</span>`;
    last = match.index + match[0].length;
  }
  out += escapeHtml(source.slice(last)).replace(/\n/g, '<br>');
  return out;
}

const EDITOR_INLINE_TOKEN_RE = /(@\[[^\]]+\]\((?:person|project|stakeholder|team):[^\)]+\)|`[^`\n]+`|\[[^\]\n]+\]\([^\)\n]+\)|\*\*[^*\n]+?\*\*|__[^_\n]+?__|~~[^~\n]+?~~|\*[^*\n]+?\*|_[^_\n]+?_)/g;

function safeEditorHref(value) {
  const href = String(value || '').trim();
  if (/^(https?:|mailto:)/i.test(href) || href.startsWith('/') || href.startsWith('#')) return href;
  return '';
}

function inlineMarkdownToEditorHtml(value) {
  const source = String(value || '');
  const tokenRe = new RegExp(EDITOR_INLINE_TOKEN_RE.source, 'g');
  let out = '';
  let cursor = 0;
  let match;
  while ((match = tokenRe.exec(source))) {
    out += escapeHtml(source.slice(cursor, match.index));
    const token = match[0];
    const mention = token.match(/^@\[([^\]]+)\]\((person|project|stakeholder|team):([^\)]+)\)$/);
    if (mention) {
      out += `<span contenteditable="false" data-mention="1" data-mention-type="${escapeHtml(mention[2])}" data-mention-id="${escapeHtml(mention[3])}" data-mention-name="${escapeHtml(mention[1])}" class="mention-token">${escapeHtml(mention[1])}</span>`;
    } else if (token.startsWith('`')) {
      out += `<code>${escapeHtml(token.slice(1, -1))}</code>`;
    } else if (token.startsWith('[')) {
      const link = token.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
      const href = safeEditorHref(link?.[2]);
      out += href ? `<a href="${escapeHtml(href)}">${inlineMarkdownToEditorHtml(link[1])}</a>` : escapeHtml(token);
    } else if (token.startsWith('**') || token.startsWith('__')) {
      out += `<strong>${inlineMarkdownToEditorHtml(token.slice(2, -2))}</strong>`;
    } else if (token.startsWith('~~')) {
      out += `<del>${inlineMarkdownToEditorHtml(token.slice(2, -2))}</del>`;
    } else {
      out += `<em>${inlineMarkdownToEditorHtml(token.slice(1, -1))}</em>`;
    }
    cursor = match.index + token.length;
  }
  out += escapeHtml(source.slice(cursor));
  return out;
}

function isMarkdownBlockLine(line) {
  return /^\s*(#{1,6})\s+/.test(line)
    || /^\s*>\s?/.test(line)
    || /^\s*[-*+]\s+/.test(line)
    || /^\s*\d+\.\s+/.test(line);
}

export function mentionStorageToRichMarkdownHtml(value) {
  const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      blocks.push('<div><br></div>');
      i += 1;
      continue;
    }
    const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${inlineMarkdownToEditorHtml(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) rows.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push(`<blockquote>${rows.map(inlineMarkdownToEditorHtml).join('<br>')}</blockquote>`);
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length) {
        const item = lines[i].match(/^\s*[-*+]\s+(.+)$/);
        if (!item) break;
        items.push(`<li>${inlineMarkdownToEditorHtml(item[1])}</li>`);
        i += 1;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length) {
        const item = lines[i].match(/^\s*\d+\.\s+(.+)$/);
        if (!item) break;
        items.push(`<li>${inlineMarkdownToEditorHtml(item[1])}</li>`);
        i += 1;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }
    const paragraph = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !isMarkdownBlockLine(lines[i])) paragraph.push(lines[i++]);
    blocks.push(`<div>${paragraph.map(inlineMarkdownToEditorHtml).join('<br>')}</div>`);
  }
  return blocks.join('');
}

function serializeNode(node) {
  if (!node) return '';
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node;
  if (el.dataset?.mention === '1') {
    return `@[${el.dataset.mentionName || ''}](${el.dataset.mentionType || 'person'}:${el.dataset.mentionId || ''})`;
  }
  if (el.tagName === 'BR') return '\n';
  if (el.tagName === 'UL' || el.tagName === 'OL') {
    const ordered = el.tagName === 'OL';
    return Array.from(el.children)
      .filter((child) => child.tagName === 'LI')
      .map((child, index) => `${ordered ? `${index + 1}.` : '*'} ${Array.from(child.childNodes).map(serializeNode).join('').trim()}`)
      .join('\n') + '\n';
  }
  const body = Array.from(el.childNodes).map(serializeNode).join('');
  if (/^H[1-6]$/.test(el.tagName)) return `${'#'.repeat(Number(el.tagName.slice(1)))} ${body}\n`;
  if (el.tagName === 'BLOCKQUOTE') return body.split('\n').filter(Boolean).map((line) => `> ${line}`).join('\n') + '\n';
  if (el.tagName === 'STRONG' || el.tagName === 'B') return `**${body}**`;
  if (el.tagName === 'EM' || el.tagName === 'I') return `*${body}*`;
  if (el.tagName === 'DEL' || el.tagName === 'S') return `~~${body}~~`;
  if (el.tagName === 'CODE' && el.parentElement?.tagName !== 'PRE') return `\`${body}\``;
  if (el.tagName === 'A') return `[${body}](${el.getAttribute('href') || ''})`;
  if (el.tagName === 'LI') return body;
  if (el.tagName === 'DIV' || el.tagName === 'P') return `${body}\n`;
  return body;
}

export function serializeMentionEditor(root) {
  if (!root) return '';
  return Array.from(root.childNodes).map(serializeNode).join('').replace(/\n{3,}/g, '\n\n').replace(/\n$/, '');
}

function currentMentionFragment(root) {
  const selection = window.getSelection();
  if (!root || !selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || range.startContainer.nodeType !== Node.TEXT_NODE) return null;
  const text = range.startContainer.nodeValue || '';
  const before = text.slice(0, range.startOffset);
  // Разрешаем пробелы и пунктуацию внутри имени/названия проекта, но начинаем mention
  // только после границы текста. Это позволяет искать, например, "@AI Tools" и "(@Анна".
  const match = before.match(/(?:^|[\s([{«"'])@([^@\n]{0,80})$/u);
  if (!match) return null;
  const fragment = match[1] || '';
  return {
    node: range.startContainer,
    start: range.startOffset - fragment.length - 1,
    end: range.startOffset,
    fragment,
  };
}

function insertMention(root, suggestion) {
  const slot = currentMentionFragment(root);
  if (!slot) return false;
  const text = slot.node.nodeValue || '';
  const before = text.slice(0, slot.start);
  const after = text.slice(slot.end);
  const parent = slot.node.parentNode;
  const beforeNode = document.createTextNode(before);
  const token = document.createElement('span');
  token.contentEditable = 'false';
  token.dataset.mention = '1';
  token.dataset.mentionType = suggestion.kind;
  token.dataset.mentionId = suggestion.id;
  token.dataset.mentionName = suggestion.name;
  token.className = 'mention-token';
  token.textContent = suggestion.name;
  const spacer = document.createTextNode(` ${after}`);
  parent.insertBefore(beforeNode, slot.node);
  parent.insertBefore(token, slot.node);
  parent.insertBefore(spacer, slot.node);
  parent.removeChild(slot.node);

  const selection = window.getSelection();
  const range = document.createRange();
  range.setStart(spacer, Math.min(1, spacer.nodeValue?.length || 0));
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  root.focus();
  return true;
}

function rankCandidates(items, query) {
  if (!query) return items;
  const q = normalize(query);
  return [...items]
    .map((item) => {
      const name = normalize(item.name);
      const words = name.split(/\s+/);
      let score = 3;
      if (name === q) score = 0;
      else if (name.startsWith(q)) score = 1;
      else if (words.some((word) => word.startsWith(q))) score = 2;
      return { item, score };
    })
    .filter(({ item }) => normalize(item.name).includes(q))
    .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name, 'ru'))
    .map(({ item }) => item);
}

export function MentionEditor({
  value = '',
  onChange,
  onBlur,
  people = [],
  projects = [],
  placeholder = '',
  className,
  editorClassName,
  autoFocus = false,
  submitOnEnter = false,
  singleLine = false,
  onSubmit,
  onEditorKeyDown,
  onEditorFocus,
  onEditorBlur,
  editorRef,
  ariaLabel = 'Текст',
  richMarkdown = false,
}) {
  const ref = React.useRef(null);
  const setRootRef = React.useCallback((node) => {
    ref.current = node;
    if (typeof editorRef === 'function') editorRef(node);
    else if (editorRef && typeof editorRef === 'object') editorRef.current = node;
  }, [editorRef]);
  const lastExternal = React.useRef(null);
  const [fragment, setFragment] = React.useState(null);
  const [active, setActive] = React.useState(-1);

  const suggestions = React.useMemo(() => {
    if (fragment == null) return [];
    const persons = people
      .filter((p) => p?.id && p?.name)
      .map((p) => ({
        kind: p.type === 'stakeholder' ? 'stakeholder' : 'person',
        id: p.id,
        name: p.name,
        meta: p.type === 'stakeholder' ? 'Стейкхолдер' : (p.role || 'Человек'),
      }));
    const projectItems = projects
      .filter((p) => p?.id && p?.name)
      .map((p) => ({ kind: 'project', id: p.id, name: p.name, meta: 'Проект' }));
    return rankCandidates([...persons, ...projectItems], fragment).slice(0, 8);
  }, [fragment, people, projects]);

  React.useLayoutEffect(() => {
    const root = ref.current;
    const normalized = String(value || '');
    if (!root || lastExternal.current === normalized) return;
    const current = serializeMentionEditor(root);
    if (current !== normalized) root.innerHTML = richMarkdown ? mentionStorageToRichMarkdownHtml(normalized) : mentionStorageToHtml(normalized);
    lastExternal.current = normalized;
  }, [value, richMarkdown]);

  React.useEffect(() => {
    if (autoFocus) requestAnimationFrame(() => ref.current?.focus());
  }, [autoFocus]);

  const updateFragment = React.useCallback(() => {
    const slot = currentMentionFragment(ref.current);
    setFragment(slot ? slot.fragment : null);
    setActive(-1);
  }, []);

  const emit = React.useCallback(() => {
    const next = serializeMentionEditor(ref.current);
    lastExternal.current = next;
    onChange?.(next);
    updateFragment();
    return next;
  }, [onChange, updateFragment]);

  const choose = (item) => {
    if (!insertMention(ref.current, item)) return;
    setFragment(null);
    setActive(-1);
    requestAnimationFrame(() => emit());
  };

  const handleKeyDown = (event) => {
    onEditorKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (fragment != null && suggestions.length) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive((index) => (index + 1) % suggestions.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setFragment(null);
        return;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && active >= 0) {
        event.preventDefault();
        choose(suggestions[active]);
        return;
      }
    }
    if (singleLine && event.key === 'Enter') {
      event.preventDefault();
      if (!event.shiftKey && onSubmit) onSubmit();
      else if (!onSubmit) ref.current?.blur();
      return;
    }
    if (submitOnEnter && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSubmit?.();
    }
  };

  const handlePaste = (event) => {
    const text = event.clipboardData?.getData('text/plain');
    if (text == null) return;
    event.preventDefault();
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const lines = singleLine ? [text.replace(/\r?\n/g, ' ')] : text.split(/\r?\n/);
    const fragmentNode = document.createDocumentFragment();
    lines.forEach((line, index) => {
      if (index) fragmentNode.appendChild(document.createElement('br'));
      fragmentNode.appendChild(document.createTextNode(line));
    });
    const last = fragmentNode.lastChild;
    range.insertNode(fragmentNode);
    if (last) {
      range.setStartAfter(last);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    emit();
  };

  return <div className={cn('relative', className)}>
    <div
      ref={setRootRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={singleLine ? "false" : "true"}
      aria-label={ariaLabel}
      data-placeholder={placeholder}
      onInput={emit}
      onFocus={onEditorFocus}
      onPaste={handlePaste}
      onKeyDown={handleKeyDown}
      onKeyUp={updateFragment}
      onClick={updateFragment}
      onBlur={() => {
        const next = serializeMentionEditor(ref.current);
        onBlur?.(next);
        onEditorBlur?.(next);
        window.setTimeout(() => setFragment(null), 120);
      }}
      className={cn('mention-editor min-h-[92px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm leading-6 outline-none transition-colors focus:border-ring empty:before:pointer-events-none empty:before:text-muted-foreground/75 empty:before:content-[attr(data-placeholder)]', singleLine && 'mention-editor-single-line', richMarkdown && 'mention-editor-rich-markdown', editorClassName)}
    />
    {fragment != null && suggestions.length > 0 && <div className="absolute left-2 right-2 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg">
      {suggestions.map((item, index) => <button
        type="button"
        key={`${item.kind}:${item.id}`}
        onMouseDown={(event) => { event.preventDefault(); choose(item); }}
        className={cn('flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm', index === active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted')}
      >
        {item.kind === 'project' ? <BriefcaseBusiness className="h-3.5 w-3.5 text-muted-foreground"/> : <UserRound className="h-3.5 w-3.5 text-muted-foreground"/>}
        <span className="min-w-0 flex-1 truncate">{item.name}</span>
        <span className="text-[12px] text-muted-foreground">{item.meta}</span>
      </button>)}
    </div>}
  </div>;
}

export function MentionText({ text, onNavigate, className }) {
  return <MarkdownInline text={text} onNavigate={onNavigate} className={className}/>;
}
