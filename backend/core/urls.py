from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework.routers import DefaultRouter
from .api import ResidentTimelineAPIView
from .views import (
    ResidentViewSet,
    ShiftViewSet,
    DailyLogViewSet,
    IncidentViewSet,
    CarePlanViewSet,
    MedicationViewSet,
    MedicationAdministrationRecordViewSet,
)

router = DefaultRouter()
router.register("residents", ResidentViewSet)
router.register("shifts", ShiftViewSet)
router.register("daily-logs", DailyLogViewSet)
router.register("incidents", IncidentViewSet)
router.register("care-plans", CarePlanViewSet)
router.register("medications", MedicationViewSet)
router.register("mar", MedicationAdministrationRecordViewSet)
urlpatterns = router.urls

urlpatterns = router.urls + [
    path(
        "residents/<int:resident_id>/timeline/",
        ResidentTimelineAPIView.as_view(),
        name="resident-timeline",
    ),
    path("auth/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
]
