"""Read-only Kaggle bridge. Credentials arrive on stdin, never in argv or output."""
import contextlib
import importlib.metadata
import io
import json
import math
import re
import os
import sysconfig
import sys


def versions():
    scripts = sysconfig.get_path("scripts")
    # A normal Windows pip installation may live in the user site.
    if os.name == "nt" and not os.path.isfile(os.path.join(scripts, "kaggle.exe")):
        user_scripts = sysconfig.get_path("scripts", scheme="nt_user")
        if os.path.isfile(os.path.join(user_scripts, "kaggle.exe")):
            scripts = user_scripts
    result = {"python": sys.version.split()[0], "executable": sys.executable,
              "scriptsPath": scripts}
    for package in ("kaggle", "kagglesdk"):
        try:
            result[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            result[package] = None
    result["supported"] = (sys.version_info >= (3, 11)
                           and version_ok(result["kaggle"], (2, 2, 4))
                           and version_ok(result["kagglesdk"], (0, 1, 37)))
    if os.name == "nt":
        result["supported"] = result["supported"] and os.path.isfile(os.path.join(scripts, "kaggle.exe"))
    return result


def version_ok(value, minimum):
    match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)(?:\.post\d+)?", value or "")
    return bool(match and tuple(map(int, match.groups())) >= minimum)


def error_code(error):
    status = getattr(getattr(error, "response", None), "status_code", None)
    return {401: "KAGGLE_AUTH", 403: "KAGGLE_FORBIDDEN", 404: "KAGGLE_NOT_FOUND",
            429: "KAGGLE_RATE_LIMIT"}.get(status, "KAGGLE_NETWORK" if status is None or status >= 500 else "KAGGLE_RESPONSE")


def stamp(value):
    return value.isoformat() if value is not None else None


def hours(value):
    number = value.total_seconds() / 3600 if value is not None else None
    return max(0, number) if number is not None and math.isfinite(number) else None


def read_account(payload, client_factory=None):
    from kagglesdk.kaggle_client import KaggleClient
    from kagglesdk.kaggle_env import KaggleEnv
    from kagglesdk.security.types.oauth_service import IntrospectTokenRequest
    from kagglesdk.kernels.types.kernels_api_service import (
        ApiGetAcceleratorQuotaStatisticsRequest, ApiListKernelsRequest,
        ApiGetKernelSessionStatusRequest,
    )
    from kagglesdk.kernels.types.kernels_enums import KernelsListSortType, KernelsListViewType

    token = payload.get("token", "")
    if not isinstance(token, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{16,8192}", token):
        return {"ok": False, "code": "KAGGLE_TOKEN"}
    # Explicit token + production endpoint: never read the user's default CLI credentials.
    factory = client_factory or (lambda: KaggleClient(env=KaggleEnv.PROD, api_token=token))
    with factory() as client:
        request = IntrospectTokenRequest()
        request.token = token
        identity = client.security.oauth_client.introspect_token(request)
        if not identity.active or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", identity.username or ""):
            return {"ok": False, "code": "KAGGLE_AUTH"}
        username = identity.username
        if payload.get("username") and payload["username"].lower() != username.lower():
            return {"ok": False, "code": "KAGGLE_IDENTITY"}
        result = {"ok": True, "username": username}
        if payload.get("action") == "verify":
            return result

        try:
            quota = client.kernels.kernels_api_client.get_accelerator_quota_statistics(ApiGetAcceleratorQuotaStatisticsRequest())
            rows = []
            for name, item in (("GPU", quota.gpu_quota), ("TPU", quota.tpu_quota)):
                if item is None:
                    continue
                used, total = hours(item.time_used), hours(item.total_time_allowed)
                rows.append({"resource": name, "used": used, "total": total,
                             "remaining": max(0, total - used) if total is not None and used is not None else None,
                             "reserved": hours(item.time_reserved), "refreshAt": stamp(quota.quota_refresh_time)})
            result["quota"] = rows
        except Exception as error:
            result["quotaError"] = error_code(error)

        notebooks = {}
        try:
            request = ApiListKernelsRequest()
            request.group = KernelsListViewType.PROFILE
            request.sort_by = KernelsListSortType.DATE_RUN
            request.page_size = 12
            request.page = 1
            request.language = request.kernel_type = request.output_type = "all"
            listing = client.kernels.kernels_api_client.list_kernels(request)
            for item in listing.kernels or []:
                if not item or not re.fullmatch(r"[A-Za-z0-9_-]+/[A-Za-z0-9_-]+", item.ref or ""):
                    continue
                notebooks[item.ref] = {"ref": item.ref, "title": (item.title or item.ref)[:200],
                                       "lastRunAt": stamp(item.last_run_time),
                                       "accelerator": "GPU" if item.enable_gpu else "TPU" if item.enable_tpu else "CPU",
                                       "machineShape": (item.machine_shape or "")[:80]}
        except Exception as error:
            result["notebooksError"] = error_code(error)

        for ref in payload.get("watch", [])[:20]:
            if isinstance(ref, str) and re.fullmatch(r"[A-Za-z0-9_-]+/[A-Za-z0-9_-]+", ref):
                notebooks.setdefault(ref, {"ref": ref, "title": ref, "lastRunAt": None,
                                           "accelerator": None, "machineShape": ""})
        statuses = {"QUEUED": "queued", "RUNNING": "running", "COMPLETE": "complete",
                    "ERROR": "error", "CANCEL_REQUESTED": "stopping",
                    "CANCEL_ACKNOWLEDGED": "cancelled", "NEW_SCRIPT": "saved"}
        for ref, notebook in notebooks.items():
            try:
                request = ApiGetKernelSessionStatusRequest()
                request.user_name, request.kernel_slug = ref.split("/")
                status = client.kernels.kernels_api_client.get_kernel_session_status(request)
                notebook["status"] = statuses.get(getattr(status.status, "name", ""), "unknown")
            except Exception as error:
                notebook["status"] = "unknown"
                notebook["errorCode"] = error_code(error)
        result["notebooks"] = list(notebooks.values())
        result["recentLimit"] = 12
        return result


def main():
    try:
        payload = json.loads(sys.stdin.read(32768))
        if not isinstance(payload, dict):
            raise ValueError()
        # Suppress SDK/package messages. Only this bridge's allowlisted JSON is returned.
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            if payload.get("action") == "probe":
                result = {"ok": True, **versions()}
            elif not versions()["supported"]:
                result = {"ok": False, "code": "KAGGLE_DEPENDENCIES"}
            elif payload.get("action") in ("verify", "refresh"):
                import requests
                send = requests.Session.send

                def bounded_send(self, request, **kwargs):
                    kwargs.setdefault("timeout", 12)
                    return send(self, request, **kwargs)

                requests.Session.send = bounded_send
                result = read_account(payload)
            else:
                result = {"ok": False, "code": "KAGGLE_REQUEST"}
    except Exception as error:
        result = {"ok": False, "code": error_code(error)}
    print(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()
