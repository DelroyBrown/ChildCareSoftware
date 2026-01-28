import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import MARDetail from "./MARDetail";
import { http } from "../api/http";
import { patchMAR } from "../api/mar";

jest.mock("../api/http", () => ({
    http: {
        get: jest.fn(),
        patch: jest.fn(),
    },
}));

jest.mock("../api/mar", () => ({
    patchMAR: jest.fn(),
}));

function renderMARDetailPage({ initialRoute }) {
    return render(
        <MemoryRouter initialEntries={[initialRoute]}>
            <Routes>
                <Route path="mar/:id" element={<MARDetail />} />
                <Route path="*" element={<div>Route not matched</div>} />
            </Routes>
        </MemoryRouter>
    );
}

describe("MARDetail integration: edits cannot bypass audit intent", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("does not allow any save until intent is confirmed. Then saves with reason fields", async () => {
        const marIdentifier = "123";

        const initialMARData = {
            id: Number(marIdentifier),
            administered_at: "2025-01-01T10:00:00Z",
            outcome: "GIVEN",
            notes: "Initial notes text",
            medication: "Paracetamol 500mg",
        };

        const updatedMARData = {
            ...initialMARData,
            notes: "Updated notes text",
            edit_reason_type: "TYPO",
            edit_reason_detail: "Fixing a small typo",
        };

        // First GET: MAR detail
        // Second GET: history-summary (manager only)
        // Third GET: history-summary refesh after save
        http.get.mockImplementation((url) => {
            if (url === `/api/mar/${marIdentifier}/`) {
                return Promise.resolve({ data: initialMARData });
            }
            if (url === `/api/mar/${marIdentifier}/history-summary/`) {
                return Promise.reject({ response: { status: 403 } });
            }
            return Promise.reject(new Error(`Unexpected GET URL: ${url}`));
        });

        patchMAR.mockResolvedValue({ data: updatedMARData });

        renderMARDetailPage({ initialRoute: `/mar/${marIdentifier}` });

        // Wait for initial content
        await screen.findByRole("heading", {
            name: new RegExp(`Medication\\s*Administration\\s*Record\\s*#\\s*${marIdentifier}`, "i"),
        });
        await screen.findByText(/Initial notes text/i);

        // Start editing
        const editNotesButton = screen.getByRole("button", { name: /Edit notes/i });
        fireEvent.click(editNotesButton);

        // Intent gate appears
        await screen.findByText(/This change will be permanently recorded in the audit log\./i);

        // Save not rendered yet
        expect(screen.queryByRole("button", { name: /^Save$/i })).toBeNull();

        // Continue disabled until reason + detail are valid
        const continueButton = screen.getByRole("button", { name: /Continue/i });
        expect(continueButton).toBeDisabled();

        // Clicking continue does nothing and should never call API
        fireEvent.click(continueButton);
        expect(patchMAR).not.toHaveBeenCalled();

        // Select reason
        const reasonSelect = screen.getByLabelText("Reason");
        fireEvent.change(reasonSelect, { target: { value: "TYPO" } });
        expect(continueButton).toBeDisabled();

        // Too short detail should still block
        const reasonDetail = screen.getByLabelText("Reason detail");
        fireEvent.change(reasonDetail, { target: { value: "No" } });
        expect(continueButton).toBeDisabled();

        // Sufficient detail enables the proceed
        fireEvent.change(reasonDetail, { target: { value: "Fixing small typo" } });
        expect(continueButton).toBeEnabled();

        // Confirm intent
        fireEvent.click(continueButton);

        // Textarea + save/cancel appear
        const notesTextarea = screen.getByRole("textbox");
        fireEvent.change(notesTextarea, { target: { value: "Updated notes text" } });

        const saveButton = screen.getByRole("button", { name: /^Save$/i });
        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(patchMAR).toHaveBeenCalledTimes(1);
        });

        const patchMARCallArgs = patchMAR.mock.calls[0];
        const patchMARIdArg = patchMARCallArgs[0];
        const patchMARPayloadArg = patchMARCallArgs[1];

        expect(String(patchMARIdArg)).toBe(marIdentifier);
        expect(patchMARPayloadArg).toEqual(
            expect.objectContaining({
                notes: "Updated notes text",
                edit_reason_type: "TYPO",
                edit_reason_detail: expect.stringMatching(/fixing.*typo/i),
            })
        );

        // Returns to view mode and shows updated notes
        await screen.findByText(/Updated notes text/i);
        expect(screen.getByRole("button", { name: /Edit notes/i })).toBeInTheDocument();

    });

    test("cancel in the intent gate exits edit mode safely and never calls API", async () => {
        const marIdentifier = "456";

        const initialMARData = {
            id: Number(marIdentifier),
            administered_at: "2025-01-01T10:00:00Z",
            outcome: "GIVEN",
            notes: "Initial notes text",
            medication: "Ibuprofen 200mg",
        };

        http.get.mockImplementation((url) => {
            if (url === `/api/mar/${marIdentifier}/`) {
                return Promise.resolve({ data: initialMARData });
            }
            if (url === `/api/mar/${marIdentifier}/history-summary/`) {
                return Promise.reject({ response: { status: 403 } });
            }
            return Promise.reject(new Error(`Unexpected GET URL: ${url}`));
        });

        renderMARDetailPage({ initialRoute: `/mar/${marIdentifier}` });

        await screen.findByRole("heading", {
            name: new RegExp(`Medication\\s*Administration\\s*Record\\s*#\\s*${marIdentifier}`, "i"),
        });
        await screen.findByText(/Initial notes text/i);

        const editNotesButton = screen.getByRole("button", { name: /Edit notes/i });
        fireEvent.click(editNotesButton);

        await screen.findByText(/This change will be permanently recorded in the audit log\./i);

        const cancelButton = screen.getByRole("button", { name: /^Cancel$/i });
        fireEvent.click(cancelButton);

        // Back to view mode
        expect(screen.getByRole("button", { name: /Edit notes/i })).toBeInTheDocument();
        expect(screen.queryByText(/This change will be permanently recorded/i)).toBeNull();

        // No API updated called
        expect(patchMAR).not.toHaveBeenCalled();
    });
});