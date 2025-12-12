#!/usr/bin/env python3
"""
Test Script for Graphiti Memory Integration V2
==============================================

This script tests the hybrid memory layer (graph + semantic search) to verify
data is being saved and retrieved correctly from FalkorDB.

V2 supports multiple LLM and embedding providers. Set up your preferred provider:

Usage:
    # Set environment variables first (or in .env file):
    export GRAPHITI_ENABLED=true
    export GRAPHITI_LLM_PROVIDER=openai  # or: anthropic, azure_openai, ollama
    export GRAPHITI_EMBEDDER_PROVIDER=openai  # or: voyage, azure_openai, ollama

    # Provider-specific credentials (set based on your chosen providers):
    # OpenAI:
    export OPENAI_API_KEY=sk-...

    # Anthropic (LLM only, needs separate embedder):
    export ANTHROPIC_API_KEY=sk-ant-...

    # Voyage AI (embeddings only):
    export VOYAGE_API_KEY=...

    # Azure OpenAI:
    export AZURE_OPENAI_API_KEY=...
    export AZURE_OPENAI_BASE_URL=https://...
    export AZURE_OPENAI_LLM_DEPLOYMENT=gpt-5
    export AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small

    # Ollama (local):
    export OLLAMA_LLM_MODEL=deepseek-r1:7b
    export OLLAMA_EMBEDDING_MODEL=nomic-embed-text
    export OLLAMA_EMBEDDING_DIM=768

    # FalkorDB (optional - uses defaults localhost:6380):
    export GRAPHITI_FALKORDB_HOST=localhost
    export GRAPHITI_FALKORDB_PORT=6380

    # Run the test:
    python auto-claude/test_graphiti_memory.py
"""

import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Add auto-claude to path
sys.path.insert(0, str(Path(__file__).parent))

# Load .env file
from dotenv import load_dotenv
env_file = Path(__file__).parent / ".env"
if env_file.exists():
    load_dotenv(env_file)
    print(f"Loaded .env from {env_file}")

from graphiti_config import (
    GraphitiConfig,
    is_graphiti_enabled,
    get_graphiti_status,
)


def print_header(title: str):
    """Print a section header."""
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60 + "\n")


def print_result(label: str, value: str, success: bool = True):
    """Print a result line."""
    status = "✅" if success else "❌"
    print(f"  {status} {label}: {value}")


async def test_connection():
    """Test basic FalkorDB connection and provider configuration."""
    print_header("1. Testing FalkorDB Connection & Providers")

    config = GraphitiConfig.from_env()

    print(f"  Host: {config.falkordb_host}")
    print(f"  Port: {config.falkordb_port}")
    print(f"  Database: {config.database}")
    print(f"  LLM Provider: {config.llm_provider}")
    print(f"  Embedder Provider: {config.embedder_provider}")
    print()

    try:
        from graphiti_core import Graphiti
        from graphiti_core.driver.falkordb_driver import FalkorDriver
        from graphiti_providers import create_llm_client, create_embedder, ProviderError

        # Test provider creation
        print("  Creating LLM client...")
        try:
            llm_client = create_llm_client(config)
            print_result("LLM Client", f"Created for {config.llm_provider}", True)
        except ProviderError as e:
            print_result("LLM Client", f"FAILED: {e}", False)
            return False

        print("  Creating embedder...")
        try:
            embedder = create_embedder(config)
            print_result("Embedder", f"Created for {config.embedder_provider}", True)
        except ProviderError as e:
            print_result("Embedder", f"FAILED: {e}", False)
            return False

        # Try to connect to FalkorDB
        print("  Connecting to FalkorDB...")
        driver = FalkorDriver(
            host=config.falkordb_host,
            port=config.falkordb_port,
            password=config.falkordb_password or None,
            database=config.database,
        )

        graphiti = Graphiti(
            graph_driver=driver,
            llm_client=llm_client,
            embedder=embedder,
        )

        # Try building indices
        print("  Building indices...")
        await graphiti.build_indices_and_constraints()

        print_result("Connection", "SUCCESS", True)

        await graphiti.close()
        return True

    except Exception as e:
        print_result("Connection", f"FAILED: {e}", False)
        return False


async def test_save_episode():
    """Test saving an episode to the graph."""
    print_header("2. Testing Episode Save")

    config = GraphitiConfig.from_env()

    try:
        from graphiti_core import Graphiti
        from graphiti_core.driver.falkordb_driver import FalkorDriver
        from graphiti_core.nodes import EpisodeType
        from graphiti_providers import create_llm_client, create_embedder

        # Create providers using factory
        llm_client = create_llm_client(config)
        embedder = create_embedder(config)

        # Connect
        driver = FalkorDriver(
            host=config.falkordb_host,
            port=config.falkordb_port,
            password=config.falkordb_password or None,
            database=config.database,
        )

        graphiti = Graphiti(
            graph_driver=driver,
            llm_client=llm_client,
            embedder=embedder,
        )
        await graphiti.build_indices_and_constraints()
        
        # Create test episode
        test_data = {
            "type": "test_episode",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "test_field": "Hello from test script!",
            "test_number": 42,
            "test_list": ["item1", "item2", "item3"],
        }
        
        episode_name = f"test_episode_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        group_id = "graphiti_test_group"
        
        print(f"  Episode name: {episode_name}")
        print(f"  Group ID: {group_id}")
        print(f"  Data: {json.dumps(test_data, indent=4)}")
        print()
        
        # Save the episode
        print("  Saving episode...")
        await graphiti.add_episode(
            name=episode_name,
            episode_body=json.dumps(test_data),
            source=EpisodeType.text,
            source_description="Test episode from test_graphiti_memory.py",
            reference_time=datetime.now(timezone.utc),
            group_id=group_id,
        )
        
        print_result("Episode Save", "SUCCESS", True)
        
        await graphiti.close()
        return episode_name, group_id
        
    except Exception as e:
        print_result("Episode Save", f"FAILED: {e}", False)
        import traceback
        traceback.print_exc()
        return None, None


async def test_search(group_id: str):
    """Test semantic search."""
    print_header("3. Testing Semantic Search")

    if not group_id:
        print("  ⚠️  Skipping - no group_id from previous test")
        return

    config = GraphitiConfig.from_env()

    try:
        from graphiti_core import Graphiti
        from graphiti_core.driver.falkordb_driver import FalkorDriver
        from graphiti_providers import create_llm_client, create_embedder

        # Create providers using factory
        llm_client = create_llm_client(config)
        embedder = create_embedder(config)

        # Connect
        driver = FalkorDriver(
            host=config.falkordb_host,
            port=config.falkordb_port,
            password=config.falkordb_password or None,
            database=config.database,
        )

        graphiti = Graphiti(
            graph_driver=driver,
            llm_client=llm_client,
            embedder=embedder,
        )
        
        # Search for the test data
        query = "test episode hello"
        print(f"  Query: \"{query}\"")
        print(f"  Group ID: {group_id}")
        print()
        
        print("  Searching...")
        results = await graphiti.search(
            query=query,
            group_ids=[group_id],
            num_results=10,
        )
        
        print(f"  Found {len(results)} results:")
        for i, result in enumerate(results):
            print(f"\n  Result {i+1}:")
            # Print available attributes
            for attr in ['fact', 'content', 'uuid', 'name', 'score']:
                if hasattr(result, attr):
                    val = getattr(result, attr)
                    if val:
                        print(f"    {attr}: {str(val)[:100]}...")
        
        if results:
            print_result("Search", f"SUCCESS - Found {len(results)} results", True)
        else:
            print_result("Search", "WARNING - No results found", False)
        
        await graphiti.close()
        
    except Exception as e:
        print_result("Search", f"FAILED: {e}", False)
        import traceback
        traceback.print_exc()


async def test_graphiti_memory_class():
    """Test the GraphitiMemory wrapper class."""
    print_header("4. Testing GraphitiMemory Class")
    
    try:
        from graphiti_memory import GraphitiMemory
        
        # Create a temporary spec directory for testing
        test_spec_dir = Path("/tmp/graphiti_test_spec")
        test_spec_dir.mkdir(parents=True, exist_ok=True)
        
        test_project_dir = Path("/tmp/graphiti_test_project")
        test_project_dir.mkdir(parents=True, exist_ok=True)
        
        print(f"  Spec dir: {test_spec_dir}")
        print(f"  Project dir: {test_project_dir}")
        print()
        
        # Create memory instance
        memory = GraphitiMemory(test_spec_dir, test_project_dir)
        
        print(f"  Is enabled: {memory.is_enabled}")
        print(f"  Group ID: {memory.group_id}")
        print()
        
        if not memory.is_enabled:
            print_result("GraphitiMemory", "Graphiti not enabled/configured", False)
            return
        
        # Initialize
        print("  Initializing...")
        init_result = await memory.initialize()
        print(f"  Initialized: {init_result}")
        
        if not init_result:
            print_result("GraphitiMemory Init", "Failed to initialize", False)
            return
        
        # Test save_session_insights
        print("\n  Testing save_session_insights...")
        insights = {
            "chunks_completed": ["chunk-test-1", "chunk-test-2"],
            "discoveries": {
                "files_understood": {"test.py": "Test file purpose"},
                "patterns_found": ["Pattern: Using async/await"],
                "gotchas_encountered": ["Gotcha: Need to handle edge case"],
            },
            "what_worked": ["Using the GraphitiMemory class"],
            "what_failed": [],
            "recommendations_for_next_session": ["Continue testing"],
        }
        
        save_result = await memory.save_session_insights(session_num=1, insights=insights)
        print_result("save_session_insights", "SUCCESS" if save_result else "FAILED", save_result)
        
        # Test save_pattern
        print("\n  Testing save_pattern...")
        pattern_result = await memory.save_pattern("Test pattern: Always validate inputs before processing")
        print_result("save_pattern", "SUCCESS" if pattern_result else "FAILED", pattern_result)
        
        # Test save_gotcha
        print("\n  Testing save_gotcha...")
        gotcha_result = await memory.save_gotcha("Gotcha: FalkorDB requires Redis protocol on port 6380")
        print_result("save_gotcha", "SUCCESS" if gotcha_result else "FAILED", gotcha_result)
        
        # Test save_codebase_discoveries
        print("\n  Testing save_codebase_discoveries...")
        discoveries = {
            "graphiti_memory.py": "Manages graph-based persistent memory",
            "graphiti_config.py": "Configuration for FalkorDB connection",
        }
        discovery_result = await memory.save_codebase_discoveries(discoveries)
        print_result("save_codebase_discoveries", "SUCCESS" if discovery_result else "FAILED", discovery_result)
        
        # Test get_relevant_context (semantic search)
        print("\n  Testing get_relevant_context (waiting for embedding processing)...")
        await asyncio.sleep(2)  # Give time for embeddings
        
        context = await memory.get_relevant_context("graphiti memory session insights")
        print(f"  Found {len(context)} context items:")
        for item in context[:3]:
            print(f"    - Type: {item.get('type', 'unknown')}")
            print(f"      Content: {str(item.get('content', ''))[:80]}...")
        
        print_result("get_relevant_context", f"Found {len(context)} items", len(context) > 0)
        
        # Get status summary
        print("\n  Status summary:")
        status = memory.get_status_summary()
        for key, value in status.items():
            print(f"    {key}: {value}")
        
        await memory.close()
        print_result("GraphitiMemory", "All tests completed", True)
        
    except ImportError as e:
        print_result("GraphitiMemory", f"Import error: {e}", False)
    except Exception as e:
        print_result("GraphitiMemory", f"FAILED: {e}", False)
        import traceback
        traceback.print_exc()


async def test_raw_falkordb():
    """Test raw FalkorDB operations to see what's in the database."""
    print_header("5. Raw FalkorDB Query (Debug)")
    
    config = GraphitiConfig.from_env()
    
    try:
        import redis
        from falkordb import FalkorDB
        
        # Connect using FalkorDB client
        db = FalkorDB(
            host=config.falkordb_host,
            port=config.falkordb_port,
            password=config.falkordb_password or None,
        )
        
        # List all graphs
        graphs = db.list_graphs()
        print(f"  Available graphs: {graphs}")
        
        # Query the main graph
        graph_name = config.database
        print(f"\n  Querying graph: {graph_name}")
        
        graph = db.select_graph(graph_name)
        
        # Count nodes
        result = graph.query("MATCH (n) RETURN count(n) as count")
        node_count = result.result_set[0][0] if result.result_set else 0
        print(f"  Total nodes: {node_count}")
        
        # Count edges
        result = graph.query("MATCH ()-[r]->() RETURN count(r) as count")
        edge_count = result.result_set[0][0] if result.result_set else 0
        print(f"  Total edges: {edge_count}")
        
        # Get node labels
        result = graph.query("MATCH (n) RETURN DISTINCT labels(n)")
        labels = [r[0] for r in result.result_set] if result.result_set else []
        print(f"  Node labels: {labels}")
        
        # Get sample nodes
        print("\n  Sample nodes:")
        result = graph.query("MATCH (n) RETURN n LIMIT 5")
        for i, row in enumerate(result.result_set or []):
            print(f"    {i+1}. {row}")
        
        # Get episode nodes specifically
        print("\n  Episode nodes:")
        result = graph.query("MATCH (n:Episode) RETURN n.name, n.source_description LIMIT 5")
        for i, row in enumerate(result.result_set or []):
            print(f"    {i+1}. name={row[0]}, desc={row[1]}")
        
        # Get entity nodes
        print("\n  Entity nodes:")
        result = graph.query("MATCH (n:Entity) RETURN n.name, n.summary LIMIT 5")
        for i, row in enumerate(result.result_set or []):
            print(f"    {i+1}. name={row[0]}, summary={str(row[1])[:50]}...")
        
        print_result("Raw FalkorDB", f"Graph has {node_count} nodes, {edge_count} edges", True)
        
    except ImportError as e:
        print_result("Raw FalkorDB", f"Import error (install falkordb): {e}", False)
    except Exception as e:
        print_result("Raw FalkorDB", f"FAILED: {e}", False)
        import traceback
        traceback.print_exc()


async def main():
    """Run all tests."""
    print("\n" + "=" * 60)
    print("  GRAPHITI MEMORY TEST SUITE")
    print("=" * 60)
    
    # Check configuration first
    print_header("0. Configuration Check")
    
    config = GraphitiConfig.from_env()
    status = get_graphiti_status()
    
    print_result("GRAPHITI_ENABLED", str(config.enabled), config.enabled)
    print_result("LLM Provider", config.llm_provider, True)
    print_result("Embedder Provider", config.embedder_provider, True)
    print_result("FalkorDB host", config.falkordb_host, True)
    print_result("FalkorDB port", str(config.falkordb_port), True)
    print_result("Database", config.database, True)
    print_result("is_graphiti_enabled()", str(is_graphiti_enabled()), is_graphiti_enabled())

    # Show provider-specific configuration
    if config.llm_provider == "openai":
        print_result("OPENAI_API_KEY set", "Yes" if config.openai_api_key else "No", bool(config.openai_api_key))
    elif config.llm_provider == "anthropic":
        print_result("ANTHROPIC_API_KEY set", "Yes" if config.anthropic_api_key else "No", bool(config.anthropic_api_key))
    elif config.llm_provider == "ollama":
        print_result("OLLAMA_LLM_MODEL", config.ollama_llm_model or "Not set", bool(config.ollama_llm_model))

    if config.embedder_provider == "openai":
        print_result("OPENAI_API_KEY set (embedder)", "Yes" if config.openai_api_key else "No", bool(config.openai_api_key))
    elif config.embedder_provider == "voyage":
        print_result("VOYAGE_API_KEY set", "Yes" if config.voyage_api_key else "No", bool(config.voyage_api_key))
    elif config.embedder_provider == "ollama":
        print_result("OLLAMA_EMBEDDING_MODEL", config.ollama_embedding_model or "Not set", bool(config.ollama_embedding_model))
        print_result("OLLAMA_EMBEDDING_DIM", str(config.ollama_embedding_dim) if config.ollama_embedding_dim else "Not set", bool(config.ollama_embedding_dim))

    if not is_graphiti_enabled():
        print("\n  ⚠️  Graphiti is not enabled or misconfigured!")
        print("  Make sure to set these environment variables:")
        print("    export GRAPHITI_ENABLED=true")
        print("    export GRAPHITI_LLM_PROVIDER=openai  # or anthropic, azure_openai, ollama")
        print("    export GRAPHITI_EMBEDDER_PROVIDER=openai  # or voyage, azure_openai, ollama")
        print("    # Plus provider-specific credentials (see docstring for examples)")
        print()
        if status.get("reason"):
            print(f"  Reason: {status['reason']}")
        if status.get("errors"):
            print(f"  Errors: {status['errors']}")
        return
    
    # Run tests
    conn_ok = await test_connection()
    
    if conn_ok:
        episode_name, group_id = await test_save_episode()
        
        # Wait a bit for embeddings to process
        if episode_name:
            print("\n  Waiting 3 seconds for embedding processing...")
            await asyncio.sleep(3)
        
        await test_search(group_id)
        await test_graphiti_memory_class()
        await test_raw_falkordb()
    
    print_header("TEST SUMMARY")
    print("  Tests completed. Check the results above for any failures.")
    print()


if __name__ == "__main__":
    asyncio.run(main())


