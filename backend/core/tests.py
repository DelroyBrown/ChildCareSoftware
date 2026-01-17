from django.contrib.auth.models import Group, User
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework import status
from django.urls import reverse
from core.models import (
    Resident,
    Incident,
    Medication,
    MedicationAdministrationRecord,
    EditReasonCode,
)


class EditReasonEnforcementTests(APITestCase):

    @classmethod
    def setUpTestData(cls):
        # Groups
        cls.staff_group, _ = Group.objects.get_or_create(name="staff")
        cls.manager_group, _ = Group.objects.get_or_create(name="manager")

        # Users
        cls.staff = User.objects.create_user(username="staff1", password="pass12345")
        cls.staff.groups.add(cls.staff_group)

        cls.manager = User.objects.create_user(
            username="manager1", password="pass12345"
        )
        cls.manager.groups.add(cls.manager_group)

        # Resident
        cls.resident = Resident.objects.create(
            legal_name="Test",
            preferred_name="Resident",
            date_of_birth="2010-01-01",
        )

        # Medication + MAR prereqs
        cls.medication = Medication.objects.create(
            resident=cls.resident,
            medication_name="Paracetamol",
            dose="500mg",
            route="Oral",
        )

    # Incident tests
    def test_incident_patch_without_edit_reason_fails(self):
        self.client.force_authenticate(user=self.staff)

        incident = Incident.objects.create(
            resident=self.resident,
            occurred_at=timezone.now(),
            description="Initial",
            reported_by=self.staff,
        )

        url = f"/api/incidents/{incident.id}/"
        payload = {"description": "Changed"}  # no edit_reason_detail

        res = self.client.patch(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("edit_reason_detail", res.data)

    def test_incident_patch_with_edit_reason_succeeds(self):
        self.client.force_authenticate(user=self.staff)

        incident = Incident.objects.create(
            resident=self.resident,
            occurred_at=timezone.now(),
            description="Initial",
            reported_by=self.staff,
        )

        url = f"/api/incidents/{incident.id}/"
        payload = {"description": "Changed", "edit_reason_detail": "Correcting details"}

        res = self.client.patch(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        incident.refresh_from_db()
        self.assertEqual(incident.description, "Changed")
        self.assertEqual(incident.edit_reason_detail, "Correcting details")

    def test_incident_history_change_reason_is_saved(self):
        self.client.force_authenticate(user=self.staff)

        incident = Incident.objects.create(
            resident=self.resident,
            occurred_at=timezone.now(),
            description="Initial",
            reported_by=self.staff,
        )

        url = f"/api/incidents/{incident.id}/"
        payload = {"description": "Changed", "edit_reason_detail": "Fix typo"}

        res = self.client.patch(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        incident.refresh_from_db()
        latest_history = incident.history.first()
        self.assertEqual(latest_history.history_change_reason, "Fix typo")
        self.assertEqual(latest_history.history_user_id, self.staff.id)

    def test_mar_patch_without_edit_reason_fails(self):
        self.client.force_authenticate(user=self.staff)

        mar = MedicationAdministrationRecord.objects.create(
            medication=self.medication,
            administered_at=timezone.now(),
            administered_by=self.staff,
            outcome="GIVEN",
        )

        # TODO: update this to match router URL.
        # Common patterns:
        # url = f"/api/medicationadministrationrecords/{mar.id}/"
        # url = f"/api/medication-administration-records/{mar.id}/"
        url = f"/api/mar/{mar.id}/"

        payload = {"outcome": "REFUSED"}  # no edit_reason_detail

        res = self.client.patch(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("edit_reason_detail", res.data)

    def test_incident_history_endpoint_manager_only(self):
        # Create incident as staff
        incident = Incident.objects.create(
            resident=self.resident,
            occurred_at=timezone.now(),
            category="OTHER",
            severity="LOW",
            description="Initial",
            reported_by=self.staff,
        )

        # Staff forbidden
        self.client.force_authenticate(user=self.staff)
        res = self.client.get(f"/api/incidents/{incident.id}/history/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Manager allowed
        self.client.force_authenticate(user=self.manager)
        res = self.client.get(f"/api/incidents/{incident.id}/history/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_incident_history_includes_change_reason(self):
        self.client.force_authenticate(user=self.staff)

        incident = Incident.objects.create(
            resident=self.resident,
            occurred_at=timezone.now(),
            category="OTHER",
            severity="LOW",
            description="Initial",
            reported_by=self.staff,
        )

        # Create a history row with a reason + structured reason type
        patch_url = f"/api/incidents/{incident.id}/"
        payload = {
            "description": "Changed",
            "edit_reason_detail": "Fix typo",
            "edit_reason_type": "TYPO",
        }
        res = self.client.patch(patch_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Manager reads history
        self.client.force_authenticate(user=self.manager)
        hist = self.client.get(f"/api/incidents/{incident.id}/history/")
        self.assertEqual(hist.status_code, status.HTTP_200_OK)

        # Latest event should have the exact audit context provided
        self.assertTrue(len(hist.data) >= 1)

        latest = hist.data[0]
        self.assertEqual(latest["history_change_reason"], "Fix typo")
        self.assertEqual(latest["history_user"]["id"], self.staff.id)

        # New fields included in history output
        self.assertIn("edit_reason_type", latest)
        self.assertIn("edit_reason_detail", latest)
        self.assertEqual(latest["edit_reason_type"], "TYPO")
        self.assertEqual(latest["edit_reason_detail"], "Fix typo")

    def test_mar_history_endpoint_manager_only(self):
        mar = MedicationAdministrationRecord.objects.create(
            medication=self.medication,
            administered_at=timezone.now(),
            administered_by=self.staff,
            outcome="GIVEN",
        )

        # Staff forbidden
        self.client.force_authenticate(user=self.staff)
        res = self.client.get(f"/api/mar/{mar.id}/history/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Manager allowed
        self.client.force_authenticate(user=self.manager)
        res = self.client.get(f"/api/mar/{mar.id}/history/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_incident_history_summary_endpoint_manager_only(self):
        incident = Incident.objects.create(
            resident=self.resident,
            occurred_at=timezone.now(),
            category="OTHER",
            severity="LOW",
            description="Initial",
            reported_by=self.staff,
        )

        # Staff forbidden
        self.client.force_authenticate(user=self.staff)
        res = self.client.get(f"/api/incidents/{incident.id}/history-summary/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Manager allowed
        self.client.force_authenticate(user=self.manager)
        res = self.client.get(f"/api/incidents/{incident.id}/history-summary/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_incident_history_summary_includes_readable_changes_and_reason(self):
        self.client.force_authenticate(user=self.staff)

        incident = Incident.objects.create(
            resident=self.resident,
            occurred_at=timezone.now(),
            category="OTHER",
            severity="LOW",
            description="Initial",
            reported_by=self.staff,
        )

        # Meaningful update
        res = self.client.patch(
            f"/api/incidents/{incident.id}/",
            {
                "description": "Updated description",
                "severity": "MEDIUM",
                "edit_reason_detail": "Clarified details",
                "edit_reason_type": "CLARIFICATION",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Manager fetches formatted history
        self.client.force_authenticate(user=self.manager)
        url = reverse("incident-history-summary", kwargs={"pk": incident.id})
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(len(res.data) >= 1)

        latest = res.data[0]

        # Top-level shape
        self.assertIn("id", latest)
        self.assertIn("at", latest)
        self.assertIn("event", latest)
        self.assertIn("actor", latest)
        self.assertIn("reason", latest)
        self.assertIn("changes", latest)
        self.assertIn("summary", latest)

        # Actor
        self.assertEqual(latest["actor"]["id"], self.staff.id)

        # Reason (typed + detail)
        self.assertEqual(latest["reason"]["type"], "CLARIFICATION")
        self.assertEqual(latest["reason"]["detail"], "Clarified details")

        # Changes should be a LIST of {field, from, to}
        self.assertIsInstance(latest["changes"], list)
        self.assertTrue(any(c["field"] == "Description" for c in latest["changes"]))
        self.assertTrue(any(c["field"] == "Severity" for c in latest["changes"]))

        sev_change = next(c for c in latest["changes"] if c["field"] == "Severity")
        self.assertIn(sev_change["from"], ["LOW", "low"])
        self.assertIn(sev_change["to"], ["MEDIUM", "medium"])

    def test_incident_patch_with_invalid_edit_reason_type_fails(self):
        self.client.force_authenticate(user=self.staff)

        incident = Incident.objects.create(
            resident=self.resident,
            occurred_at=timezone.now(),
            description="Initial",
            reported_by=self.staff,
        )

        url = f"/api/incidents/{incident.id}/"
        payload = {
            "description": "Changed",
            "edit_reason_detail": "Fix typo",
            "edit_reason_type": "NOT_A_REAL_CODE",
        }

        res = self.client.patch(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("edit_reason_type", res.data)

    def test_incident_patch_with_valid_edit_reason_type_succeeds(self):
        self.client.force_authenticate(user=self.staff)

        incident = Incident.objects.create(
            resident=self.resident,
            occurred_at=timezone.now(),
            description="Initial",
            reported_by=self.staff,
        )

        url = f"/api/incidents/{incident.id}/"
        payload = {
            "description": "Changed",
            "edit_reason_detail": "Clarified Wording",
            "edit_reason_type": "CLARIFICATION",
        }

        res = self.client.patch(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        incident.refresh_from_db()
        self.assertEqual(incident.edit_reason_type, "CLARIFICATION")

    def test_incident_patch_creates_single_history_row(self):
        self.client.force_authenticate(user=self.staff)

        incident = Incident.objects.create(
            resident=self.resident,
            occurred_at=timezone.now(),
            description="Initial",
            reported_by=self.staff,
        )

        initial_history_count = incident.history.count()

        url = f"/api/incidents/{incident.id}/"
        payload = {
            "description": "Changed",
            "edit_reason_detail": "Fix typo",
            "edit_reason_type": "TYPO",
        }

        res = self.client.patch(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        incident.refresh_from_db()
        self.assertEqual(
            incident.history.count(),
            initial_history_count + 1,
            "Exactly one history row should be created per update",
        )

    def test_incident_history_includes_field_level_diffs(self):
        self.client.force_authenticate(user=self.staff)

        incident = Incident.objects.create(
            resident=self.resident,
            occurred_at=timezone.now(),
            category="OTHER",
            severity="LOW",
            description="Initial description",
            reported_by=self.staff,
        )

        # Perform meaningful update
        patch_url = f"/api/incidents/{incident.id}/"
        payload = {
            "description": "Updated description",
            "severity": "MEDIUM",
            "edit_reason_detail": "Clarified incident details",
            "edit_reason_type": "CLARIFICATION",
        }

        res = self.client.patch(patch_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Manager fetches history
        self.client.force_authenticate(user=self.manager)
        hist = self.client.get(f"/api/incidents/{incident.id}/history/")
        self.assertEqual(hist.status_code, status.HTTP_200_OK)

        latest = hist.data[0]

        # Field level diffs exist?
        self.assertIn("changes", latest)

        changes = latest["changes"]

        # Description diff
        self.assertIn("description", changes)
        self.assertEqual(changes["description"]["from"], "Initial description")
        self.assertEqual(changes["description"]["to"], "Updated description")

        # Severity diff
        self.assertIn("severity", changes)
        self.assertEqual(changes["severity"]["from"], "LOW")
        self.assertEqual(changes["severity"]["to"], "MEDIUM")
        self.assertEqual(changes["severity"]["to"], "MEDIUM")

    def test_mar_history_summary_endpoint_manager_only(self):
        mar = MedicationAdministrationRecord.objects.create(
            medication=self.medication,
            administered_at=timezone.now(),
            administered_by=self.staff,
            outcome="GIVEN",
        )

        # Staff forbidden
        self.client.force_authenticate(user=self.staff)
        res = self.client.get(f"/api/mar/{mar.id}/history-summary/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Manager allowed
        self.client.force_authenticate(user=self.manager)
        res = self.client.get(f"/api/mar/{mar.id}/history-summary/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
