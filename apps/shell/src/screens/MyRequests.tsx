import type { SubmissionStatus } from "@itg/contracts";
import { useEffect } from "preact/hooks";
import { Screen } from "../components/Screen";
import type { OutboxItem } from "../services/outbox";

export interface MyRequestsProps {
  items: readonly OutboxItem[];
  notice?: string | null;
  onRefresh(): void;
  onDismiss(clientId: string): void;
  onNew(): void;
  onBack(): void;
}

const STATUS: Record<SubmissionStatus, string> = {
  received: "Received",
  reviewing: "Reviewing",
  planned: "Planned",
  declined: "Declined",
  shipped: "Shipped",
};

export function statusLabel(item: OutboxItem): string {
  if (item.state === "failed") return "Couldn't send";
  if (item.state === "sent") return STATUS[item.status ?? "received"];
  return "Waiting to send";
}

/** FR-SUB-6: local outbox state plus server status and public notes. */
export function MyRequests(props: MyRequestsProps) {
  useEffect(() => props.onRefresh(), []);
  return (
    <Screen
      title="My requests"
      onBack={props.onBack}
      backLabel="Library"
      actions={
        <button type="button" class="btn ghost" onClick={props.onRefresh}>
          Refresh
        </button>
      }
    >
      {props.notice && (
        <p class="notice" role="status">
          {props.notice}
        </p>
      )}
      {props.items.length === 0 ? (
        <p>You haven't requested any games yet.</p>
      ) : (
        <ul class="requests" aria-live="polite">
          {props.items.map((item) => (
            <li key={item.clientId} class="request" data-state={item.state}>
              <p class="request-text">{item.payload.description || "Request from this device"}</p>
              <p class="request-status">
                Status: <strong>{statusLabel(item)}</strong>
              </p>
              {item.message && <p class="hint">{item.message}</p>}
              {item.publicNote && <p class="public-note">Note from us: {item.publicNote}</p>}
              {item.state === "failed" && (
                <button type="button" class="btn" onClick={() => props.onDismiss(item.clientId)}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <button type="button" class="btn primary" onClick={props.onNew}>
        Request a game
      </button>
    </Screen>
  );
}
