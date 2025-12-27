import pytest
from pathlib import Path
from unittest.mock import Mock, patch
from security.profile import get_security_profile, reset_profile_cache, _get_profile_mtime, SecurityProfile
from security.profile import _cached_profile, _cached_project_dir, _cached_profile_mtime

@pytest.fixture
def mock_project_dir(tmp_path):
    return tmp_path / "project"

@pytest.fixture
def mock_profile_path(mock_project_dir):
    return mock_project_dir / ".auto-claude" / "security_profile.json"

def test_cache_invalidation_on_file_creation(mock_project_dir, mock_profile_path):
    reset_profile_cache()
    mock_project_dir.mkdir()
    (mock_project_dir / ".auto-claude").mkdir()
    
    # 1. First call - file doesn't exist
    # It falls back to analyze(), which we assume returns a default profile
    # We can mock analyze too if needed, but let's assume default doesn't have our command
    profile1 = get_security_profile(mock_project_dir)
    assert "unique_cmd_A" not in profile1.get_all_allowed_commands()
    
    # 2. Create the file (to update mtime/existence)
    mock_profile_path.write_text('{}')
    
    # 3. Second call - should detect file creation and reload via load_profile
    with patch('project.analyzer.load_profile') as mock_load:
        # Mock load_profile to return a profile with our command
        mock_load.return_value = SecurityProfile(base_commands={"unique_cmd_A"})
        
        profile2 = get_security_profile(mock_project_dir)
        
        # Verify load_profile was called
        mock_load.assert_called_once()
        # Verify returned profile has our command
        assert "unique_cmd_A" in profile2.get_all_allowed_commands()

def test_cache_invalidation_on_file_modification(mock_project_dir, mock_profile_path):
    reset_profile_cache()
    mock_project_dir.mkdir()
    (mock_project_dir / ".auto-claude").mkdir()
    mock_profile_path.write_text('{}')
    
    # 1. Load initial profile - mock load_profile to return A
    with patch('project.analyzer.load_profile') as mock_load_1:
        mock_load_1.return_value = SecurityProfile(base_commands={"unique_cmd_A"})
        profile1 = get_security_profile(mock_project_dir)
        assert "unique_cmd_A" in profile1.get_all_allowed_commands()
        assert "unique_cmd_B" not in profile1.get_all_allowed_commands()

    # Wait a tiny bit or force mtime update
    import time
    time.sleep(0.01)
    
    # 2. Modify the file (update mtime)
    mock_profile_path.write_text('{"modified": true}')
    
    # 3. Call again - should detect modification
    with patch('project.analyzer.load_profile') as mock_load_2:
        mock_load_2.return_value = SecurityProfile(base_commands={"unique_cmd_B"})
        
        profile2 = get_security_profile(mock_project_dir)
        
        mock_load_2.assert_called_once()
        assert "unique_cmd_B" in profile2.get_all_allowed_commands()

def test_cache_invalidation_on_file_deletion(mock_project_dir, mock_profile_path):
    reset_profile_cache()
    mock_project_dir.mkdir()
    (mock_project_dir / ".auto-claude").mkdir()
    mock_profile_path.write_text('{}')
    
    # 1. Load profile
    with patch('project.analyzer.load_profile') as mock_load:
        mock_load.return_value = SecurityProfile(base_commands={"unique_cmd_A"})
        profile1 = get_security_profile(mock_project_dir)
        assert "unique_cmd_A" in profile1.get_all_allowed_commands()
    
    # 2. Delete file
    mock_profile_path.unlink()
    
    # 3. Call again - should handle deletion gracefully and fallback to analyze (or just not crash)
    # Since file is gone, load_profile won't be called. analyze() will be called.
    # We assume analyze() returns a standard profile without "unique_cmd_A" for this test context
    # unless we mock analyze too.
    with patch('project.analyzer.analyze') as mock_analyze:
        mock_analyze.return_value = SecurityProfile(base_commands={"unique_cmd_fallback"})
        
        profile2 = get_security_profile(mock_project_dir)
        
        mock_analyze.assert_called_once()
        assert hasattr(profile2, "get_all_allowed_commands")
        if hasattr(profile2, "base_commands"):
             assert "unique_cmd_fallback" in profile2.base_commands 
