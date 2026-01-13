"""WebSocket routes for real-time events."""

import asyncio
import json
from typing import Any
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


class ConnectionManager:
    """Manages WebSocket connections and broadcasts events."""

    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket):
        """Accept and store a new WebSocket connection."""
        await websocket.accept()
        async with self._lock:
            self.active_connections.append(websocket)

    async def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection."""
        async with self._lock:
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)

    async def broadcast(self, event_type: str, payload: Any):
        """Broadcast an event to all connected clients."""
        if not self.active_connections:
            return

        # Spread payload into message (frontend expects {type, ...payload})
        # Validate payload is a dict before spreading to avoid TypeError
        if isinstance(payload, dict):
            message = json.dumps({
                "type": event_type,
                **payload
            })
        else:
            # Wrap non-dict payload in a data field
            message = json.dumps({
                "type": event_type,
                "data": payload
            })

        async with self._lock:
            disconnected = []
            for connection in self.active_connections:
                try:
                    await connection.send_text(message)
                except Exception:
                    disconnected.append(connection)

            # Clean up disconnected clients
            for conn in disconnected:
                if conn in self.active_connections:
                    self.active_connections.remove(conn)

    async def send_to(self, websocket: WebSocket, event_type: str, payload: Any):
        """Send an event to a specific client."""
        # Spread payload into message (frontend expects {type, ...payload})
        # Validate payload is a dict before spreading to avoid TypeError
        if isinstance(payload, dict):
            message = json.dumps({
                "type": event_type,
                **payload
            })
        else:
            # Wrap non-dict payload in a data field
            message = json.dumps({
                "type": event_type,
                "data": payload
            })
        try:
            await websocket.send_text(message)
        except Exception:
            await self.disconnect(websocket)


# Global connection manager instance
manager = ConnectionManager()


def get_connection_manager() -> ConnectionManager:
    """Get the global connection manager instance."""
    return manager


@router.websocket("/")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time events.

    Clients connect to receive events like:
    - task:progress - Task progress updates
    - task:status - Task status changes
    - task:log - Task log messages
    - roadmap:progress - Roadmap generation progress
    - terminal:output - Terminal output
    - build:status - Build status changes

    Message format:
    {
        "type": "event:name",
        "payload": { ... event data ... }
    }
    """
    await manager.connect(websocket)

    try:
        # Send connection confirmation
        await manager.send_to(websocket, "connection", {"status": "connected"})

        # Keep connection alive and handle incoming messages
        while True:
            try:
                # Wait for messages from client (heartbeat, subscriptions, etc.)
                data = await websocket.receive_text()

                # Parse and handle client messages
                try:
                    message = json.loads(data)
                    msg_type = message.get("type", "")

                    if msg_type == "ping":
                        # Respond to ping with pong
                        await manager.send_to(websocket, "pong", {})

                    elif msg_type == "subscribe":
                        # Client wants to subscribe to specific events
                        # For now, all clients receive all events
                        await manager.send_to(websocket, "subscribed", {
                            "events": message.get("events", [])
                        })

                except json.JSONDecodeError:
                    # Invalid JSON, ignore
                    pass

            except WebSocketDisconnect:
                break

    finally:
        await manager.disconnect(websocket)


# Helper functions for broadcasting events from other parts of the app

async def broadcast_task_progress(task_id: str, plan: dict):
    """Broadcast task progress update."""
    await manager.broadcast("task:progress", {
        "taskId": task_id,
        "plan": plan
    })


async def broadcast_task_status(task_id: str, status: str, message: str = ""):
    """Broadcast task status change."""
    await manager.broadcast("task:status", {
        "taskId": task_id,
        "status": status,
        "message": message
    })


async def broadcast_task_log(task_id: str, log_type: str, content: str):
    """Broadcast task log message."""
    await manager.broadcast("task:log", {
        "taskId": task_id,
        "type": log_type,
        "content": content
    })


async def broadcast_roadmap_progress(project_id: str, status: dict):
    """Broadcast roadmap generation progress."""
    await manager.broadcast("roadmap:progress", {
        "projectId": project_id,
        "status": status
    })


async def broadcast_build_status(project_id: str, spec_id: str, status: str):
    """Broadcast build status change."""
    await manager.broadcast("build:status", {
        "projectId": project_id,
        "specId": spec_id,
        "status": status
    })


async def broadcast_terminal_output(terminal_id: str, data: str):
    """Broadcast terminal output."""
    await manager.broadcast("terminal:output", {
        "terminalId": terminal_id,
        "data": data
    })
