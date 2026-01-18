import { useState } from "react";

const REASONS = [
    { value: "TYPO", label: "Typo correction" },
    { value: "LATE_ENTRY", label: "Late entry" },
    { value: "CLARIFICATION", label: "Clarification" },
];

export default function EditIntentGate({ onConfirm, onCancel }) {
    const [reasonType, setReasonType] = useState("");
    const [detail, setDetail] = useState("");

    const canProceed = reasonType && detail.trim().length > 3;

    return (
        <div style={{ display: "grid", gap: 10 }}>
            <label>
                Reason
                <select value={reasonType} onChange={(e) => setReasonType(e.target.value)}>
                    <option value="">— Select —</option>
                    {REASONS.map((r) => (
                        <option key={r.value} value={r.value}>
                            {r.label}
                        </option>
                    ))}
                </select>
            </label>

            <label>
                Reason detail
                <textarea
                    rows={3}
                    value={detail}
                    onChange={(e) => setDetail(e.target.value)}
                />
            </label>

            <div style={{ display: "flex", gap: 8 }}>
                <button onClick={onCancel} type="button">
                    Cancel
                </button>
                <button
                    disabled={!canProceed}
                    onClick={() =>
                        onConfirm({
                            edit_reason_type: reasonType,
                            edit_reason_detail: detail.trim(),
                        })
                    }
                    type="button"
                >
                    Continue
                </button>
            </div>
        </div>
    );
}