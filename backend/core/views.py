from rest_framework import viewsets
from django.db import transaction
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q
from simple_history.utils import update_change_reason
from .permissions import (
    IsStaff,
    IsManager,
    IsReporterOrManager,
    IsAdministererOrManager,
    IsAuthorOrManager,
)
from .models import (
    Resident,
    Shift,
    DailyLog,
    Incident,
    CarePlan,
    Medication,
    MedicationAdministrationRecord,
)
from .serializers import (
    ResidentSerializer,
    ShiftSerializer,
    DailyLogSerializer,
    IncidentSerializer,
    CarePlanSerializer,
    MedicationSerializer,
    MedicationAdministrationRecordSerializer,
    HistoryRecordSerializer,
    HistorySummaryEventSerializer,
    ResidentLookupSerializer,
)


class ResidentViewSet(viewsets.ModelViewSet):
    queryset = Resident.objects.all().order_by("-updated_at")
    serializer_class = ResidentSerializer
    permission_classes = [IsManager]

    @action(
        detail=False,
        methods=["get"],
        permission_classes=[IsAuthenticated],
        url_path="lookup",
    )
    def lookup(self, request):
        q = request.query_params.get("q", "").strip()

        if not q:
            return Response([])

        residents = Resident.objects.filter(
            Q(legal_name__icontains=q) | Q(preferred_name__icontains=q)
        ).order_by("legal_name")[:10]

        serializer = ResidentLookupSerializer(residents, many=True)
        return Response(serializer.data)


class ShiftViewSet(viewsets.ModelViewSet):
    queryset = Shift.objects.all().order_by("-starts_at")
    serializer_class = ShiftSerializer
    permission_classes = [IsStaff]


class DailyLogViewSet(viewsets.ModelViewSet):
    queryset = DailyLog.objects.select_related("resident", "author").order_by(
        "-event_at"
    )
    serializer_class = DailyLogSerializer
    permission_classes = [IsStaff, IsAuthorOrManager]

    def perform_create(self, serializer):
        instance = serializer.save(author=self.request.user)
        instance._history_request = self.request

        # For late entries, also mirror the reason into history_change_reason (human readable audit)
        reason = (serializer.validated_data.get("edit_reason_detail") or "").strip()
        if reason:
            update_change_reason(instance, reason)

    def perform_update(self, serializer):
        instance = serializer.instance
        instance._history_user = self.request.user

        reason = (serializer.validated_data.get("edit_reason_detail") or "").strip()
        instance._change_reason = reason

        saved = serializer.save()

        if reason:
            update_change_reason(saved, reason)

    def destroy(self, request, *args, **kwargs):
        raise PermissionDenied("Deletion is not permitted for clinical records.")


class IncidentViewSet(viewsets.ModelViewSet):
    queryset = Incident.objects.select_related("resident", "reported_by").order_by(
        "-occurred_at"
    )
    serializer_class = IncidentSerializer
    permission_classes = [IsStaff, IsReporterOrManager]

    def perform_create(self, serializer):
        instance = serializer.save(reported_by=self.request.user)
        instance._history_request = self.request

    def perform_update(self, serializer):
        instance = serializer.instance

        instance._history_user = self.request.user
        instance._history_request = self.request

        reason = (
            serializer.validated_data.get("edit_reason_detail") or ""
        ).strip() or (
            serializer.validated_data.get("last_edit_reason_detail") or ""
        ).strip()

        instance._change_reason = reason

        saved = serializer.save()

        if reason:
            # Ensure we write to the *actual* newest history row created by this save
            def _write_reason():
                latest_hist = saved.history.order_by(
                    "-history_date", "-history_id"
                ).first()
                if latest_hist:
                    latest_hist.history_change_reason = reason
                    latest_hist.save(update_fields=["history_change_reason"])

            transaction.on_commit(_write_reason)

    def get_permissions(self):
        if getattr(self, "action", None) in {"history", "history_summary"}:
            return [IsManager()]
        return [permission() for permission in self.permission_classes]

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        incident = self.get_object()
        qs = incident.history.all().order_by("-history_date")

        serializer = HistoryRecordSerializer(
            qs,
            many=True,
            context={"history_list": list(qs)},  # <-- MUST match qs ordering
        )
        return Response(serializer.data)

    @action(
        detail=True,
        methods=["get"],
        url_path="history-summary",
        url_name="history-summary",
    )
    def history_summary(self, request, pk=None):
        incident = self.get_object()
        qs = incident.history.all().order_by("-history_date")

        serializer = HistorySummaryEventSerializer(
            qs,
            many=True,
            context={"history_list": list(qs)},  # <-- MUST match qs ordering
        )
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        raise PermissionDenied("Deletion of incidents is not permitted.")


class CarePlanViewSet(viewsets.ModelViewSet):
    queryset = CarePlan.objects.select_related("resident").order_by("-updated_at")
    serializer_class = CarePlanSerializer
    permission_classes = [IsManager]


class MedicationViewSet(viewsets.ModelViewSet):
    queryset = Medication.objects.select_related("resident").order_by("-updated_at")
    serializer_class = MedicationSerializer
    permission_classes = [IsStaff]


class MedicationAdministrationRecordViewSet(viewsets.ModelViewSet):
    queryset = MedicationAdministrationRecord.objects.select_related(
        "medication", "administered_by"
    ).order_by("-administered_at")
    serializer_class = MedicationAdministrationRecordSerializer
    permission_classes = [IsStaff, IsAdministererOrManager]

    def perform_create(self, serializer):
        instance = serializer.save(administered_by=self.request.user)

        # Attribute history
        instance._history_user = self.request.user

        # Optional parity: if a reason was provided on create, mirror it into history_change_reason
        reason = (serializer.validated_data.get("edit_reason_detail") or "").strip()
        if reason:
            update_change_reason(instance, reason)

    def perform_update(self, serializer):
        instance = serializer.instance

        instance._history_user = self.request.user
        instance._history_request = self.request

        reason = (
            serializer.validated_data.get("edit_reason_detail") or ""
        ).strip() or (
            serializer.validated_data.get("last_edit_reason_detail") or ""
        ).strip()

        instance._change_reason = reason

        saved = serializer.save()

        if reason:

            def _write_reason():
                latest_hist = saved.history.order_by(
                    "-history_date", "-history_id"
                ).first()
                if latest_hist:
                    latest_hist.history_change_reason = reason
                    latest_hist.save(update_fields=["history_change_reason"])

            transaction.on_commit(_write_reason)

    def get_permissions(self):
        # Manager-only history endpoints
        if getattr(self, "action", None) in {"history", "history_summary"}:
            return [IsManager()]
        return [permission() for permission in self.permission_classes]

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        mar = self.get_object()
        qs = mar.history.all().order_by("-history_date")

        serializer = HistoryRecordSerializer(
            qs,
            many=True,
            context={"history_list": list(qs)},  # <-- MUST match qs ordering
        )
        return Response(serializer.data)

    @action(
        detail=True,
        methods=["get"],
        url_path="history-summary",
        url_name="history-summary",
    )
    def history_summary(self, request, pk=None):
        mar = self.get_object()
        qs = mar.history.all().order_by("-history_date")

        serializer = HistorySummaryEventSerializer(
            qs,
            many=True,
            context={"history_list": list(qs)},  # <-- MUST match qs ordering
        )
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        raise PermissionDenied("Medication administration records cannot be deleted.")
