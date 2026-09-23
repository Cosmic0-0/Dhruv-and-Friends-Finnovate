"""Tests for checks/trufor.py.

This is the real TruFor integration (not a mocked stub) - see that
module's docstring for the vendoring/weights story. Two of these tests
depend on the pretrained weights actually being present at
vendor/trufor/weights/trufor.pth (gitignored, fetched out of band per the
module docstring); they're skipped, not failed, when the weights aren't
there, so this suite still passes on a fresh checkout that hasn't run the
one-time download.

The no-network-calls test does NOT depend on the weights being present:
it must hold either way, since it's the property that matters most (this
check may never phone home at request time, model loaded or not).

Every test here imports checks.trufor through the `trufor` fixture below
rather than at module level - see that fixture's docstring for why doing
this at import/collection time would silently break
tests/test_orchestrator.py's sys.modules-based mocking of this same
module.
"""

from __future__ import annotations

import os
import socket
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

from app.models import CheckName, CheckStatus, Confidence

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "trufor"


def _default_weights_path() -> Path:
    # Deliberately duplicated from checks/trufor.py's own _weights_path()
    # rather than imported: computing this needs no real import of that
    # module, which is the whole point (see the `trufor` fixture below).
    override = os.environ.get("TRUFOR_WEIGHTS_PATH")
    if override:
        return Path(override)
    return Path(__file__).resolve().parent.parent / "vendor" / "trufor" / "weights" / "trufor.pth"


_WEIGHTS_PRESENT = _default_weights_path().is_file()
_SKIP_REASON = "TruFor weights not present locally; see checks/trufor.py's module docstring for the one-time download step"


@pytest.fixture
def trufor():
    """Imports checks.trufor for this one test only, then undoes the
    import.

    checks/trufor.py is meant to be imported lazily, only once the
    orchestrator has decided to escalate to it - app/orchestrator.py's own
    tests (tests/test_orchestrator.py) rely on this and mock the module
    out via `monkeypatch.setitem(sys.modules, "checks.trufor", ...)`.
    That trick only works before `checks.trufor` has ever been imported
    for real in this process: Python's import machinery, once it imports
    a submodule, caches it as a permanent attribute on the parent package
    (`checks.trufor`), and `from checks import trufor` reuses that
    attribute directly whenever it's already set - without even
    consulting sys.modules (see importlib._bootstrap._handle_fromlist).
    A module-level `from checks import trufor` in this file would set
    that attribute at collection time, before any test in the whole
    session runs, and would silently defeat test_orchestrator.py's mock
    for the rest of the run. Importing inside a function-scoped fixture,
    and deleting both the sys.modules entry and the parent attribute again
    on teardown, keeps this real import from leaking outside this test.
    """
    import checks
    import checks.trufor as trufor_module

    yield trufor_module

    sys.modules.pop("checks.trufor", None)
    if hasattr(checks, "trufor"):
        del checks.trufor
    trufor_module._model = None


def _read_fixture(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def test_run_is_inconclusive_when_weights_are_missing(trufor, monkeypatch, tmp_path):
    monkeypatch.setenv(trufor._WEIGHTS_ENV_VAR, str(tmp_path / "does-not-exist.pth"))
    trufor._model = None

    result = trufor.run(b"not-a-real-image", "image/jpeg", {})

    assert result.status == CheckStatus.INCONCLUSIVE
    assert result.indicators == []


def test_no_network_calls_during_run(trufor):
    """Transport-level guarantee: whatever run() does internally (model
    load, inference), it must never open a socket. Patching
    socket.socket.connect catches this regardless of which HTTP client
    (or none) is involved - this implementation happens to use none: the
    weights are loaded from a local path chosen before this call, and the
    vendored model is built from plain nn.Module subclasses rather than,
    say, timm.create_model(pretrained=True), which would otherwise try to
    fetch backbone weights from the network on first use."""
    with patch.object(socket.socket, "connect") as mock_connect:
        result = trufor.run(_read_fixture("pristine1.jpg"), "image/jpeg", {})

    mock_connect.assert_not_called()
    assert result.status in (CheckStatus.CLEAN, CheckStatus.SUSPICIOUS, CheckStatus.INCONCLUSIVE)


@pytest.mark.skipif(not _WEIGHTS_PRESENT, reason=_SKIP_REASON)
def test_pristine_fixture_is_not_flagged_suspicious(trufor):
    result = trufor.run(_read_fixture("pristine1.jpg"), "image/jpeg", {})

    assert result.status != CheckStatus.SUSPICIOUS
    assert result.indicators == []


@pytest.mark.skipif(not _WEIGHTS_PRESENT, reason=_SKIP_REASON)
def test_tampered_fixture_is_flagged_suspicious(trufor):
    result = trufor.run(_read_fixture("tampered2.png"), "image/png", {})

    assert result.status == CheckStatus.SUSPICIOUS
    assert len(result.indicators) == 1
    indicator = result.indicators[0]
    assert indicator.check == CheckName.TRUFOR
    assert indicator.confidence == Confidence.HIGH
    assert "TruFor integrity score" in indicator.evidence
