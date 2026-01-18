import { render, screen, fireEvent } from "@testing-library/react";
import EditIntentGate from "./EditIntentGate";

describe("EditIntentGate", () => {
    test("Continue is disabled until reason and detail are provided.", () => {
        const onConfirm = jest.fn();
        const onCancel = jest.fn();

        render(<EditIntentGate onConfirm={onConfirm} onCancel={onCancel} />);

        const continueBtn = screen.getByRole("button", { name: /continue/i });
        expect(continueBtn).toBeDisabled();

        fireEvent.change(screen.getByRole("combobox"), {
            target: { value: "TYPO" },
        });
        expect(continueBtn).toBeDisabled();

        fireEvent.change(screen.getByRole("textbox"), {
            target: { value: "Fixing typo" },
        });
        expect(continueBtn).toBeEnabled();
    });

    test("onConfirm receives structured intent.", () => {
        const onConfirm = jest.fn();

        render(<EditIntentGate onConfirm={onConfirm} onCancel={() => { }} />);

        fireEvent.change(screen.getByRole("combobox"), {
            target: { value: "CLARIFICATION" },
        });
        fireEvent.change(screen.getByRole("textbox"), {
            target: { value: "Clarifying notes." },
        });

        fireEvent.click(screen.getByRole("button", { name: /continue/i }));

        expect(onConfirm).toHaveBeenCalledWith({
            edit_reason_type: "CLARIFICATION",
            edit_reason_detail: "Clarifying notes.",
        });
    });

    test("Cancel calls onCancel", () => {
        const onCancel = jest.fn();

        render(<EditIntentGate onConfirm={() => { }} onCancel={onCancel} />);

        fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

        expect(onCancel).toHaveBeenCalledTimes(1);
    });
});