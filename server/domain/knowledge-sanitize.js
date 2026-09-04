'use strict';

// Server-side hardening for kbDocs.contentHtml. The client (public/js/views/knowledge-base.js,
// sanitizeKnowledgeHtml) does the primary sanitization with a DOM-parser allowlist, but a direct
// API call bypasses the browser entirely — this must independently strip anything dangerous.
const ALLOWED_HREF_SCHEME = /^(https?:|mailto:|#)/i;
const ALLOWED_SRC_SCHEME = /^(https?:|data:image\/)/i;

function sanitizeKnowledgeHtmlServer(value) {
  return String(value || '')
    .replace(/<(script|style|iframe|object|embed|form|button)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(?:script|style|iframe|object|embed|form|input|button)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '$1="#"')
    // Scheme allowlist: mirrors the client's sanitizeKnowledgeHtml policy so a
    // direct API call (bypassing the browser sanitizer) can't persist a
    // dangerous href/src value either.
    .replace(/\b(href|src)\s*=\s*(["'])([\s\S]*?)\2/gi, (match, attr, quote, rawValue) => {
      const value = rawValue.trim();
      if (attr.toLowerCase() === 'href') {
        return ALLOWED_HREF_SCHEME.test(value) ? match : `href=${quote}#${quote}`;
      }
      return ALLOWED_SRC_SCHEME.test(value) ? match : `src=${quote}${quote}`;
    });
}

module.exports = { sanitizeKnowledgeHtmlServer };
