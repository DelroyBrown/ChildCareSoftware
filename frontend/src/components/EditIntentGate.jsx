import { useState } from "react";

const EDIT_REASONS = [
    { value: "TYPO", label: "Typo correction" },
    { value: "LATE_ENTRY", label: "Late entry" },
    { value: "CLARIFICATION", label: "Clarification" },
];

export default function EditIntentGate({
    onConfirm,
    onCancel,
    allowedReasons = EDIT_REASONS,
    minDetailLength = 5,
}) {
    const [reasonType, setReasonType] = useState("");
    const [detail, setDetail] = useState("");

    const canProceed = reasonType && detail.trim().length > 3;

    return (
        <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontSize: 13, opacity: 0.8 }}>
                This change will be permanently recorded in the audit log.
            </div>

            <label>
                Reason
                <select
                    value={reasonType}
                    onChange={(e) => setReasonType(e.target.value)}
                >
                    <option value="">— Select —</option>
                    {allowedReasons.map((r) => (
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
                    placeholder="Explain why this amendment is necessary"
                />
            </label>

            <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={onCancel}>
                    Cancel
                </button>
                <button
                    type="button"
                    disabled={!canProceed}
                    onClick={() =>
                        onConfirm({
                            edit_reason_type: reasonType,
                            edit_reason_detail: detail.trim(),
                        })
                    }
                >
                    Continue
                </button>
            </div>
        </div>
    );
}