import { useState, useMemo, useEffect, useRef, useCallback } from "react";

import { getToday } from "../lib/utils.js";
import { useEntityStore, useFilterState } from "./useEntityStore.js";
import { useAppDerived } from "./useAppDerived.js";

function clampedToday() {
  const d = getToday();
  return d >= "2025-01-01" ? d : "2025-01-18";
}

function clampedMonth() {
  const d = getToday();
  return d >= "2025-01-01" ? d.substring(0, 7) : "2025-01";
}

function useAppUi() {
  const [tab, setTab] = useState("dashboard");
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [billMonth, setBillMonth] = useState(clampedMonth);
  const [logDate, setLogDate] = useState(clampedToday);

  const setF = useCallback(k => e => setForm(p => ({ ...p, [k]: e.target.value })), []);

  const toastIdRef = useRef(0);
  const toast$ = useCallback((msg, type = "info") => {
    const id = ++toastIdRef.current;
    setToast({ id, msg, type });
    setTimeout(() => {
      setToast(curr => (curr && curr.id === id ? null : curr));
    }, 3000);
  }, []);
  useEffect(() => () => { toastIdRef.current = -1; }, []);

  const openModal = useCallback((type, data = {}) => { setModal({ type, data }); setForm(data); }, []);
  const closeModal = useCallback(() => { setModal(null); setForm({}); }, []);

  return {
    tab, setTab, toast, setToast, modal, form, billMonth, setBillMonth, logDate, setLogDate,
    setF, toast$, openModal, closeModal,
  };
}

export function useAppState(token) 
 {
  const entity = useEntityStore(token);
  const filters = useFilterState();
  const ui = useAppUi();
  const today = useMemo(() => clampedToday(), []);

  const derived = useAppDerived({
    ...entity, ...filters,
    logDate: ui.logDate,
  });

  return { today, ...entity, ...filters, ...ui, ...derived };
}
