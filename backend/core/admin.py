from django.contrib import admin
from django import forms
from simple_history.admin import SimpleHistoryAdmin
from simple_history.utils import update_change_reason
from .models import (
    Resident,
    Shift,
    DailyLog,
    Incident,
    CarePlan,
    Medication,
    MedicationAdministrationRecord,
)


class RequireEditReasonOnChangeForm(forms.ModelForm):
    edit_reason_field = "edit_reason_detail"

    def clean(self):
        cleaned = super().clean()

        # Only enforce on edit
        if not self.instance or not self.instance.pk:
            return cleaned

        reason = cleaned.get(self.edit_reason_field)

        """
        changed_data is a list of field names that changed in
        this form submission
        """
        meaningful_changes = [
            f for f in self.changed_data if f != self.edit_reason_field
        ]

        if meaningful_changes:
            if not reason or not str(reason).strip():
                self.add_error(
                    self.edit_reason_field,
                    "An edit reason is required when updating this record.",
                )

        return cleaned


class IncidentAdminForm(RequireEditReasonOnChangeForm):
    class Meta:
        model = Incident
        fields = "__all__"


class MARAdminForm(RequireEditReasonOnChangeForm):
    class Meta:
        model = MedicationAdministrationRecord
        fields = "__all__"


@admin.register(Resident)
class ResidentAdmin(admin.ModelAdmin):
    list_display = ("legal_name", "preferred_name", "is_active", "created_at")
    search_fields = ("legal_name", "preferred_name")
    list_filter = ("is_active",)


@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = ("shift_type", "starts_at", "ends_at")
    list_filter = ("shift_type",)
    date_hierarchy = "starts_at"


@admin.register(DailyLog)
class DailyLogAdmin(admin.ModelAdmin):
    list_display = ("resident", "author", "created_at")
    list_filter = ("created_at",)
    search_fields = ("summary",)


@admin.register(Incident)
class IncidentAdmin(SimpleHistoryAdmin):
    form = IncidentAdminForm
    list_display = (
        "resident",
        "category",
        "severity",
        "occurred_at",
        "follow_up_required",
    )
    list_filter = (
        "category",
        "severity",
        "follow_up_required",
    )
    date_hierarchy = "occurred_at"
    search_fields = ("description",)

    def save_model(self, request, obj, form, change):
        # Middleware will do this, but set it anyway
        obj._history_user = request.user
        super().save_model(request, obj, form, change)

        # Mirror DRF beaviour
        if change:
            reason = (form.cleaned_data.get("edit_reason_detail") or "").strip()
            if reason:
                update_change_reason(obj, reason)


@admin.register(CarePlan)
class CarePlanAdmin(admin.ModelAdmin):
    list_display = ("resident", "updated_at")
    search_fields = ("resident__legal_name", "overview")


@admin.register(Medication)
class MedicationAdmin(admin.ModelAdmin):
    list_display = (
        "resident",
        "medication_name",
        "dose",
        "route",
        "schedule",
        "is_active",
        "updated_at",
    )
    list_filter = ("is_active", "route")
    search_fields = (
        "medication_name",
        "resident__legal_name",
        "resident__preferred_name",
    )


@admin.register(MedicationAdministrationRecord)
class MedicationAdministrationRecordAdmin(SimpleHistoryAdmin):
    form = MARAdminForm
    list_display = (
        "medication",
        "administered_by",
        "administered_at",
        "outcome",
    )
    list_filter = ("outcome",)
    date_hierarchy = "administered_at"
    search_fields = ("medication__medication_name", "notes")

    def save_model(self, request, obj, form, change):
        obj._history_user = request.user
        super().save_model(request, obj, form, change)

        if change:
            reason = (form.cleaned_data.get("edit_reason_detail") or "").strip()
            if reason:
                update_change_reason(obj, reason)
