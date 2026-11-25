import { useCallback, useEffect, useRef, useState } from "react";

// Load data from the API when a screen opens. `reload()` fetches it again (e.g. after a change).
export function useLoad(fn) {
  const [state, setState] = useState({ data: null, error: "", loading: true });
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const reload = useCallback(async () => {
    try {
      const data = await fnRef.current();
      setState({ data, error: "", loading: false });
    } catch (e) {
      setState((s) => ({ ...s, error: e.message, loading: false }));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}
