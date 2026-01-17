from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.authentication import JWTAuthentication
from .models import (
    Resident,
    DailyLog,
    Incident,
    MedicationAdministrationRecord,
)
from .serializers import (
    DailyLogTimelineSerializer,
    IncidentTimelineSerializer,
    MARTimelineSerializer,
)


class ResidentTimelineAPIView(APIView):
    """
    Returns a combined, read-only timeline for a resident:
    - Daily logs
    - Incidents
    - Medication administrations
    """

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, resident_id):
        resident = Resident.objects.filter(id=resident_id).first()
        if not resident:
            return Response(
                {"detail": "Resident not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        logs = DailyLog.objects.filter(resident=resident).select_related("author")
        incidents = Incident.objects.filter(resident=resident).select_related(
            "reported_by"
        )
        mar = MedicationAdministrationRecord.objects.filter(
            medication__resident=resident
        ).select_related("administered_by", "medication")

        combined = []

        for item in DailyLogTimelineSerializer(logs, many=True).data:
            combined.append(
                {
                    **item,
                    "timestamp": item["created_at"],
                }
            )

        for item in IncidentTimelineSerializer(incidents, many=True).data:
            combined.append(
                {
                    **item,
                    "timestamp": item["occurred_at"],
                }
            )

        for item in MARTimelineSerializer(mar, many=True).data:
            combined.append(
                {
                    **item,
                    "timestamp": item["administered_at"],
                }
            )

        combined.sort(key=lambda e: e["timestamp"], reverse=True)

        return Response(
            {
                "resident_id": resident.id,
                "resident_name": resident.legal_name,
                "events": combined,
            },
            status=status.HTTP_200_OK,
        )
