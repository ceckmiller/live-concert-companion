"use client";

export type AttendeeUser = { id: string; email: string; name: string };

export function AttendeePicker({
  users,
  selected,
  currentUserId,
  disabled,
  onToggle,
}: {
  users: AttendeeUser[];
  selected: Set<string>;
  currentUserId?: string;
  disabled?: boolean;
  onToggle: (id: string) => void;
}) {
  if (users.length === 0) {
    return <p className="concert-edit-hint">Noch keine weiteren Personen angelegt.</p>;
  }

  return (
    <ul className="attendee-check-list">
      {users.map((u) => (
        <li key={u.id}>
          <label className="concert-edit-check">
            <input
              type="checkbox"
              checked={selected.has(u.id)}
              onChange={() => onToggle(u.id)}
              disabled={disabled || u.id === currentUserId}
            />
            <span>
              {u.name} <span className="muted">({u.email})</span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
