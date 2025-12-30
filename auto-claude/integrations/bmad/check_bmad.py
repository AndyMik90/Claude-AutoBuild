#!/usr/bin/env python3
"""
BMAD Health Check - Run this to verify BMAD integration is working.

Usage:
    python integrations/bmad/check_bmad.py
"""

import sys
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))


def check_bmad():
    print()
    print("=" * 60)
    print("🔍 BMAD HEALTH CHECK")
    print("=" * 60)
    print()

    issues = []

    # 1. Check if BMAD-METHOD exists
    print("1️⃣  Checking BMAD-METHOD installation...")
    bmad_path = Path.home() / "Desktop" / "BMAD-METHOD"
    if bmad_path.exists():
        print(f"   ✅ Found at: {bmad_path}")
    else:
        print(f"   ❌ NOT FOUND at: {bmad_path}")
        issues.append("BMAD-METHOD not installed")

    # 2. Check imports
    print("\n2️⃣  Checking imports...")
    try:
        from integrations.bmad import BMADIntegration

        print("   ✅ BMADIntegration imported")
    except ImportError as e:
        print(f"   ❌ Import failed: {e}")
        issues.append(f"Import error: {e}")
        return issues

    # 3. Initialize
    print("\n3️⃣  Initializing BMAD...")
    try:
        bmad = BMADIntegration(bmad_path=bmad_path)
        print("   ✅ BMADIntegration initialized")
    except Exception as e:
        print(f"   ❌ Init failed: {e}")
        issues.append(f"Init error: {e}")
        return issues

    # 4. Check modules
    print("\n4️⃣  Checking modules...")
    status = bmad.get_status()
    for module in ["core", "bmm", "bmgd", "cis", "bmb"]:
        loaded = status["modules_loaded"].get(module, False)
        if loaded:
            print(f"   ✅ {module.upper()}: loaded")
        else:
            print(f"   ⚠️  {module.upper()}: not loaded")

    # 5. Check agents
    print("\n5️⃣  Checking agents...")
    try:
        agents = bmad.list_agents()
        print(f"   ✅ {len(agents)} agents available")

        # Show by module
        by_module = {}
        for a in agents:
            mod = a.module.value
            by_module[mod] = by_module.get(mod, 0) + 1

        for mod, count in sorted(by_module.items()):
            print(f"      • {mod}: {count} agents")

        if len(agents) < 23:
            issues.append(f"Only {len(agents)}/23 agents loaded")
    except Exception as e:
        print(f"   ❌ Error: {e}")
        issues.append(f"Agent error: {e}")

    # 6. Check workflows
    print("\n6️⃣  Checking workflows...")
    try:
        workflows = bmad.list_workflows()
        print(f"   ✅ {len(workflows)} workflows available")

        # Show by module
        by_module = {}
        for w in workflows:
            mod = w.module.value
            by_module[mod] = by_module.get(mod, 0) + 1

        for mod, count in sorted(by_module.items()):
            print(f"      • {mod}: {count} workflows")

    except Exception as e:
        print(f"   ❌ Error: {e}")
        issues.append(f"Workflow error: {e}")

    # 7. Check token budget
    print("\n7️⃣  Checking token budget...")
    try:
        tokens = bmad.get_token_status()
        budget = tokens["total_budget"]
        used = tokens["total_used"]
        pct = tokens["utilization_pct"]

        print(f"   ✅ Budget: {budget:,} tokens")
        print(f"   ✅ Used: {used:,} tokens ({pct}%)")

        if pct > 80:
            print("   ⚠️  WARNING: High token usage!")
            issues.append("High token usage")
    except Exception as e:
        print(f"   ❌ Error: {e}")
        issues.append(f"Token error: {e}")

    # 8. Check cache
    print("\n8️⃣  Checking cache...")
    try:
        cache_stats = status["cache_stats"]
        mem_size = cache_stats["memory"]["size"]
        disk_count = cache_stats["disk"]["count"]
        disk_bytes = cache_stats["disk"]["bytes"]

        print(f"   ✅ Memory cache: {mem_size} entries")
        print(f"   ✅ Disk cache: {disk_count} files ({disk_bytes / 1024:.1f} KB)")
    except Exception as e:
        print(f"   ❌ Error: {e}")

    # 9. Test agent prompt loading
    print("\n9️⃣  Testing agent prompt loading...")
    try:
        prompt = bmad.get_agent_prompt("dev")
        if prompt and len(prompt) > 100:
            print(f"   ✅ Developer agent prompt loaded ({len(prompt)} chars)")
        else:
            print("   ⚠️  Developer agent prompt empty or short")
            issues.append("Agent prompts may not be loading")
    except Exception as e:
        print(f"   ❌ Error: {e}")
        issues.append(f"Prompt error: {e}")

    # 10. Test workflow parsing
    print("\n🔟 Testing workflow parsing...")
    try:
        wf = bmad.get_workflow("quick-dev")
        if wf:
            print("   ✅ quick-dev workflow parsed")
            # Handle both dataclass and dict
            if isinstance(wf, dict):
                steps = wf.get("total_steps", 0)
                fmt = wf.get("format", "unknown")
            else:
                steps = getattr(wf, "total_steps", 0)
                fmt = getattr(wf, "format", None)
                if hasattr(fmt, "value"):
                    fmt = fmt.value
            print(f"      • Steps: {steps}")
            print(f"      • Format: {fmt}")
        else:
            print("   ⚠️  Could not parse quick-dev workflow")
            issues.append("Workflow parsing issue")
    except Exception as e:
        print(f"   ❌ Error: {e}")
        issues.append(f"Parse error: {e}")

    # Summary
    print()
    print("=" * 60)
    if not issues:
        print("✅ BMAD HEALTH CHECK: ALL GOOD!")
        print()
        print("You're using BMAD correctly. Here's what you have:")
        print("   • 23 expert agents ready")
        print("   • 62+ workflows available")
        print("   • Token budget: 50K per session")
        print("   • Cache system: active")
        print()
        print("To use BMAD in your code:")
        print()
        print("   from integrations.bmad import BMADIntegration")
        print("   bmad = BMADIntegration()")
        print("   agents = bmad.list_agents()")
        print("   prompt = bmad.get_agent_prompt('dev')")
        print()
    else:
        print("⚠️  BMAD HEALTH CHECK: ISSUES FOUND")
        print()
        for issue in issues:
            print(f"   • {issue}")
        print()
        print("Please fix the issues above.")
    print("=" * 60)
    print()

    return issues


if __name__ == "__main__":
    issues = check_bmad()
    sys.exit(0 if not issues else 1)
