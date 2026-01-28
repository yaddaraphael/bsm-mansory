# backend/meetings/serializers.py
from rest_framework import serializers
from django.db import transaction

from .models import Meeting, MeetingJob, MeetingJobPhase
from accounts.serializers import UserSerializer
from projects.serializers import ProjectSerializer
from branches.serializers import BranchSerializer

from projects.models import Project
from branches.models import Branch


# -----------------------------------
# Helpers
# -----------------------------------
def _clean_str(value: str) -> str:
    return (value or "").strip()


def _project_queryset_for_meeting_jobs(context) -> "Project.objects":
    """
    IMPORTANT:
    Previously you restricted to Project.objects.filter(status="ACTIVE").
    That can make you see only one division if only one division has ACTIVE projects.

    Now default is ALL projects.

    If you want to keep the old behavior for some endpoints, you can pass
    context['active_only'] = True from the view.
    """
    qs = Project.objects.all()

    active_only = bool(context.get("active_only"))
    if active_only:
        qs = qs.filter(status="ACTIVE")

    return qs


# -----------------------------
# PHASES
# -----------------------------
class MeetingJobPhaseSerializer(serializers.ModelSerializer):
    """Read serializer for MeetingJobPhase."""

    class Meta:
        model = MeetingJobPhase
        fields = [
            "id",
            "phase_code",
            "phase_description",
            "masons",
            "operators",
            "labors",
            "quantity",
            "installed_quantity",
            "duration",
            "percent_complete",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "percent_complete", "created_at", "updated_at"]


class MeetingJobPhaseCreateUpdateSerializer(serializers.ModelSerializer):
    """Write serializer for MeetingJobPhase."""

    class Meta:
        model = MeetingJobPhase
        fields = [
            "id",
            "meeting_job",
            "phase_code",
            "phase_description",
            "masons",
            "operators",
            "labors",
            "quantity",
            "installed_quantity",
            "duration",
            "notes",
        ]
        read_only_fields = ["id"]

    def validate_phase_code(self, value: str):
        value = _clean_str(value)
        if not value:
            raise serializers.ValidationError("phase_code is required.")
        return value

    def validate(self, attrs):
        # Optional numeric sanity checks
        qty = attrs.get("quantity")
        inst = attrs.get("installed_quantity")
        if qty is not None and qty < 0:
            raise serializers.ValidationError({"quantity": "Must be >= 0."})
        if inst is not None and inst < 0:
            raise serializers.ValidationError({"installed_quantity": "Must be >= 0."})
        return attrs


# -----------------------------
# MEETING JOBS
# -----------------------------
class MeetingJobSerializer(serializers.ModelSerializer):
    """
    Read serializer for MeetingJob.
    Includes nested project + phases for review/detail pages.
    """
    project = ProjectSerializer(read_only=True)
    project_id = serializers.IntegerField(source="project.id", read_only=True)
    phases = MeetingJobPhaseSerializer(many=True, read_only=True)

    class Meta:
        model = MeetingJob
        fields = [
            "id",
            "meeting",
            "project",
            "project_id",
            "masons",
            "labors",
            "notes",
            "handoff_from_estimator",
            "handoff_to_foreman",
            "site_specific_safety_plan",
            "saturdays",
            "full_weekends",
            "selected_scope",
            "phases",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class MeetingJobCreateUpdateSerializer(serializers.ModelSerializer):
    """
    Write serializer for MeetingJob.

    ✅ KEY CHANGE:
    - Old: queryset=Project.objects.filter(status="ACTIVE")
    - New: queryset=Project.objects.all() (or active_only if passed via context)

    This prevents "only one division" behavior when other divisions' projects
    are not ACTIVE (or are filtered out).
    """

    # Accept project id under 'project' (write-only) for compatibility
    project = serializers.PrimaryKeyRelatedField(
        queryset=Project.objects.none(),  # set dynamically in __init__
        write_only=True,
        required=True,
    )

    class Meta:
        model = MeetingJob
        fields = [
            "id",
            "meeting",
            "project",
            "masons",
            "labors",
            "notes",
            "handoff_from_estimator",
            "handoff_to_foreman",
            "site_specific_safety_plan",
            "saturdays",
            "full_weekends",
            "selected_scope",
        ]
        read_only_fields = ["id"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # set queryset dynamically so we can allow ALL projects by default
        self.fields["project"].queryset = _project_queryset_for_meeting_jobs(self.context)

    def validate(self, attrs):
        # Optional: ensure meeting and project match branch (ONLY if you want that rule)
        # meeting = attrs.get("meeting") or getattr(self.instance, "meeting", None)
        # project = attrs.get("project") or getattr(self.instance, "project", None)
        # if meeting and project and meeting.branch_id and project.branch_id and meeting.branch_id != project.branch_id:
        #     raise serializers.ValidationError("Project branch does not match meeting branch.")
        return attrs

    def create(self, validated_data):
        # 'project' already resolved to Project instance by PK field
        return super().create(validated_data)

    def update(self, instance, validated_data):
        # allow changing project
        project = validated_data.pop("project", None)
        if project is not None:
            instance.project = project
        return super().update(instance, validated_data)


# -----------------------------
# MEETINGS
# -----------------------------
class MeetingListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for /meetings list page.
    No nested jobs (fast).
    """
    created_by = UserSerializer(read_only=True)
    branch = BranchSerializer(read_only=True)
    meeting_jobs_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Meeting
        fields = [
            "id",
            "meeting_date",
            "week_number",
            "created_by",
            "branch",
            "notes",
            "status",
            "meeting_jobs_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class MeetingSerializer(serializers.ModelSerializer):
    """
    Full detail serializer for Meeting (retrieve/review/export).
    Includes nested meeting_jobs and phases.
    """
    created_by = UserSerializer(read_only=True)
    branch = BranchSerializer(read_only=True)

    # write-only branch id
    branch_id = serializers.PrimaryKeyRelatedField(
        queryset=Branch.objects.all(),
        source="branch",
        write_only=True,
        required=False,
        allow_null=True,
    )

    meeting_jobs = MeetingJobSerializer(many=True, read_only=True)
    meeting_jobs_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Meeting
        fields = [
            "id",
            "meeting_date",
            "week_number",
            "created_by",
            "branch",
            "branch_id",
            "notes",
            "status",
            "meeting_jobs",
            "meeting_jobs_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "week_number", "created_at", "updated_at"]

    @transaction.atomic
    def create(self, validated_data):
        """
        Ensure created_by always comes from request.
        branch is already handled via branch_id -> source="branch".
        """
        request = self.context.get("request")
        if request and getattr(request, "user", None) and request.user.is_authenticated:
            validated_data["created_by"] = request.user
        return super().create(validated_data)

    @transaction.atomic
    def update(self, instance, validated_data):
        return super().update(instance, validated_data)
