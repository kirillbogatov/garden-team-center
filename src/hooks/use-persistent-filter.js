import * as React from 'react';

// Store each catalog's selections independently; explicit deep-link values win.
export function usePersistentFilter(scope, name, defaultValue, override) {
  const key = `garden:filters:v1:${scope}:${name}`;
  const [value, setValue] = React.useState(() => {
    if (override !== undefined && override !== null) return override;
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? defaultValue : JSON.parse(stored);
    } catch (_) { return defaultValue; }
  });
  React.useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* storage unavailable */ }
  }, [key, value]);
  return [value, setValue];
}
