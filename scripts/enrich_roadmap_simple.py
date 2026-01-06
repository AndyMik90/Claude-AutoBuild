#!/usr/bin/env python3
"""
Simple standalone script to enrich existing roadmap.json with reverse dependencies.

This version doesn't require backend modules - just pure Python + JSON.

Usage:
    python scripts/enrich_roadmap_simple.py [path/to/roadmap.json]
"""

import json
import sys
from pathlib import Path


def enrich_roadmap(roadmap_path: Path):
    """Enrich roadmap with reverse dependencies."""
    print(f"📊 Enriching roadmap: {roadmap_path}")

    # Read roadmap
    with open(roadmap_path) as f:
        roadmap_data = json.load(f)

    # Extract features
    features_data = roadmap_data.get("features", [])
    print(f"   Found {len(features_data)} features")

    # Build reverse dependencies map
    reverse_deps_map = {f["id"]: [] for f in features_data}

    # For each feature, check its dependencies and add reverse mapping
    for feature in features_data:
        feature_id = feature.get("id")
        dependencies = feature.get("dependencies", [])

        for dep_id in dependencies:
            if dep_id in reverse_deps_map:
                reverse_deps_map[dep_id].append(feature_id)
                print(f"   ✓ {dep_id} ← {feature_id}")

    # Enrich each feature with reverse dependencies
    enriched_count = 0
    for feature in features_data:
        feature_id = feature.get("id")
        reverse_deps = reverse_deps_map.get(feature_id, [])

        # Only update if there are reverse dependencies
        if reverse_deps:
            feature["reverseDependencies"] = reverse_deps
            enriched_count += 1
        else:
            feature["reverseDependencies"] = []

    # Update roadmap
    roadmap_data["features"] = features_data

    # Write back
    with open(roadmap_path, "w") as f:
        json.dump(roadmap_data, f, indent=2)

    print(f"\n✅ Successfully enriched {enriched_count} features!")
    print(f"   Updated: {roadmap_path}")
    return True


if __name__ == "__main__":
    # Get roadmap path from args or use default
    if len(sys.argv) > 1:
        roadmap_path = Path(sys.argv[1])
    else:
        # Default to InteleBro project
        roadmap_path = Path(
            "/Users/mis-puragroup/development/riset/InteleBro/.auto-claude/roadmap/roadmap.json"
        )

    if not roadmap_path.exists():
        print(f"❌ Roadmap file not found: {roadmap_path}")
        sys.exit(1)

    try:
        enrich_roadmap(roadmap_path)
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
