import pytest
from apps.backend.ollama_model_detector import parse_version, version_gte, is_embedding_model, get_embedding_dim

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
    from apps.backend.ollama_model_detector import get_default_ollama_url
    
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

def test_cmd_check_installed(mocker):
    from apps.backend.ollama_model_detector import cmd_check_installed
    import json
    import io
    import sys
    
    # Mock shutil.which to find ollama
    mocker.patch("shutil.which", return_value="/usr/local/bin/ollama")
    
    # Capture stdout
    stdout = io.StringIO()
    mocker.patch.object(sys, "stdout", stdout)
    
    with pytest.raises(SystemExit):
        cmd_check_installed(None)
    
    result = json.loads(stdout.getvalue())
    assert result["success"] is True
    assert result["data"]["installed"] is True
    assert result["data"]["path"] == "/usr/local/bin/ollama"
    
    # Mock shutil.which to not find ollama
    mocker.patch("shutil.which", return_value=None)
    
    stdout = io.StringIO()
    mocker.patch.object(sys, "stdout", stdout)
    
    with pytest.raises(SystemExit):
        cmd_check_installed(None)
    
    result = json.loads(stdout.getvalue())
    assert result["success"] is True
    assert result["data"]["installed"] is False
