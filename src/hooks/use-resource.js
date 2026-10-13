import * as React from 'react';
import { api } from '@/lib/api';

export function useResource(name, deps = []) {
  const [data, setData] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await api.resource(name).list()); }
    catch (e) { setError(e); }
    finally { setLoading(false); }
  }, [name, ...deps]);
  React.useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load, setData };
}

export function useEndpoint(url, deps = []) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await api.get(url)); }
    catch (e) { setError(e); }
    finally { setLoading(false); }
  }, [url, ...deps]);
  React.useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load, setData };
}
