"""Log streaming service for real-time build output."""

import asyncio
from collections import defaultdict
from pathlib import Path
from typing import AsyncIterator, Callable, Optional

from config import Settings


class LogStreamer:
    """Service for streaming logs to multiple subscribers."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self._queues: dict[str, list[asyncio.Queue]] = defaultdict(list)
        self._active_tails: dict[str, asyncio.Task] = {}

    def _get_stream_key(self, project_id: str, spec_id: str) -> str:
        """Generate a unique key for a log stream."""
        return f"{project_id}:{spec_id}"

    async def subscribe(
        self,
        project_id: str,
        spec_id: str,
    ) -> AsyncIterator[str]:
        """Subscribe to a log stream."""
        stream_key = self._get_stream_key(project_id, spec_id)
        queue: asyncio.Queue[str | None] = asyncio.Queue()
        self._queues[stream_key].append(queue)

        try:
            while True:
                line = await queue.get()
                if line is None:
                    break
                yield line
        finally:
            self._queues[stream_key].remove(queue)

    async def publish(
        self,
        project_id: str,
        spec_id: str,
        line: str,
    ) -> None:
        """Publish a line to all subscribers."""
        stream_key = self._get_stream_key(project_id, spec_id)
        for queue in self._queues[stream_key]:
            await queue.put(line)

    async def close_stream(self, project_id: str, spec_id: str) -> None:
        """Close a stream and notify all subscribers."""
        stream_key = self._get_stream_key(project_id, spec_id)
        for queue in self._queues[stream_key]:
            await queue.put(None)

    async def tail_file(
        self,
        file_path: Path,
        project_id: str,
        spec_id: str,
        follow: bool = True,
    ) -> None:
        """Tail a log file and publish lines to subscribers."""
        stream_key = self._get_stream_key(project_id, spec_id)

        # Cancel any existing tail for this stream
        if stream_key in self._active_tails:
            self._active_tails[stream_key].cancel()

        async def _tail():
            try:
                if not file_path.exists():
                    await asyncio.sleep(0.5)
                    if not file_path.exists():
                        await self.publish(
                            project_id, spec_id, "Waiting for log file...\n"
                        )

                # Wait for file to appear
                while not file_path.exists():
                    await asyncio.sleep(0.5)

                with open(file_path, "r") as f:
                    # Read existing content
                    for line in f:
                        await self.publish(project_id, spec_id, line)

                    if not follow:
                        return

                    # Follow new content
                    while True:
                        line = f.readline()
                        if line:
                            await self.publish(project_id, spec_id, line)
                        else:
                            await asyncio.sleep(0.1)

            except asyncio.CancelledError:
                pass
            except Exception as e:
                await self.publish(project_id, spec_id, f"Error: {e}\n")
            finally:
                await self.close_stream(project_id, spec_id)
                if stream_key in self._active_tails:
                    del self._active_tails[stream_key]

        task = asyncio.create_task(_tail())
        self._active_tails[stream_key] = task

    def stop_tail(self, project_id: str, spec_id: str) -> bool:
        """Stop tailing a log file."""
        stream_key = self._get_stream_key(project_id, spec_id)
        if stream_key in self._active_tails:
            self._active_tails[stream_key].cancel()
            del self._active_tails[stream_key]
            return True
        return False

    def get_subscriber_count(self, project_id: str, spec_id: str) -> int:
        """Get the number of subscribers for a stream."""
        stream_key = self._get_stream_key(project_id, spec_id)
        return len(self._queues[stream_key])


# Global log streamer instance
_log_streamer: Optional[LogStreamer] = None


def get_log_streamer(settings: Settings) -> LogStreamer:
    """Get or create the global log streamer."""
    global _log_streamer
    if _log_streamer is None:
        _log_streamer = LogStreamer(settings)
    return _log_streamer
