import { useEffect, useRef, useState } from "react";

export function SharePlanDialog({ url, onClose }: { url: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied. Share it to send this snapshot.");
    } catch {
      setStatus("Could not copy automatically. Select the link above and copy it manually.");
    }
  }
  return <dialog className="review-dialog share-dialog" ref={ref} aria-labelledby="share-title" onCancel={event => {
    event.preventDefault();
    onClose();
  }}>
    <h2 id="share-title">Share this plan</h2>
    <p>Anyone with this link can read the included guest names and columns, preferences, tables, pins, and current seating plan. Saved versions are excluded. Later edits need a new link.</p>
    <label>Share link<input aria-label="Share link" readOnly value={url} onFocus={event => event.target.select()} /></label>
    {url.length > 8000 && <p>This is a long link. If your messaging app cannot send it, download and share a backup instead.</p>}
    <p role="status">{status}</p>
    <div className="inline-actions">
      <button type="button" onClick={onClose}>Close</button>
      <button type="button" className="primary-button" onClick={copy} autoFocus>Copy share link</button>
    </div>
  </dialog>;
}
