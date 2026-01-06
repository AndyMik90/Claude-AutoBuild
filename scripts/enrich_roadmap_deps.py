#!/usr/bin/env python3
"""
Manual script to enrich existing roadmap.json with reverse dependencies
and validation metadata without re-generating the entire roadmap.

Usage:
    cd apps/backend
    python ../../scripts/enrich_roadmap_deps.py [path/to/roadmap.json]
"""

import os
import json
from pathlib import Path
import sys

# Change to backend directory first
backend_dir = Path(__file__).parent.parent / "apps" / "backend"
os.chdir(backend_dir)
sys.path.insert(0, str(backend_dir))

from runners.roadmap.validators import DependencyValidator
from runners.roadmap.models import RoadmapFeature


def enrich_roadmap(roadmap_path: Path):
    """Enrich roadmap with reverse dependencies and validation metadata."""
    print(f"📊 Enriching roadmap: {roadmap_path}")

    # Read roadmap
    with open(roadmap_path) as f:
        roadmap_data = json.load(f)

    # Extract features
    features_data = roadmap_data.get("features", [])
    print(f"   Found {len(features_data)} features")

    # Convert to RoadmapFeature objects
    features = []
    for feat_dict in features_data:
        feature = RoadmapFeature(
            id=feat_dict.get("id"),
            title=feat_dict.get("title"),
            description=feat_dict.get("description"),
            dependencies=feat_dict.get("dependencies", []),
            status=feat_dict.get("status", "planned"),
        )
        features.append(feature)

    # Run validator
    print("\n🔍 Running dependency validator...")
    validator = DependencyValidator()
    validation_result = validator.validate_all(features)

    print(f"   Missing dependencies: {validation_result.has_missing}")
    print(f"   Circular dependencies: {validation_result.has_circular}")
    print(f"   Features with reverse deps: {len(validation_result.reverse_deps_map)}")

    # Build missing_deps_map per feature
    missing_deps_map = {}
    valid_ids = {f.id for f in features}
    for feature in features:
        feature_missing = []
        for dep_id in feature.dependencies:
            if dep_id not in valid_ids:
                feature_missing.append(dep_id)
        if feature_missing:
            missing_deps_map[feature.id] = feature_missing

    # Pre-compute all dependent IDs
    all_dependent_ids = {dep for f in features for dep in f.dependencies}

    # Enrich each feature
    enriched_features = []
    for feature in features:
        # Find original feature dict
        feat_dict = next(
            (f for f in features_data if f.get("id") == feature.id),
            {}
        )

        # Add reverse dependencies
        reverse_deps = validation_result.reverse_deps_map.get(feature.id, [])
        feat_dict["reverseDependencies"] = reverse_deps

        # Add validation metadata for features with dependencies
        if feature.id in all_dependent_ids or len(feature.dependencies) > 0:
            feat_dict["dependencyValidation"] = {
                "hasMissing": len(missing_deps_map.get(feature.id, [])) > 0,
                "hasCircular": any(
                    feature.id in cycle
                    for cycle in validation_result.circular_paths
                ),
                "missingIds": missing_deps_map.get(feature.id, []),
                "circularPaths": [
                    cp for cp in validation_result.circular_paths if feature.id in cp
                ],
            }

        enriched_features.append(feat_dict)

        # Log enrichment
        if len(reverse_deps) > 0:
            print(f"   ✓ {feature.id}: {len(reverse_deps)} reverse dependencies")
        if feature.id in missing_deps_map:
            print(f"   ⚠ {feature.id}: has missing dependencies")

    # Update roadmap
    roadmap_data["features"] = enriched_features

    # Write back
    with open(roadmap_path, "w") as f:
        json.dump(roadmap_data, f, indent=2)

    print(f"\n✅ Successfully enriched roadmap!")
    print(f"   Updated: {roadmap_path}")
    return True


if __name__ == "__main__":
    # Get roadmap path from args or use default
    if len(sys.argv) > 1:
        roadmap_path = Path(sys.argv[1])
    else:
        # Default to InteleBro project
        roadmap_path = Path("/Users/mis-puragroup/development/riset/InteleBro/.auto-claude/roadmap/roadmap.json")

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
