import { useState, useMemo, useEffect, useRef, useCallback } from "react";

import { getToday } from "../lib/utils.js";
import { useEntityStore, useFilterState } from "./useEntityStore.js";
import { useAppDerived } from "./useAppDerived.js";

function clampedToday() {
  return getToday();
}

function clampedMonth() {
  return getToday().substring(0, 7);
}

function useAppUi() {
  const [tab, setTab] = useState("dashboard");
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [billMonth, setBillMonth] = useState(clampedMonth);
  const [logDate, setLogDate] = useState(clampedToday);

  const setF = useCallback(
    (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value })),
    [],
  );

  // ✅ Fix U2: Track timer ID to clear on unmount and prevent leaks
  const toastIdRef = useRef(0);
  const toastTimerRef = useRef(null);

  const toast$ = useCallback((msg, type = "info") => {
    const id = ++toastIdRef.current;

    // ✅ Stop the timer if a new toast replaces the old one
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    setToast({ id, msg, type });

    // Schedule the new timeout and store its ID
    toastTimerRef.current = setTimeout(() => {
      setToast((curr) => (curr && curr.id === id ? null : curr));
      toastTimerRef.current = null;
    }, 3000);
  }, []);

  // ✅ Clear timer on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const openModal = useCallback((type, data = {}) => {
    setModal({ type, data });
    setForm(data);
  }, []);

  const closeModal = useCallback(() => {
    setModal(null);
    setForm({});
  }, []);

  return {
    tab,
    setTab,
    toast,
    setToast,
    modal,
    form,
    billMonth,
    setBillMonth,
    logDate,
    setLogDate,
    setF,
    toast$,
    openModal,
    closeModal,
  };
}

export function useAppState() {
  const entity = useEntityStore();
  const filters = useFilterState();
  const ui = useAppUi();
  const today = useMemo(() => clampedToday(), []);

  const derived = useAppDerived({
    ...entity,
    ...filters,
    logDate: ui.logDate,
  });

  return { today, ...entity, ...filters, ...ui, ...derived };
}
