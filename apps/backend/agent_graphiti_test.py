import asyncio
import os
from pathlib import Path
from datetime import datetime, timezone
from integrations.graphiti.memory import GraphitiMemory

spec_dir = Path.home() / ".auto-claude" / "agent_style_spec"
spec_dir.mkdir(parents=True, exist_ok=True)
project_dir_env = os.getenv("PROJECT_DIR")
# Prefer a portable PROJECT_DIR override; otherwise fall back to the repository root
# (…/apps/backend/agent_graphiti_test.py -> parents[2] == repo root).
project_dir = (
    Path(project_dir_env).expanduser().resolve()
    if project_dir_env
    else Path(__file__).resolve().parents[2]
)
project_dir.mkdir(parents=True, exist_ok=True)

msg = f"agent-style write {datetime.now(timezone.utc).isoformat()}"

async def main():
    mem = GraphitiMemory(spec_dir=spec_dir, project_dir=project_dir)
    print("is_enabled:", getattr(mem, "is_enabled", None))

    # Write (Agent-style) – with a timeout so it doesn't hang forever
    ok = await asyncio.wait_for(
        mem.save_session_insights(
            session_num=int(datetime.now(timezone.utc).timestamp()),
            insights={"type":"agent_style_test","message":msg,"timestamp":datetime.now(timezone.utc).isoformat()},
        ),
        timeout=120,
    )
    print("write_ok:", ok)

    # Read (Agent-style)
    hits = await asyncio.wait_for(mem.get_relevant_context(query=msg, num_results=20), timeout=60)
    print("hits:", len(hits) if hits else 0)
    if hits:
        print("first_hit:", hits[0])

    await mem.close()
    print("spec_dir_used:", spec_dir)

asyncio.run(main())
