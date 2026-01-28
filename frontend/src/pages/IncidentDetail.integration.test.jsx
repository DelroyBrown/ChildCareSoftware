import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import IncidentDetail from "./IncidentDetail";
import { CurrentResidentProvider } from "../context/CurrentResidentContext";
import { http } from "../api/http";
import { patchIncident } from "../api/incidents";



jest.mock("../api/http", () => ({
    http: {
        get: jest.fn(),
        patch: jest.fn(),
    },
}));

jest.mock("../api/incidents", () => ({
    patchIncident: jest.fn(),
}));

function renderIncidentDetailPageWithProviders({ initialRoute }) {
    return render(
        <CurrentResidentProvider>
            <MemoryRouter initialEntries={[initialRoute]}>
                <Routes>
                    <Route path="incidents/:id" element={<IncidentDetail />} />
                    <Route path="*" element={<div>Route not matched</div>} />
                </Routes>
            </MemoryRouter>
        </CurrentResidentProvider>
    );
}

describe("IncidentDetail integration: edits cannot bypass audit intent", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("does not allow any save until intent is confirmed. Then saves with reason fields", async () => {
        const incidentIdentifier = "123";

        const initialIncidentData = {
            id: Number(incidentIdentifier),
            occurred_at: "2025-01-01T10:00:00Z",
            category: "OTHER",
            severity: "LOW",
            description: "Initial description text",
            action_taken: "",
            follow_up_required: false,
        };

        const updatedIncidentData = {
            ...initialIncidentData,
            description: "Updated description text",
            edit_reason_type: "TYPO",
            edit_reason_detail: "Fixing a small typo",
        };

        // First GET: incident detail
        // Second GET: history-summary
        http.get.mockImplementation((url) => {
            if (url === `/api/incidents/${incidentIdentifier}/`) {
                return Promise.resolve({ data: initialIncidentData });
            }
            if (url === `/api/incidents/${incidentIdentifier}/history-summary/`) {
                return Promise.reject({ response: { status: 403 } });
            }
            return Promise.reject(new Error(`Unexpected GET URL: ${url}`));
        });

        patchIncident.mockResolvedValue({ data: updatedIncidentData });

        renderIncidentDetailPageWithProviders({ initialRoute: `/incidents/${incidentIdentifier}` });

        // wait for initial content to load
        await screen.findByRole("heading", { name: new RegExp(`Incident\\s*#\\s*${incidentIdentifier}`, "i") });
        await screen.findByText(/Initial description text/i);

        // Start editing
        const editDescriptionButton = screen.getByRole("button", { name: /Edit description/i });
        fireEvent.click(editDescriptionButton);

        // Intent gate appears
        await screen.findByText(/This change will be permanently recorded in the audit log\./i);

        // At this point, save is not rendered yet
        expect(screen.queryByRole("button", { name: /^Save$/i })).toBeNull();

        // Continue is disabled until reason + detail are valid
        const continueButton = screen.getByRole("button", { name: /Continue/i });
        expect(continueButton).toBeDisabled();

        // Try clicking Continue anyway (should do nothing and definitely not call API)
        fireEvent.click(continueButton);
        expect(patchIncident).not.toHaveBeenCalled();

        // Select reason
        const reasonSelectElement = screen.getByLabelText("Reason");
        fireEvent.change(reasonSelectElement, { target: { value: "TYPO" } });
        expect(continueButton).toBeDisabled();

        // Provide short detail (still disabled because must be > 3 characters after trim)
        const reasonDetailTextarea = screen.getByLabelText("Reason detail");
        fireEvent.change(reasonDetailTextarea, { target: { value: "No" } });
        expect(continueButton).toBeDisabled();

        // Provide sufficient detail
        fireEvent.change(reasonDetailTextarea, { target: { value: "Fixing a small typo" } });
        expect(continueButton).toBeEnabled();

        // Confirm intent
        fireEvent.click(continueButton);


        // Now the edit textarea + save/cancel buttons should appear
        const descriptionTextarea = screen.getByRole("textbox");
        fireEvent.change(descriptionTextarea, { target: { value: "Updated description text" } });

        const saveButton = screen.getByRole("button", { name: /^Save$/i });
        fireEvent.click(saveButton);

        // Ensure patchIncident called only once with the correct payload
        await waitFor(() => {
            expect(patchIncident).toHaveBeenCalledTimes(1);
        });

        const patchIncidentCallArguments = patchIncident.mock.calls[0];
        const patchIncidentIdentifierArgument = patchIncidentCallArguments[0];
        const patchIncidentPayloadArgument = patchIncidentCallArguments[1];

        expect(String(patchIncidentIdentifierArgument)).toBe(incidentIdentifier);
        expect(patchIncidentPayloadArgument).toEqual(
            expect.objectContaining({
                description: "Updated description text",
                edit_reason_type: "TYPO",
                edit_reason_detail: "Fixing a small typo",
            })
        );

        // UI returns to non-editing state and shows updated description
        await screen.findByText(/Updated description text/i);
        expect(screen.getByRole("button", { name: /Edit description/i })).toBeInTheDocument();
    });

    test("cancel in the intent gate exits edit mode safely and never calls the API", async () => {
        const incidentIdentifier = "456";

        const initialIncidentData = {
            id: Number(incidentIdentifier),
            occurred_at: "2025-01-01T10:00:00Z",
            category: "OTHER",
            severity: "LOW",
            description: "Initial description text",
            action_taken: "",
            follow_up_required: false,
        };

        http.get.mockImplementation((url) => {
            if (url === `/api/incidents/${incidentIdentifier}/`) {
                return Promise.resolve({ data: initialIncidentData });
            }
            if (url === `/api/incidents/${incidentIdentifier}/history-summary/`) {
                return Promise.reject({ response: { status: 403 } });
            }
            return Promise.reject(new Error(`Unexpected GET URL: ${url}`));
        });

        renderIncidentDetailPageWithProviders({ initialRoute: `/incidents/${incidentIdentifier}` });

        await screen.findByRole("heading", { name: new RegExp(`Incident\\s*#\\s*${incidentIdentifier}`, "i") });
        await screen.findByText(/Initial description text/i);

        const editDescriptionButton = screen.getByRole("button", { name: /Edit description/i });
        fireEvent.click(editDescriptionButton);

        await screen.findByText(/This change will be permanently recorded in the audit log\./i);

        const cancelButton = screen.getByRole("button", { name: /^Cancel$/i });
        fireEvent.click(cancelButton);

        // Back to view mode
        expect(screen.getByRole("button", { name: /Edit description/i })).toBeInTheDocument();
        expect(screen.queryByText(/This change will be permanently recorded/i)).toBeNull();

        // No API update called
        expect(patchIncident).not.toHaveBeenCalled();
    });
});

