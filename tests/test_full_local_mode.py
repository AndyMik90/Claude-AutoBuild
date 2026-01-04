#!/usr/bin/env python3
"""
Full Local Mode Test Script
============================

Automatically tests Full Local Mode functionality to verify that Ollama models
correctly replace Claude models in all phases.

Usage:
    python test_full_local_mode.py

Requirements:
    pip install requests
"""

import json
import os
import platform
import sys
from pathlib import Path
from typing import List, Tuple

try:
    import requests
except ImportError:
    print("Error: 'requests' library not found. Install with: pip install requests")
    sys.exit(1)

# ANSI color codes (work in Windows Terminal, PowerShell 7+, and Unix terminals)
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'


def print_header(text: str):
    """Print a formatted header"""
    print(f"\n{BLUE}{'=' * 60}{RESET}")
    print(f"{BLUE}{text.center(60)}{RESET}")
    print(f"{BLUE}{'=' * 60}{RESET}\n")


def print_test(name: str):
    """Print test name"""
    print(f"{YELLOW}🧪 Testing: {name}{RESET}")


def print_success(message: str):
    """Print success message"""
    print(f"{GREEN}✅ {message}{RESET}")


def print_error(message: str):
    """Print error message"""
    print(f"{RED}❌ {message}{RESET}")


def print_info(message: str):
    """Print info message"""
    print(f"{BLUE}ℹ️  {message}{RESET}")


class FullLocalModeTester:
    """Test suite for Full Local Mode"""
    
    def __init__(self):
        self.results: List[Tuple[str, bool, str]] = []
        # Windows: %APPDATA%\auto-claude, Linux/Mac: ~/.config/auto-claude
        if platform.system() == 'Windows' or os.name == 'nt':
            # Try APPDATA first, fallback to LOCALAPPDATA
            appdata = os.environ.get('APPDATA') or os.environ.get('LOCALAPPDATA')
            if appdata:
                self.config_dir = Path(appdata) / "auto-claude"
            else:
                # Fallback to user profile
                self.config_dir = Path.home() / "AppData" / "Roaming" / "auto-claude"
        else:  # Linux/Mac
            self.config_dir = Path.home() / ".config" / "auto-claude"
        self.settings_file = self.config_dir / "settings.json"
        
    def run_all_tests(self):
        """Run all test scenarios"""
        print_header("Full Local Mode Test Suite")
        
        print_info(f"Platform: {platform.system()} ({os.name})")
        print_info(f"Config directory: {self.config_dir}")
        print()
        
        # Prerequisites
        self.test_ollama_running()
        self.test_ollama_models()
        
        # Configuration tests
        self.test_settings_file_exists()
        self.test_full_local_mode_config()
        self.test_model_configuration()
        
        # Backend tests
        self.test_phase_config()
        self.test_ollama_client()
        
        # Summary
        return self.print_summary()
        
    def test_ollama_running(self):
        """Test if Ollama is running"""
        print_test("Ollama Service Running")
        
        try:
            response = requests.get("http://localhost:11434/api/tags", timeout=5)
            
            if response.status_code == 200:
                data = response.json()
                model_count = len(data.get("models", []))
                print_success(f"Ollama is running with {model_count} models")
                self.results.append(("Ollama Running", True, f"{model_count} models"))
            else:
                print_error(f"Ollama returned status {response.status_code}")
                self.results.append(("Ollama Running", False, f"Status {response.status_code}"))
        except requests.exceptions.Timeout:
            print_error("Ollama connection timeout")
            self.results.append(("Ollama Running", False, "Timeout"))
        except requests.exceptions.ConnectionError:
            print_error("Cannot connect to Ollama (is it running?)")
            self.results.append(("Ollama Running", False, "Connection refused"))
            if platform.system() == 'Windows':
                print_info("Start Ollama on Windows: Run 'ollama serve' in a terminal")
            else:
                print_info("Start Ollama: sudo systemctl start ollama")
        except Exception as e:
            print_error(f"Error checking Ollama: {e}")
            self.results.append(("Ollama Running", False, str(e)))
    
    def test_ollama_models(self):
        """Test if required Ollama models are installed"""
        print_test("Ollama Models Installed")
        
        recommended_models = [
            "llama3.2:3b",
            "llama3.1:8b",
            "qwen2.5-coder:7b"
        ]
        
        try:
            response = requests.get("http://localhost:11434/api/tags", timeout=5)
            
            if response.status_code == 200:
                data = response.json()
                installed_models = [m["name"] for m in data.get("models", [])]
                
                for model in recommended_models:
                    if any(model in installed for installed in installed_models):
                        print_success(f"Model {model} is installed")
                        self.results.append((f"Model {model}", True, "Installed"))
                    else:
                        print_error(f"Model {model} is NOT installed")
                        self.results.append((f"Model {model}", False, "Not installed"))
                        print_info(f"Install with: ollama pull {model}")
        except Exception as e:
            print_error(f"Error checking models: {e}")
            self.results.append(("Ollama Models", False, str(e)))
    
    def test_settings_file_exists(self):
        """Test if settings file exists"""
        print_test("Settings File Exists")
        
        if self.settings_file.exists():
            print_success(f"Settings file found: {self.settings_file}")
            self.results.append(("Settings File", True, "Exists"))
        else:
            print_error(f"Settings file not found: {self.settings_file}")
            self.results.append(("Settings File", False, "Not found"))
            print_info("Run Auto-Claude at least once to create settings file")
    
    def test_full_local_mode_config(self):
        """Test Full Local Mode configuration"""
        print_test("Full Local Mode Configuration")
        
        if not self.settings_file.exists():
            print_error("Settings file not found")
            self.results.append(("Full Local Mode Config", False, "No settings file"))
            return
        
        try:
            with open(self.settings_file, 'r', encoding='utf-8') as f:
                settings = json.load(f)
            
            full_local_mode = settings.get("fullLocalMode", False)
            
            if full_local_mode:
                print_success("Full Local Mode is ENABLED")
                self.results.append(("Full Local Mode", True, "Enabled"))
                
                # Check auto-select
                auto_select = settings.get("localModelAutoSelect", False)
                if auto_select:
                    print_info("Using Smart Auto-Select")
                else:
                    print_info("Using Manual Configuration")
                    
            else:
                print_error("Full Local Mode is DISABLED")
                self.results.append(("Full Local Mode", False, "Disabled"))
                print_info("Enable in: Settings → AI Provider → Full Local Mode")
        except Exception as e:
            print_error(f"Error reading settings: {e}")
            self.results.append(("Full Local Mode Config", False, str(e)))
    
    def test_model_configuration(self):
        """Test model configuration"""
        print_test("Model Configuration")
        
        if not self.settings_file.exists():
            return
        
        try:
            with open(self.settings_file, 'r', encoding='utf-8') as f:
                settings = json.load(f)
            
            # Check agent profile models
            agent_profile = settings.get("agentProfile", {})
            phase_models = agent_profile.get("phaseModels", {})
            
            ollama_count = 0
            claude_count = 0
            
            for phase, model in phase_models.items():
                if model.startswith("ollama:"):
                    ollama_count += 1
                    print_success(f"Phase '{phase}' uses Ollama: {model}")
                else:
                    claude_count += 1
                    print_error(f"Phase '{phase}' uses Claude: {model}")
            
            if ollama_count > 0 and claude_count == 0:
                self.results.append(("Model Config", True, f"{ollama_count} Ollama models"))
            elif claude_count > 0:
                self.results.append(("Model Config", False, f"{claude_count} Claude models found"))
            else:
                self.results.append(("Model Config", False, "No models configured"))
                
            # Check feature models
            feature_models = settings.get("featureModels", {})
            for feature, model in feature_models.items():
                if model.startswith("ollama:"):
                    print_success(f"Feature '{feature}' uses Ollama: {model}")
                else:
                    print_error(f"Feature '{feature}' uses Claude: {model}")
                    
        except Exception as e:
            print_error(f"Error checking models: {e}")
            self.results.append(("Model Config", False, str(e)))
    
    def test_phase_config(self):
        """Test backend phase_config.py"""
        print_test("Backend Phase Configuration")
        
        try:
            # Try to import phase_config
            backend_path = Path.cwd() / "apps" / "backend"
            if not backend_path.exists():
                # Try parent directory (if running from tests/)
                backend_path = Path.cwd().parent / "apps" / "backend"
            
            if not backend_path.exists():
                print_error(f"Backend path not found: {backend_path}")
                self.results.append(("Phase Config", False, "Backend not found"))
                return
            
            sys.path.insert(0, str(backend_path))
            
            from phase_config import (
                is_ollama_model,
                get_ollama_model_name,
                resolve_model_id,
            )
            
            # Test is_ollama_model
            test_model = "ollama:llama3.1:8b"
            if is_ollama_model(test_model):
                print_success(f"is_ollama_model() correctly identifies: {test_model}")
                self.results.append(("is_ollama_model", True, "Works"))
            else:
                print_error(f"is_ollama_model() failed for: {test_model}")
                self.results.append(("is_ollama_model", False, "Failed"))
            
            # Test get_ollama_model_name
            model_name = get_ollama_model_name(test_model)
            if model_name == "llama3.1:8b":
                print_success(f"get_ollama_model_name() returns: {model_name}")
                self.results.append(("get_ollama_model_name", True, "Works"))
            else:
                print_error(f"get_ollama_model_name() returned: {model_name}")
                self.results.append(("get_ollama_model_name", False, f"Got {model_name}"))
            
            # Test resolve_model_id
            resolved = resolve_model_id(test_model)
            if resolved == test_model:
                print_success(f"resolve_model_id() preserves ollama: prefix")
                self.results.append(("resolve_model_id", True, "Works"))
            else:
                print_error(f"resolve_model_id() returned: {resolved}")
                self.results.append(("resolve_model_id", False, f"Got {resolved}"))
                
        except ImportError as e:
            print_error(f"Could not import phase_config: {e}")
            self.results.append(("Phase Config", False, "Import failed"))
            print_info("Make sure you're running this from the Auto-Claude root directory")
        except Exception as e:
            print_error(f"Error testing phase_config: {e}")
            self.results.append(("Phase Config", False, str(e)))
    
    def test_ollama_client(self):
        """Test Ollama client"""
        print_test("Ollama Client")
        
        try:
            backend_path = Path.cwd() / "apps" / "backend"
            if not backend_path.exists():
                backend_path = Path.cwd().parent / "apps" / "backend"
            
            sys.path.insert(0, str(backend_path))
            
            from core.ollama_client import OllamaClient
            
            print_success("OllamaClient can be imported")
            self.results.append(("Ollama Client Import", True, "Success"))
            
            # Try to create client
            client = OllamaClient()
            print_success("OllamaClient instance created")
            self.results.append(("Ollama Client Create", True, "Success"))
            
        except ImportError as e:
            print_error(f"Could not import OllamaClient: {e}")
            self.results.append(("Ollama Client", False, "Import failed"))
        except Exception as e:
            print_error(f"Error testing OllamaClient: {e}")
            self.results.append(("Ollama Client", False, str(e)))
    
    def print_summary(self):
        """Print test summary"""
        print_header("Test Summary")
        
        total = len(self.results)
        passed = sum(1 for _, success, _ in self.results if success)
        failed = total - passed
        
        print(f"Total Tests: {total}")
        print(f"{GREEN}Passed: {passed}{RESET}")
        print(f"{RED}Failed: {failed}{RESET}")
        print()
        
        if failed > 0:
            print(f"{RED}Failed Tests:{RESET}")
            for name, success, detail in self.results:
                if not success:
                    print(f"  ❌ {name}: {detail}")
        
        print()
        
        if passed == total:
            print(f"{GREEN}🎉 All tests passed! Full Local Mode is ready to use.{RESET}")
            return 0
        else:
            print(f"{RED}⚠️  Some tests failed. Please fix the issues above.{RESET}")
            return 1


def main():
    """Main entry point"""
    tester = FullLocalModeTester()
    exit_code = tester.run_all_tests()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
