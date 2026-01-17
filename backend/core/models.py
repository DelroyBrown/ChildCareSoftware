from django.db import models
from django.conf import settings
from simple_history.models import HistoricalRecords

# HELPERS
# ----------------------------------------------


class EditReasonCode(models.TextChoices):
    TYPO = "TYPO", "Typo / Spelling Correction"
    LATE_ENTRY = "LATE_ENTRY", "Late Entry"
    CLARIFICATION = "CLARIFICATION", "Clarification"


# ----------------------------------------------


class Resident(models.Model):
    legal_name = models.CharField(max_length=255)
    preferred_name = models.CharField(max_length=255, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.preferred_name or self.legal_name


class Shift(models.Model):
    SHIFT_TYPES = [
        ("DAY", "Day"),
        ("LATE", "Late"),
        ("NIGHT", "Night"),
    ]

    shift_type = models.CharField(max_length=10, choices=SHIFT_TYPES)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()

    staff = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="shifts")

    handover_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.get_shift_type_display()} {self.starts_at:%Y-%m-%d}"


class DailyLog(models.Model):
    resident = models.ForeignKey(
        Resident, on_delete=models.CASCADE, related_name="daily_logs"
    )
    shift = models.ForeignKey(Shift, on_delete=models.SET_NULL, null=True, blank=True)

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="daily_logs"
    )

    summary = models.TextField()
    mood = models.CharField(max_length=50, blank=True)
    interventions = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.resident} - {self.created_at:%Y-%m-%d}"


class Incident(models.Model):
    SEVERITY_LEVELS = [
        ("LOW", "low"),
        ("MEDIUM", "medium"),
        ("HIGH", "high"),
    ]

    CATEGORY_CHOICES = [
        ("SAFEGUARDING", "safeguarding"),
        ("MISSING", "Missing from home"),
        ("SELF_HARM", "Self-harm"),
        ("AGGRESSION", "Aggression"),
        ("PROPERTY", "Property damage"),
        ("OTHER", "Other"),
    ]

    resident = models.ForeignKey(
        Resident, on_delete=models.CASCADE, related_name="incidents"
    )
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reported_incidents",
    )

    occurred_at = models.DateTimeField()
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    severity = models.CharField(max_length=10, choices=SEVERITY_LEVELS)

    description = models.TextField()
    action_taken = models.TextField(blank=True)
    external_contacts = models.TextField(blank=True)

    follow_up_required = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    edit_reason_type = models.CharField(
        max_length=20,
        choices=EditReasonCode.choices,
        blank=True,
    )

    edit_reason_detail = models.CharField(
        max_length=255,
        blank=True,
        help_text="Reason for last edit (e.g. typo correction, late entry.)",
    )

    history = HistoricalRecords()

    def __str__(self):
        return f"{self.resident} - {self.category} ({self.occurred_at:%Y-%m-%d})"


class CarePlan(models.Model):
    resident = models.OneToOneField(
        Resident, on_delete=models.CASCADE, related_name="care_plan"
    )

    overview = models.TextField(blank=True)
    triggers = models.TextField(blank=True)
    deescalation_strategies = models.TextField(blank=True)
    goals = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Care Plan - {self.resident}"


class Medication(models.Model):
    resident = models.ForeignKey(
        Resident, on_delete=models.CASCADE, related_name="medications"
    )

    medication_name = models.CharField(max_length=255)
    dose = models.CharField(max_length=100, blank=True)
    route = models.CharField(
        max_length=100, blank=True, help_text="To be taken orally etc."
    )
    schedule = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.medication_name} ({self.resident})"


class MedicationAdministrationRecord(models.Model):
    OUTCOME_CHOICES = [
        ("GIVEN", "Given"),
        ("REFUSED", "Refused"),
        ("PARTIAL", "Partially Taken"),
        ("NOT_AVAILABLE", "Not available"),
        ("HELD", "Held (Clinical decision)"),
    ]

    medication = models.ForeignKey(
        Medication, on_delete=models.CASCADE, related_name="administrations"
    )
    administered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="med_admins"
    )

    administered_at = models.DateTimeField()
    outcome = models.CharField(max_length=20, choices=OUTCOME_CHOICES)
    notes = models.TextField(blank=True)

    edit_reason_type = models.CharField(
        max_length=20, choices=EditReasonCode.choices, blank=True
    )

    edit_reason_detail = models.CharField(
        max_length=255,
        blank=True,
        help_text="Reason for last edit (e.g. typo correction, late entry)",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    history = HistoricalRecords()

    def __str__(self):
        return f"{self.medication.medication_name} - {self.get_outcome_display()} @ {self.administered_at:%Y-%m-%d %H:%M}"
