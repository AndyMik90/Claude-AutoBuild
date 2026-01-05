"""
Spec-Kit CLI Commands
=====================

CLI commands for spec-kit integration with Auto-Claude.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Optional

from .config import SpecKitConfig
from .converter import SpecKitConverter
from .organization import SpecOrganization


def add_speckit_args(parser: argparse.ArgumentParser) -> None:
    """Add spec-kit related arguments to the argument parser."""
    speckit_group = parser.add_argument_group("Spec-Kit Integration")

    speckit_group.add_argument(
        "--speckit",
        action="store_true",
        help="Enable spec-kit mode for spec creation",
    )

    speckit_group.add_argument(
        "--speckit-dir",
        type=Path,
        help="Path to spec-kit spec directory to import",
    )

    speckit_group.add_argument(
        "--speckit-id",
        type=int,
        help="Spec-kit spec ID to import (e.g., 101 for Find Answers)",
    )

    speckit_group.add_argument(
        "--speckit-domain",
        type=str,
        choices=["platform", "research", "compliance", "change", "governance", "publishing", "acquisition"],
        help="Domain for new spec-kit spec",
    )

    speckit_group.add_argument(
        "--speckit-list",
        action="store_true",
        help="List all discovered spec-kit specs",
    )

    speckit_group.add_argument(
        "--speckit-convert",
        action="store_true",
        help="Convert spec-kit spec to Auto-Claude format without running build",
    )


def handle_speckit_commands(args: argparse.Namespace, project_dir: Path) -> Optional[Path]:
    """
    Handle spec-kit related CLI commands.

    Returns:
        Path to spec directory if a spec was loaded/created, None otherwise.
    """
    config = SpecKitConfig.from_file(project_dir / ".speckit.json")
    org = SpecOrganization(project_dir, config)

    # Handle --speckit-list
    if getattr(args, "speckit_list", False):
        org.discover_specs()
        print(org.print_summary())
        sys.exit(0)

    # Handle --speckit-id (import by ID)
    if getattr(args, "speckit_id", None):
        spec_info = org.get_spec(args.speckit_id)
        if not spec_info:
            print(f"Error: Spec ID {args.speckit_id} not found")
            print("Use --speckit-list to see available specs")
            sys.exit(1)

        spec_dir = spec_info.path
        print(f"Found spec: {spec_info.name} ({spec_info.domain})")

    # Handle --speckit-dir (import by path)
    elif getattr(args, "speckit_dir", None):
        spec_dir = args.speckit_dir
        if not spec_dir.exists():
            print(f"Error: Spec directory not found: {spec_dir}")
            sys.exit(1)

    # Handle --speckit mode (interactive selection)
    elif getattr(args, "speckit", False):
        org.discover_specs()

        # List specs and prompt for selection
        print("\n📚 Available Spec-Kit Specs\n")
        print(org.print_summary())

        print("\nOptions:")
        print("  1. Enter spec ID (e.g., 101)")
        print("  2. Enter spec path")
        print("  3. Create new spec")
        print()

        choice = input("Selection: ").strip()

        if choice.isdigit():
            spec_id = int(choice)
            spec_info = org.get_spec(spec_id)
            if not spec_info:
                print(f"Error: Spec ID {spec_id} not found")
                sys.exit(1)
            spec_dir = spec_info.path
        elif Path(choice).exists():
            spec_dir = Path(choice)
        else:
            # Create new spec
            return _handle_new_spec(args, project_dir, org)

    else:
        return None

    # Convert spec-kit spec to Auto-Claude format
    converter = SpecKitConverter(config)
    speckit_spec = converter.load_speckit_spec(spec_dir)
    auto_claude_spec = converter.convert_to_auto_claude(speckit_spec)

    # Determine output directory
    auto_claude_dir = project_dir / config.output_dir
    spec_name = org.get_auto_claude_spec_name(
        org.get_spec(int(speckit_spec.spec_id)) or speckit_spec
    )
    output_dir = auto_claude_dir / spec_name

    # Write files
    converter.write_auto_claude_spec(auto_claude_spec, output_dir)

    print(f"\n✅ Converted spec-kit spec to Auto-Claude format")
    print(f"   Source: {spec_dir}")
    print(f"   Output: {output_dir}")
    print()

    # If --speckit-convert, just convert and exit
    if getattr(args, "speckit_convert", False):
        print("Spec converted. Run without --speckit-convert to start build.")
        sys.exit(0)

    return output_dir


def _handle_new_spec(
    args: argparse.Namespace,
    project_dir: Path,
    org: SpecOrganization,
) -> Path:
    """Handle creation of a new spec-kit spec."""
    print("\n📝 Create New Spec-Kit Spec\n")

    # Get domain
    domain = getattr(args, "speckit_domain", None)
    if not domain:
        print("Available domains:")
        print("  1. platform    - Infrastructure specs (001-099)")
        print("  2. research    - Research applets (101-199)")
        print("  3. compliance  - Compliance applets (201-299)")
        print("  4. change      - Change applets (301-399)")
        print("  5. governance  - Governance applets (401-499)")
        print("  6. publishing  - Publishing applets (501-599)")
        print("  7. acquisition - Acquisition applets (601-699)")
        print()
        domain_choice = input("Select domain (name or number): ").strip()

        domain_map = {
            "1": "platform",
            "2": "research",
            "3": "compliance",
            "4": "change",
            "5": "governance",
            "6": "publishing",
            "7": "acquisition",
        }
        domain = domain_map.get(domain_choice, domain_choice)

    # Get spec name
    name = input("Spec name: ").strip()
    if not name:
        print("Error: Spec name required")
        sys.exit(1)

    # Create spec directory
    try:
        spec_path = org.create_spec_directory(name, domain)
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)

    # Create template spec.md
    template = f"""# Specification: {name}

## Overview

[Describe what this spec covers and why it's needed]

## Workflow Type

**Type**: feature

**Rationale**: [Why this workflow type]

## Task Scope

### Services Involved
- **backend** (primary) - [role]

### This Task Will:
- [ ] [Specific change 1]
- [ ] [Specific change 2]

### Out of Scope:
- [What this does NOT include]

## Requirements

### Functional Requirements

1. **[Requirement Name]**
   - Description: [What it does]
   - Acceptance: [How to verify]

## Success Criteria

The task is complete when:

1. [ ] [Criterion 1]
2. [ ] [Criterion 2]
3. [ ] No console errors
4. [ ] Existing tests pass
"""

    (spec_path / "spec.md").write_text(template)

    print(f"\n✅ Created new spec: {spec_path}")
    print(f"   Edit {spec_path / 'spec.md'} to define your specification")
    print()

    return spec_path


def main():
    """Standalone CLI for spec-kit operations."""
    parser = argparse.ArgumentParser(
        description="Spec-Kit Integration CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument(
        "--project-dir",
        type=Path,
        default=Path.cwd(),
        help="Project directory (default: current directory)",
    )

    add_speckit_args(parser)

    args = parser.parse_args()

    # Default to --speckit-list if no specific action
    if not any([
        getattr(args, "speckit_list", False),
        getattr(args, "speckit_dir", None),
        getattr(args, "speckit_id", None),
        getattr(args, "speckit", False),
    ]):
        args.speckit_list = True

    handle_speckit_commands(args, args.project_dir)


if __name__ == "__main__":
    main()
