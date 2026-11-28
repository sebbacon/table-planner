import { useEffect, useRef, useState } from "react";

export const WELCOME_STORAGE_KEY = "table-planner-welcome-dismissed";

export function WelcomeDialog({ suspended = false }: { suspended?: boolean }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(WELCOME_STORAGE_KEY) !== "true";
    } catch {
      return true;
    }
  });
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open || suspended) return;
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, [open, suspended]);

  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(WELCOME_STORAGE_KEY, "true");
    } catch {
      // The dialog can still be dismissed when browser storage is unavailable.
    }
  }

  if (!open || suspended) return null;
  return <dialog className="review-dialog welcome-dialog" ref={ref} aria-labelledby="welcome-title" onCancel={event => { event.preventDefault(); dismiss(); }}>
    <h2 id="welcome-title">Welcome to Table Planner</h2>
    <p>Get a first draft, then make it yours.</p>
    <ol>
      <li><strong>Add your tables and guests.</strong> Start with a few rules: perhaps a fixed top table, then keeping friends together or mixing departments.</li>
      <li><strong>Generate some options.</strong> Pins and fixed tables come first, then individual preferences, then group rules. More rules can compete; fewer leave room for a good mix.</li>
      <li><strong>Keep the good bits.</strong> Pin guests whose seats you want to keep and generate again for fresh options. Finish by moving or swapping guests by hand.</li>
    </ol>
    <p>Changes save only in this browser. Keep a share link or download a backup for a separate copy. After editing, create a new link or backup; old copies do not update.</p>
    <p><a href="./help.html" target="_blank" rel="noopener">Read the full guide (opens in a new tab)</a> for examples of which rules take priority and how to save your work.</p>
    <div className="inline-actions"><button type="button" className="primary-button" onClick={dismiss} autoFocus>Get started</button></div>
  </dialog>;
}
