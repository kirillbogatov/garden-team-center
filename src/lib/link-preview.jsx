import { BookOpen, Cloud, Figma, FileSpreadsheet, FileText, Github, Gitlab, Link2, PanelsTopLeft, Presentation } from 'lucide-react';

export function jiraLabelFromUrl(value) {
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    const ticket = parts.at(-1);
    return ticket || url.hostname;
  } catch (_) {
    return String(value || '').trim() || 'Jira';
  }
}

export function normalizeJiraUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch (_) {
    return null;
  }
}

export function normalizeMaterialUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch (_) {
    return null;
  }
}

export function MaterialLetterIcon({ letter, title, className = '' }) {
  return <span title={title} aria-label={title} className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border border-current/25 text-[12px] font-semibold leading-none ${className}`}>{letter}</span>;
}

export function MaterialServiceIcon({ url }) {
  let parsed;
  try { parsed = new URL(url); } catch (_) { return <Link2 className="h-4 w-4 shrink-0" aria-label="Ссылка"/>; }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const path = parsed.pathname.toLowerCase();
  const iconClass = 'h-4 w-4 shrink-0';

  if (host === 'docs.google.com') {
    if (path.startsWith('/spreadsheets/')) return <FileSpreadsheet className={iconClass} aria-label="Google Sheets"/>;
    if (path.startsWith('/presentation/')) return <Presentation className={iconClass} aria-label="Google Slides"/>;
    return <FileText className={iconClass} aria-label="Google Docs"/>;
  }
  if (host.endsWith('drive.google.com')) return <Cloud className={iconClass} aria-label="Google Drive"/>;
  if (host === 'figma.com' || host.endsWith('.figma.com')) return <Figma className={iconClass} aria-label="Figma"/>;
  if (host === 'github.com' || host.endsWith('.github.com')) return <Github className={iconClass} aria-label="GitHub"/>;
  if (host === 'gitlab.com' || host.endsWith('.gitlab.com')) return <Gitlab className={iconClass} aria-label="GitLab"/>;
  if (host.includes('miro.com')) return <MaterialLetterIcon letter="M" title="Miro"/>;
  if (host.includes('notion.so') || host.includes('notion.site')) return <MaterialLetterIcon letter="N" title="Notion"/>;
  if (host.includes('atlassian.net') && path.includes('/wiki')) return <MaterialLetterIcon letter="C" title="Confluence"/>;
  if (host.includes('atlassian.net')) return <MaterialLetterIcon letter="J" title="Jira"/>;
  if (host.includes('confluence')) return <BookOpen className={iconClass} aria-label="Confluence"/>;
  if (host.includes('dropbox.com')) return <MaterialLetterIcon letter="D" title="Dropbox"/>;
  if (host.includes('onedrive.live.com') || host.includes('sharepoint.com')) return <Cloud className={iconClass} aria-label="OneDrive"/>;

  if (/\.pdf$/i.test(path)) return <FileText className={iconClass} aria-label="PDF"/>;
  if (/\.(xlsx?|csv)$/i.test(path)) return <FileSpreadsheet className={iconClass} aria-label="Таблица"/>;
  if (/\.(pptx?|odp)$/i.test(path)) return <Presentation className={iconClass} aria-label="Презентация"/>;
  if (/\.(docx?|odt|rtf|txt)$/i.test(path)) return <FileText className={iconClass} aria-label="Документ"/>;
  if (host.includes('miro')) return <PanelsTopLeft className={iconClass} aria-label="Доска"/>;
  return <Link2 className={iconClass} aria-label="Ссылка"/>;
}
