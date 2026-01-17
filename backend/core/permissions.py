from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsStaff(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.groups.filter(name__in=["staff", "manager"]).exists()
        )


class IsManager(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.groups.filter(name="manager").exists()
        )


class IsReporterOrManager(BasePermission):
    """
    For incident: allow edits if user is reported_by OR is manager.
    Read access is handled by IsStaff
    """

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        if request.user.groups.filter(name="manager").exists():
            return True
        return getattr(obj, "reported_by_id", None) == request.user.id


class IsAdministererOrManager(BasePermission):
    """
    For MAR: allow edits if user is administered_by OR is manager.
    Read access is handled by IsStaff
    """

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        if request.user.groups.filter(name="manager").exists():
            return True
        return getattr(obj, "administered_by_id", None) == request.user.id
