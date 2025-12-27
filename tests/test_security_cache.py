import pytest
from pathlib import Path
from unittest.mock import Mock, patch
from security.profile import get_security_profile, reset_profile_cache, _get_profile_mtime
from security.profile import _cached_profile, _cached_project_dir, _cached_profile_mtime

@pytest.fixture
def mock_project_dir(tmp_path):
    return tmp_path / "project"

@pytest.fixture
def mock_profile_path(mock_project_dir):
    return mock_project_dir / ".auto-claude" / ".auto-claude-security.json"

def test_cache_invalidation_on_file_creation(mock_project_dir, mock_profile_path):
    reset_profile_cache()
    mock_project_dir.mkdir()
    (mock_project_dir / ".auto-claude").mkdir()
    
    # 1. First call - file doesn't exist
    profile1 = get_security_profile(mock_project_dir)
    assert profile1 == {} # Should return empty default
    
    # 2. Create the file
    mock_profile_path.write_text('{"allowed_commands": ["ls"]}')
    
    # 3. Second call - should detect file creation and reload
    profile2 = get_security_profile(mock_project_dir)
    assert "ls" in profile2.get("allowed_commands", [])

def test_cache_invalidation_on_file_modification(mock_project_dir, mock_profile_path):
    reset_profile_cache()
    mock_project_dir.mkdir()
    (mock_project_dir / ".auto-claude").mkdir()
    mock_profile_path.write_text('{"allowed_commands": ["ls"]}')
    
    # 1. Load initial profile
    profile1 = get_security_profile(mock_project_dir)
    assert "ls" in profile1["allowed_commands"]
    assert "git" not in profile1.get("allowed_commands", [])

    # Wait a tiny bit or force mtime update (pathlib writes should update mtime)
    
    # 2. Modify the file
    mock_profile_path.write_text('{"allowed_commands": ["git"]}')
    
    # 3. Call again - should detect modification
    profile2 = get_security_profile(mock_project_dir)
    assert "git" in profile2["allowed_commands"]

def test_cache_invalidation_on_file_deletion(mock_project_dir, mock_profile_path):
    reset_profile_cache()
    mock_project_dir.mkdir()
    (mock_project_dir / ".auto-claude").mkdir()
    mock_profile_path.write_text('{"allowed_commands": ["ls"]}')
    
    # 1. Load profile
    profile1 = get_security_profile(mock_project_dir)
    assert "ls" in profile1["allowed_commands"]
    
    # 2. Delete file
    mock_profile_path.unlink()
    
    # 3. Call again - should handle deletion gracefully and return empty/default
    profile2 = get_security_profile(mock_project_dir)
    assert profile2 == {} 
