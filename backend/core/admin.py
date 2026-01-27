from django.contrib import admin
from django import forms
from django.core.exceptions import PermissionDenied
from simple_history.admin import SimpleHistoryAdmin
from simple_history.utils import update_change_reason
from .models import (
    EditReasonCode,
    Resident,
    Shift,
    DailyLog,
    Incident,
    CarePlan,
    Medication,
    MedicationAdministrationRecord,
)

MANAGER_GROUP_NAME = "manager"


def user_is_manager(user):
    return user.is_active and user.groups.filter(name=MANAGER_GROUP_NAME).exists()


class CareGradeAdminMixin:
    """
    Admin partity with API:
    - Staff can only view/edit records they created (owner_field)
    - Managers can view/edit any
    - Deletes are blocked (both single + bulk)
    """

    owner_field = None  # e.g "reported_by" or "administered_by"

    # Prevents staff browsing others records
    def get_queryset(self, request):
        qs = super().get_queryset(request)

        if request.user.is_superuser or user_is_manager(request.user):
            return qs

        if not self.owner_field:
            return qs.none()

        return qs.filter(**{self.owner_field: request.user})

    # Change permission (prevents direct URL bypass)
    def has_change_permission(self, request, obj=None):
        base = super().has_change_permission(request, obj=obj)
        if not base:
            return False

        if obj is None:
            return True

        if request.user.is_superuser or user_is_manager(request.user):
            return True

        if not self.owner_field:
            return False

        return getattr(obj, self.owner_field) == request.user

    # Delete lockdown for single and bulk
    def has_delete_permission(self, request, obj=None) -> bool:
        return False

    def delete_model(self, request, obj):
        raise PermissionDenied("Deletion is not permitted for safety-critical records.")

    def delete_queryset(self, request, queryset):
        raise PermissionDenied(
            "Bulk deletion is not permitted for safety-critical records."
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


class AuditIntentAdminForm(forms.ModelForm):
    """
    Enforces no meaningful admin edit without:
    - edit_reason_type (structured dropdown)
    - edit_reason_detail (free text)
    """

    AUDIT_FIELDS = {"edit_reason_type", "edit_reason_detail"}

    def clean(self):
        cleaned = super().clean()

        # Only enforece on edits, not create
        if not self.instance or not self.instance.pk:
            return cleaned

        meaningful_changes = [
            field for field in self.changed_data if field not in self.AUDIT_FIELDS
        ]

        if not meaningful_changes:
            # if no meaningful change, allow save
            return cleaned

        reason_type = cleaned.get("edit_reason_type")
        reason_detail = (cleaned.get("edit_reason_detail") or "").strip()

        if not reason_type:
            self.add_error("edit_reason_type", "Required for meaningful amendments.")
        else:
            valid_values = set(EditReasonCode.values)
            if reason_type not in valid_values:
                self.add_error("edit_reason_type", "Invalid reason code.")

        if not reason_detail:
            self.add_error("edit_reason_detail", "Required for meaningful amendments.")

        return cleaned


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
class IncidentAdmin(CareGradeAdminMixin, SimpleHistoryAdmin):
    form = AuditIntentAdminForm
    owner_field = "reported_by"
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
class MedicationAdministrationRecordAdmin(CareGradeAdminMixin, SimpleHistoryAdmin):
    form = AuditIntentAdminForm
    owner_field = "administered_by"
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
