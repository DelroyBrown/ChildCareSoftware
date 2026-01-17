from django.contrib.auth import get_user_model
from rest_framework import serializers
from django.db import models
from .models import (
    CarePlan,
    DailyLog,
    EditReasonCode,
    Incident,
    Medication,
    MedicationAdministrationRecord,
    Resident,
    Shift,
)


User = get_user_model()


class RequireEditReasonOnUpdateMixin:
    """
    Enforces care-grade audit rules on update:

    - Create: no enforcement (no reason required)
    - Update (PATCH/PUT):
        - If a meaningful field changes, edit_reason_detail is required
        - edit_reason_type is optional, but if provided must be a valid choice
    """

    edit_reason_detail_field = "edit_reason_detail"
    edit_reason_type_field = "edit_reason_type"

    def validate(self, attrs):
        attrs = super().validate(attrs)

        # CREATE: no enforcement
        if self.instance is None:
            # Still validate the reason type if client provides it on create
            self._validate_reason_type(attrs)
            return attrs

        # UPDATE: validate optional reason type
        self._validate_reason_type(attrs)

        # Determine whether this update is meaningful (ignoring the audit fields themselves)
        meaningful_change = False
        for field, new_value in attrs.items():
            if field in {self.edit_reason_detail_field, self.edit_reason_type_field}:
                continue

            old_value = getattr(self.instance, field, None)
            if new_value != old_value:
                meaningful_change = True
                break

        # If meaningful, enforce non-empty edit_reason_detail
        reason_detail = attrs.get(self.edit_reason_detail_field)
        if meaningful_change and not (reason_detail and str(reason_detail).strip()):
            raise serializers.ValidationError(
                {
                    self.edit_reason_detail_field: (
                        "An edit reason is required when updating this record."
                    )
                }
            )

        return attrs

    def _validate_reason_type(self, attrs):
        reason_type = attrs.get(self.edit_reason_type_field)
        if reason_type and reason_type not in EditReasonCode.values:
            raise serializers.ValidationError(
                {self.edit_reason_type_field: "Invalid edit reason type."}
            )


class ResidentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Resident
        fields = "__all__"


class ShiftSerializer(serializers.ModelSerializer):
    class Meta:
        model = Shift
        fields = "__all__"


class DailyLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyLog
        fields = "__all__"


class IncidentSerializer(RequireEditReasonOnUpdateMixin, serializers.ModelSerializer):
    class Meta:
        model = Incident
        fields = "__all__"
        read_only_fields = ["reported_by"]


class CarePlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = CarePlan
        fields = "__all__"


class MedicationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Medication
        fields = "__all__"


class MedicationAdministrationRecordSerializer(
    RequireEditReasonOnUpdateMixin, serializers.ModelSerializer
):
    class Meta:
        model = MedicationAdministrationRecord
        fields = "__all__"
        read_only_fields = ["administered_by"]


class HistoryUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username")  # keep minimal for now


class MARTimelineSerializer(serializers.ModelSerializer):
    event_type = serializers.SerializerMethodField()
    administered_by = HistoryUserSerializer(read_only=True)

    class Meta:
        model = MedicationAdministrationRecord
        fields = (
            "id",
            "event_type",
            "administered_at",
            "outcome",
            "notes",
            "administered_by",
            "medication",
        )

    def get_event_type(self, obj):
        return "MEDICATION"


class IncidentTimelineSerializer(serializers.ModelSerializer):
    event_type = serializers.SerializerMethodField()
    reported_by = HistoryUserSerializer(read_only=True)

    class Meta:
        model = Incident
        fields = (
            "id",
            "event_type",
            "occurred_at",
            "category",
            "severity",
            "description",
            "action_taken",
            "reported_by",
            "follow_up_required",
        )

    def get_event_type(self, obj):
        return "INCIDENT"


class DailyLogTimelineSerializer(serializers.ModelSerializer):
    event_type = serializers.SerializerMethodField()
    author = HistoryUserSerializer(read_only=True)

    class Meta:
        model = DailyLog
        fields = (
            "id",
            "event_type",
            "created_at",
            "summary",
            "mood",
            "interventions",
            "author",
            "shift",
        )

    def get_event_type(self, obj):
        return "DAILY_LOG"


DIFF_EXCLUDED_FIELDS = {
    "id",
    "history_id",
    "history_date",
    "history_type",
    "history_user",
    "history_change_reason",
    "edit_reason_type",
    "edit_reason_detail",
}


class HistoryRecordSerializer(serializers.Serializer):
    history_id = serializers.IntegerField()
    history_date = serializers.DateTimeField()
    history_type = serializers.CharField()
    history_change_reason = serializers.CharField(allow_blank=True, allow_null=True)

    history_user = serializers.SerializerMethodField()
    edit_reason_type = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    edit_reason_detail = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )

    changes = serializers.SerializerMethodField()

    def get_history_user(self, obj):
        user = getattr(obj, "history_user", None)
        if not user:
            return None
        return HistoryUserSerializer(user).data

    def get_changes(self, obj):
        history_list = self.context.get("history_list")
        if not history_list:
            return {}

        index = history_list.index(obj)
        if index == len(history_list) - 1:
            # Oldest record has nothing to diff against
            return {}

        previous = history_list[index + 1]
        changes = {}

        for field in obj._meta.fields:
            field_name = field.name
            if field_name in DIFF_EXCLUDED_FIELDS:
                continue

            old_value = getattr(previous, field_name, None)
            new_value = getattr(obj, field_name, None)

            if old_value != new_value:
                changes[field_name] = {"from": old_value, "to": new_value}

        return changes


HISTORY_SUMMARY_EXCLUDED_FIELDS = DIFF_EXCLUDED_FIELDS


def _humanize_field_label(history_obj, field_name: str) -> str:
    """
    Tries to pull the models verbose_name for the field.
    Falls back to title casing raw field name
    """
    try:
        field = history_obj.instance._meta.get_field(field_name)
        return str(field.verbose_name).strip().capitalize()
    except Exception:
        return field_name.replace("_", " ").strip().title()


def _format_value_for_display(history_obj, field_name: str, value):
    if value is None:
        return None

    try:
        field = history_obj.instance._meta.get_field(field_name)
    except Exception:
        return value

    # Handle choices
    if getattr(field, "choices", None):
        choices = dict(field.choices)
        return choices.get(value, value)

    # Handle foreign keys
    if isinstance(field, models.ForeignKey):
        try:
            rel_model = field.remote_field.model
            obj = rel_model.objects.filter(pk=value).first()
            return str(obj) if obj else value
        except Exception:
            return value

    return value


class HistorySummaryEventSerializer(serializers.Serializer):
    # Human readable audit timeline
    id = serializers.IntegerField(source="history_id")
    at = serializers.DateTimeField(source="history_date")
    event = serializers.SerializerMethodField()
    actor = serializers.SerializerMethodField()
    reason = serializers.SerializerMethodField()
    changes = serializers.SerializerMethodField()
    summary = serializers.SerializerMethodField()

    def get_event(self, obj):
        t = getattr(obj, "history_type", "")
        return {"+": "CREATED", "~": "UPDATED", "-": "DELETED"}.get(t, "UNKNOWN")

    def get_actor(self, obj):
        user = getattr(obj, "history_user", None)
        if not user:
            return None
        return HistoryUserSerializer(user).data

    def get_reason(self, obj):
        return {
            "type": getattr(obj, "edit_reason_type", None) or None,
            "detail": getattr(obj, "history_change_reason", None) or None,
        }

    def get_changes(self, obj):
        history_list = self.context.get("history_list")
        if not history_list:
            return []

        index = history_list.index(obj)
        if index == len(history_list) - 1:
            return []

        previous = history_list[index + 1]
        out = []

        for field in obj._meta.fields:
            field_name = field.name
            if field_name in HISTORY_SUMMARY_EXCLUDED_FIELDS:
                continue

            old_value = getattr(previous, field_name, None)
            new_value = getattr(obj, field_name, None)

            if old_value != new_value:
                label = _humanize_field_label(obj, field_name)
                out.append(
                    {
                        "field": label,
                        "from": _format_value_for_display(obj, field_name, old_value),
                        "to": _format_value_for_display(obj, field_name, new_value),
                    }
                )
        return out

    def get_summary(self, obj):
        actor = self.get_actor(obj)
        actor_name = actor["username"] if actor else "Someone"
        event = self.get_event(obj)

        changes = self.get_changes(obj)
        if not changes and event != "CREATED":
            return f"{actor_name} made an update."

        parts = []
        for c in changes[:3]:  # Keeping it short, UI will render full
            parts.append(f'{c["field"]} ({c["from"]} → {c["to"]})')

        suffix = ""
        if len(changes) > 3:
            suffix = f" +{len(changes) - 3} more"

        if event == "CREATED":
            return f"{actor_name} created this record."
        if parts:
            return f"{actor_name} updated " + "; ".join(parts) + suffix + "."
        return f"{actor_name} updated this record."
