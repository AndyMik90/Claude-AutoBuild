import pytest
import json
import time
from pathlib import Path
from security.profile import get_security_profile, reset_profile_cache
from project.models import SecurityProfile

@pytest.fixture
def mock_project_dir(tmp_path):
    project_dir = tmp_path / "project"
    project_dir.mkdir()
    (project_dir / ".auto-claude").mkdir()
    return project_dir

@pytest.fixture
def mock_profile_path(mock_project_dir):
    return mock_project_dir / ".auto-claude-security.json"

def create_valid_profile_json(commands):
    """Helper to create a valid SecurityProfile JSON structure."""
    return json.dumps({
        "base_commands": commands,
        "stack_commands": [],
        "script_commands": [],
        "custom_commands": [],
        "detected_stack": {
            "languages": [],
            "package_managers": [],
            "frameworks": [],
            "databases": [],
            "infrastructure": [],
            "cloud_providers": [],
            "code_quality_tools": [],
            "version_managers": []
        },
        "custom_scripts": {
            "npm_scripts": [],
            "make_targets": [],
            "poetry_scripts": [],
            "cargo_aliases": [],
            "shell_scripts": []
        },
        "project_dir": "",
        "created_at": "",
        "project_hash": ""
    })

def test_cache_invalidation_on_file_creation(mock_project_dir, mock_profile_path):
    reset_profile_cache()
    
    # 1. First call - file doesn't exist
    profile1 = get_security_profile(mock_project_dir)
    # Default profile depends on what analyze() finds. 
    # Since mock_project_dir is empty, it likely returns default base commands.
    # We just ensure it's not our specific test command.
    assert "unique_cmd_A" not in profile1.get_all_allowed_commands()
    
    # 2. Create the file with valid JSON
    mock_profile_path.write_text(create_valid_profile_json(["unique_cmd_A"]))
    
    # 3. Second call - should detect file creation and reload
    profile2 = get_security_profile(mock_project_dir)
    assert "unique_cmd_A" in profile2.get_all_allowed_commands()

def test_cache_invalidation_on_file_modification(mock_project_dir, mock_profile_path):
    reset_profile_cache()
    
    # 1. Create initial file
    mock_profile_path.write_text(create_valid_profile_json(["unique_cmd_A"]))
    
    # 2. Load initial profile
    profile1 = get_security_profile(mock_project_dir)
    assert "unique_cmd_A" in profile1.get_all_allowed_commands()
    assert "unique_cmd_B" not in profile1.get_all_allowed_commands()

    # Wait to ensure mtime changes (some filesystems have 1s resolution, 
    # but modern OS usuall finer. 0.1s should suffice for tests, 
    # if flaky we can increase or manually touch mtime)
    time.sleep(0.1)
    
    # 3. Modify the file
    mock_profile_path.write_text(create_valid_profile_json(["unique_cmd_B"]))
    
    # 4. Call again - should detect modification
    profile2 = get_security_profile(mock_project_dir)
    assert "unique_cmd_B" in profile2.get_all_allowed_commands()
    # Note: If it merged, unique_cmd_A might still be there depending on logic, 
    # but load_profile replaces the object.
    # However, if it didn't reload, it would definitively NOT have unique_cmd_B.
    
def test_cache_invalidation_on_file_deletion(mock_project_dir, mock_profile_path):
    reset_profile_cache()
    
    # 1. Create file
    mock_profile_path.write_text(create_valid_profile_json(["unique_cmd_A"]))
    
    # 2. Load profile
    profile1 = get_security_profile(mock_project_dir)
    assert "unique_cmd_A" in profile1.get_all_allowed_commands()
    
    # 3. Delete file
    mock_profile_path.unlink()
    
    # 4. Call again - should handle deletion gracefully and fallback to fresh analysis
    profile2 = get_security_profile(mock_project_dir)
    
    # Should be a valid profile object (returned by analyze())
    assert hasattr(profile2, "get_all_allowed_commands")
    # And should NOT have the command from the deleted file
    assert "unique_cmd_A" not in profile2.get_all_allowed_commands() 
