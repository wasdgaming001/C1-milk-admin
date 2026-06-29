// src/App.jsx
import { Toast } from "./components/ui.jsx";
import { AppShell } from "./components/AppShell.jsx";
import { AppPage } from "./components/AppPage.jsx";
import { AppModals } from "./components/AppModals.jsx";
import { Login } from "./components/Login.jsx";
import { useAppState } from "./hooks/useAppState.js";
import { useAppHandlers } from "./hooks/useAppHandlers.js";
import { useAuth } from "./hooks/useAuth.js";

export default function App() {
  const auth = useAuth();
  const state = useAppState(auth.token);

  // If not logged in, show the PIN screen
  if (!auth.isAuthenticated) {
    return <Login onLogin={auth.login} loading={auth.loading} error={auth.error} />;
  }

  const handlers = useAppHandlers(state);

  const footer = (
    <>
      {state.toast && (
        <Toast msg={state.toast.msg} type={state.toast.type} onClose={() => state.setToast(null)} key={state.toast.id} />
      )}
    </>
  );

  return (
    <AppShell 
      tab={state.tab} 
      today={state.today} 
      queue={state.queue} 
      onTabChange={state.setTab} 
      footer={footer}
    >
      <AppPage tab={state.tab} state={state} handlers={handlers} />
      <AppModals state={state} handlers={handlers} />
    </AppShell>
  );
}