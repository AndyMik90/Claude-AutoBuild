import io
import json
import sys

import pytest

from apps.backend.ollama_model_detector import (
    cmd_check_installed,
    cmd_pull_model,
    get_default_ollama_url,
    get_embedding_dim,
    is_embedding_model,
    parse_version,
    version_gte,
)


def test_parse_version():
    assert parse_version("0.10.0") == (0, 10, 0)
    assert parse_version("0.1.2-rc3") == (0, 1, 2)
    assert parse_version(None) == (0, 0, 0)
    assert parse_version("") == (0, 0, 0)
    assert parse_version("invalid") == (0, 0, 0)


def test_version_gte():
    assert version_gte("0.10.0", "0.9.0") is True
    assert version_gte("0.10.0", "0.10.0") is True
    assert version_gte("0.9.0", "0.10.0") is False
    assert version_gte(None, "0.10.0") is False


def test_is_embedding_model():
    assert is_embedding_model("nomic-embed-text") is True
    assert is_embedding_model("embeddinggemma") is True
    assert is_embedding_model("qwen3-embedding") is True
    assert is_embedding_model("llama3") is False
    assert is_embedding_model("mxbai-embed-large") is True


def test_get_embedding_dim():
    assert get_embedding_dim("nomic-embed-text") == 768
    assert get_embedding_dim("embeddinggemma") == 768
    assert get_embedding_dim("qwen3-embedding:8b") == 4096
    assert get_embedding_dim("mxbai-embed-large") == 1024
    assert get_embedding_dim("unknown-model") is None


def test_get_default_ollama_url(monkeypatch):
    # Default fallback
    monkeypatch.delenv("OLLAMA_HOST", raising=False)
    assert get_default_ollama_url() == "http://localhost:11434"

    # Simple host
    monkeypatch.setenv("OLLAMA_HOST", "192.168.1.5")
    assert get_default_ollama_url() == "http://192.168.1.5:11434"

    # Host with port
    monkeypatch.setenv("OLLAMA_HOST", "0.0.0.0:12345")
    assert get_default_ollama_url() == "http://0.0.0.0:12345"

    # Full URL
    monkeypatch.setenv("OLLAMA_HOST", "https://ollama.my.domain")
    assert get_default_ollama_url() == "https://ollama.my.domain"

    # IPv6 naked address
    monkeypatch.setenv("OLLAMA_HOST", "::1")
    assert get_default_ollama_url() == "http://[::1]:11434"

    # IPv6 with brackets and port
    monkeypatch.setenv("OLLAMA_HOST", "[::1]:12345")
    assert get_default_ollama_url() == "http://[::1]:12345"

    # IPv6 with brackets but no port
    monkeypatch.setenv("OLLAMA_HOST", "[::1]")
    assert get_default_ollama_url() == "http://[::1]:11434"


def test_cmd_check_installed(mocker):
    # Mock find_executable to find ollama
    mocker.patch(
        "apps.backend.ollama_model_detector.find_executable",
        return_value="/usr/local/bin/ollama",
    )

    # Capture stdout
    stdout = io.StringIO()
    mocker.patch.object(sys, "stdout", stdout)

    with pytest.raises(SystemExit):
        cmd_check_installed(None)

    result = json.loads(stdout.getvalue())
    assert result["success"] is True
    assert result["data"]["installed"] is True
    assert result["data"]["path"] == "/usr/local/bin/ollama"

    # Mock find_executable to not find ollama
    mocker.patch(
        "apps.backend.ollama_model_detector.find_executable", return_value=None
    )

    stdout = io.StringIO()
    mocker.patch.object(sys, "stdout", stdout)

    with pytest.raises(SystemExit):
        cmd_check_installed(None)

    result = json.loads(stdout.getvalue())
    assert result["success"] is True
    assert result["data"]["installed"] is False


def test_cmd_pull_model(mocker):
    # Mock version checks to avoid extra urlopen calls
    mocker.patch(
        "apps.backend.ollama_model_detector.get_ollama_version", return_value="0.12.0"
    )
    mocker.patch(
        "apps.backend.ollama_model_detector.get_model_min_version", return_value=None
    )

    # Mock urllib.request.urlopen for the actual pull
    mock_response = io.BytesIO(
        b'{"status": "pulling manifest"}\n'
        b'{"status": "downloading", "completed": 50, "total": 100}\n'
        b'{"status": "success"}\n'
    )
    mocker.patch("urllib.request.urlopen", return_value=mock_response)

    # Mock argparse.Namespace
    args = mocker.Mock()
    args.model = "nomic-embed-text"
    args.base_url = "http://localhost:11434"

    # Capture stdout/stderr
    stdout = io.StringIO()
    stderr = io.StringIO()
    mocker.patch.object(sys, "stdout", stdout)
    mocker.patch.object(sys, "stderr", stderr)

    with pytest.raises(SystemExit):
        cmd_pull_model(args)

    # Verify summary JSON in stdout
    result = json.loads(stdout.getvalue())
    assert result["success"] is True
    assert result["data"]["status"] == "completed"

    # Verify progress NDJSON in stderr (only the line with completed/total is emitted)
    progress_lines = stderr.getvalue().strip().split("\n")
    assert len(progress_lines) == 1
    progress_data = json.loads(progress_lines[0])
    assert progress_data["completed"] == 50
    assert progress_data["total"] == 100


def test_cmd_pull_model_error(mocker):
    # Mock version checks
    mocker.patch(
        "apps.backend.ollama_model_detector.get_ollama_version", return_value="0.12.0"
    )
    mocker.patch(
        "apps.backend.ollama_model_detector.get_model_min_version", return_value=None
    )

    # Mock urllib.request.urlopen with an error in the stream
    mock_response = io.BytesIO(
        b'{"status": "pulling manifest"}\n{"error": "model not found"}\n'
    )
    mocker.patch("urllib.request.urlopen", return_value=mock_response)

    # Mock argparse.Namespace
    args = mocker.Mock()
    args.model = "non-existent-model"
    args.base_url = "http://localhost:11434"

    # Capture stdout
    stdout = io.StringIO()
    mocker.patch.object(sys, "stdout", stdout)

    with pytest.raises(SystemExit):
        cmd_pull_model(args)

    # Verify error JSON in stdout
    result = json.loads(stdout.getvalue())
    assert result["success"] is False
    assert "model not found" in result["error"]
