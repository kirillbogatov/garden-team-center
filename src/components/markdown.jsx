import * as React from 'react';
import { cn } from '@/lib/utils';

const INLINE_TOKEN_RE = /(@\[[^\]]+\]\((?:person|project|stakeholder|team):[^\)]+\)|`[^`\n]+`|\[[^\]\n]+\]\([^\)\n]+\)|\*\*[^*\n]+?\*\*|__[^_\n]+?__|~~[^~\n]+?~~|\*[^*\n]+?\*|_[^_\n]+?_)/g;
const MENTION_TOKEN_RE = /^@\[([^\]]+)\]\((person|project|stakeholder|team):([^\)]+)\)$/;

function safeHref(value) {
  const href = String(value || '').trim();
  if (!href) return null;
  if (/^(https?:|mailto:)/i.test(href) || href.startsWith('/') || href.startsWith('#')) return href;
  return null;
}

function parseInline(text, { onNavigate, keyPrefix = 'md' } = {}) {
  const source = String(text || '');
  const nodes = [];
  let cursor = 0;
  let index = 0;
  const tokenRe = new RegExp(INLINE_TOKEN_RE.source, 'g');
  let match;

  const pushText = (value) => {
    if (!value) return;
    nodes.push(<React.Fragment key={`${keyPrefix}-t-${index++}`}>{value}</React.Fragment>);
  };

  while ((match = tokenRe.exec(source))) {
    pushText(source.slice(cursor, match.index));
    const token = match[0];
    const key = `${keyPrefix}-n-${index++}`;
    const mention = token.match(MENTION_TOKEN_RE);
    if (mention) {
      const [, name, kind, id] = mention;
      nodes.push(onNavigate ? <button
        type="button"
        key={key}
        className="mention-inline"
        onClick={(event) => { event.stopPropagation(); onNavigate(kind, id); }}
      >{name}</button> : <span key={key} className="mention-inline mention-inline-static">{name}</span>);
    } else if (token.startsWith('`')) {
      nodes.push(<code key={key} className="markdown-inline-code">{token.slice(1, -1)}</code>);
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
      const href = safeHref(linkMatch?.[2]);
      if (!href) pushText(token);
      else nodes.push(<a
        key={key}
        href={href}
        target={/^https?:/i.test(href) ? '_blank' : undefined}
        rel={/^https?:/i.test(href) ? 'noreferrer' : undefined}
        className="markdown-link"
        onClick={(event) => event.stopPropagation()}
      >{parseInline(linkMatch[1], { onNavigate, keyPrefix:`${key}-link` })}</a>);
    } else if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(<strong key={key}>{parseInline(token.slice(2, -2), { onNavigate, keyPrefix:`${key}-strong` })}</strong>);
    } else if (token.startsWith('~~')) {
      nodes.push(<del key={key}>{parseInline(token.slice(2, -2), { onNavigate, keyPrefix:`${key}-del` })}</del>);
    } else {
      nodes.push(<em key={key}>{parseInline(token.slice(1, -1), { onNavigate, keyPrefix:`${key}-em` })}</em>);
    }
    cursor = match.index + token.length;
  }
  pushText(source.slice(cursor));
  return nodes;
}

function isBlockStart(line) {
  return /^\s*(#{1,6})\s+/.test(line)
    || /^\s*>\s?/.test(line)
    || /^\s*([-*+])\s+/.test(line)
    || /^\s*\d+\.\s+/.test(line)
    || /^\s*```/.test(line)
    || /^\s*((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})\s*$/.test(line);
}

function renderLineBreaks(lines, onNavigate, keyPrefix) {
  const out = [];
  lines.forEach((line, index) => {
    out.push(...parseInline(line, { onNavigate, keyPrefix:`${keyPrefix}-${index}` }));
    if (index < lines.length - 1) out.push(<br key={`${keyPrefix}-br-${index}`}/>);
  });
  return out;
}

export function MarkdownInline({ text, onNavigate, className }) {
  return <span className={cn('markdown-inline', className)}>{parseInline(text, { onNavigate })}</span>;
}

export function MarkdownText({ text, onNavigate, className }) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  let blockIndex = 0;

  while (i < lines.length) {
    if (!lines[i].trim()) { i += 1; continue; }
    const key = `md-block-${blockIndex++}`;
    const line = lines[i];

    const fence = line.match(/^\s*```([^`]*)$/);
    if (fence) {
      const language = fence[1].trim();
      const code = [];
      i += 1;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i += 1;
      blocks.push(<pre key={key} className="markdown-code-block"><code data-language={language || undefined}>{code.join('\n')}</code></pre>);
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = Math.min(6, heading[1].length);
      const Tag = `h${level}`;
      blocks.push(<Tag key={key} className={`markdown-heading markdown-heading-${level}`}>{parseInline(heading[2], { onNavigate, keyPrefix:key })}</Tag>);
      i += 1;
      continue;
    }

    if (/^\s*((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})\s*$/.test(line)) {
      blocks.push(<hr key={key} className="markdown-rule"/>);
      i += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push(<blockquote key={key} className="markdown-blockquote">{renderLineBreaks(quote, onNavigate, key)}</blockquote>);
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    if (unordered) {
      const items = [];
      while (i < lines.length) {
        const item = lines[i].match(/^\s*[-*+]\s+(.+)$/);
        if (!item) break;
        const task = item[1].match(/^\[([ xX])\]\s+(.*)$/);
        items.push(task ? { text:task[2], checked:task[1].toLowerCase()==='x' } : { text:item[1], checked:null });
        i += 1;
      }
      blocks.push(<ul key={key} className="markdown-list markdown-list-unordered">{items.map((item, idx)=><li key={`${key}-${idx}`} className={item.checked === null ? undefined : 'markdown-task-item'}>{item.checked !== null && <input type="checkbox" checked={item.checked} readOnly tabIndex={-1} aria-hidden="true"/>}<span>{parseInline(item.text, { onNavigate, keyPrefix:`${key}-${idx}` })}</span></li>)}</ul>);
      continue;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ordered) {
      const items = [];
      while (i < lines.length) {
        const item = lines[i].match(/^\s*\d+\.\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        i += 1;
      }
      blocks.push(<ol key={key} className="markdown-list markdown-list-ordered">{items.map((item, idx)=><li key={`${key}-${idx}`}>{parseInline(item, { onNavigate, keyPrefix:`${key}-${idx}` })}</li>)}</ol>);
      continue;
    }

    const paragraph = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) paragraph.push(lines[i++]);
    blocks.push(<p key={key} className="markdown-paragraph">{renderLineBreaks(paragraph, onNavigate, key)}</p>);
  }

  return <div className={cn('markdown-text', className)}>{blocks}</div>;
}
