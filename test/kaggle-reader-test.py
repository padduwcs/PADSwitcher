"""Offline contract tests using real official SDK request/response types."""
import datetime as dt
import importlib.util
import json
import sys
from pathlib import Path
from types import SimpleNamespace as NS
import unittest

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location("reader", Path(__file__).resolve().parents[1] / "src/core/kaggle-reader.py")
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)

from kagglesdk.security.types.oauth_service import IntrospectTokenResponse
from kagglesdk.kernels.types.kernels_api_service import (
    ApiGetAcceleratorQuotaStatisticsResponse, ApiListKernelsResponse,
    ApiGetKernelSessionStatusResponse, ApiKernelMetadata,
)
from kagglesdk.kernels.types.kernels_enums import KernelWorkerStatus, KernelsListViewType, KernelsListSortType

TOKEN = "KGAT_fixture-only-contract-token"


class Client:
    def __init__(self, active=True, quota_error=None, list_error=None, status_error=None):
        self.active, self.quota_error, self.list_error, self.status_error = active, quota_error, list_error, status_error
        self.security = NS(oauth_client=NS(introspect_token=self.identity))
        self.kernels = NS(kernels_api_client=NS(get_accelerator_quota_statistics=self.quota, list_kernels=self.listing, get_kernel_session_status=self.status))
        self.refs = []

    def __enter__(self): return self
    def __exit__(self, *_): return False

    def identity(self, request):
        assert request.token == TOKEN
        response = IntrospectTokenResponse()
        response.active, response.username = self.active, "fixtureuser"
        return response

    def quota(self, request):
        if self.quota_error: raise self.quota_error
        # Nested quota data exercises the official response properties and timedelta units.
        response = ApiGetAcceleratorQuotaStatisticsResponse()
        from kagglesdk.kernels.types.kernels_api_service import ApiAcceleratorQuota
        item = ApiAcceleratorQuota()
        item.time_used, item.total_time_allowed, item.time_reserved = dt.timedelta(hours=10), dt.timedelta(hours=30), dt.timedelta(hours=2)
        response.gpu_quota = item
        response.quota_refresh_time = dt.datetime(2026, 10, 15, tzinfo=dt.timezone.utc)
        return response

    def listing(self, request):
        if self.list_error: raise self.list_error
        assert request.group == KernelsListViewType.PROFILE
        assert request.sort_by == KernelsListSortType.DATE_RUN
        assert request.page_size == 12
        notebook = ApiKernelMetadata()
        notebook.ref, notebook.title, notebook.enable_gpu = "fixtureuser/job", "Job", True
        response = ApiListKernelsResponse()
        response.kernels = [notebook]
        return response

    def status(self, request):
        self.refs.append(request.user_name + "/" + request.kernel_slug)
        if self.status_error: raise self.status_error
        response = ApiGetKernelSessionStatusResponse()
        response.status = KernelWorkerStatus.RUNNING
        return response


def http_error(code):
    error = RuntimeError("Fixture contains sensitive request " + TOKEN)
    error.response = NS(status_code=code)
    return error


class Contract(unittest.TestCase):
    def read(self, client, **fields):
        return reader.read_account({"action": "refresh", "token": TOKEN, **fields}, lambda: client)

    def test_supported_package_version_bounds(self):
        for version in ("2.2.4", "2.2.4.post1", "2.3.0"):
            self.assertTrue(reader.version_ok(version, (2, 2, 4), (3, 0, 0)))
        for version in (None, "2.2.3", "3.0.0", "2.2.4rc1"):
            self.assertFalse(reader.version_ok(version, (2, 2, 4), (3, 0, 0)))
        self.assertTrue(reader.version_ok("0.1.37", (0, 1, 37), (1, 0, 0)))
        self.assertFalse(reader.version_ok("1.0.0", (0, 1, 37), (1, 0, 0)))

    def test_versions_and_quota_units(self):
        self.assertTrue(reader.versions()["supported"])
        client = Client()
        result = self.read(client, watch=["fixtureuser/job", "fixtureuser/pinned", "invalid"])
        self.assertTrue(result["ok"])
        self.assertEqual(result["quota"][0]["remaining"], 20)
        self.assertEqual(result["quota"][0]["reserved"], 2)
        self.assertEqual(client.refs, ["fixtureuser/job", "fixtureuser/pinned"])
        self.assertEqual(result["notebooks"][0]["status"], "running")
        self.assertEqual(result["notebooks"][0]["accelerator"], "GPU")
        self.assertNotIn(TOKEN, json.dumps(result))

    def test_identity_mismatch_and_revocation(self):
        self.assertEqual(self.read(Client(), username="other")["code"], "KAGGLE_IDENTITY")
        self.assertEqual(self.read(Client(False))["code"], "KAGGLE_AUTH")
        result = reader.read_account({"action": "verify", "token": TOKEN}, lambda: Client())
        self.assertEqual(result, {"ok": True, "username": "fixtureuser"})

    def test_partial_errors_and_pinned_fallback(self):
        result = self.read(Client(quota_error=http_error(429), list_error=http_error(403), status_error=http_error(404)), watch=["fixtureuser/pinned"])
        self.assertEqual(result["quotaError"], "KAGGLE_RATE_LIMIT")
        self.assertEqual(result["notebooksError"], "KAGGLE_FORBIDDEN")
        self.assertEqual(result["notebooks"][0]["errorCode"], "KAGGLE_NOT_FOUND")
        self.assertEqual(result["notebooks"][0]["status"], "unknown")
        self.assertNotIn(TOKEN, json.dumps(result))


if __name__ == "__main__":
    unittest.main()
