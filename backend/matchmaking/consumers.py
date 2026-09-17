"""
MatchmakingConsumer

Handles two responsibilities over a single WebSocket connection per client:

1. Matchmaking — maintaining a simple FIFO waiting queue in server memory
   and pairing up the first two available users. This is not a database:
   it's a plain Python list/dict living at module scope, so it's shared by
   every connection this process handles (see settings.py for the
   single-process-only caveat).

2. Signaling relay — once two clients are paired, the server does nothing
   more than forward WebRTC signaling messages (SDP offer/answer, ICE
   candidates) from one peer straight to the other. The server never sees
   or touches the actual audio/video stream — that travels directly
   between browsers once WebRTC negotiation completes.

No user accounts, no persistence, no message history: state only exists
for as long as a connection is open.
"""

import asyncio
import json
import logging

from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger(__name__)

# --- Shared in-memory state (module scope = shared across all connections
# handled by this process) -------------------------------------------------
WAITING_QUEUE: list[str] = []          # channel_names waiting for a match
PARTNERS: dict[str, str] = {}          # channel_name -> partner's channel_name
_STATE_LOCK = asyncio.Lock()           # guards WAITING_QUEUE and PARTNERS


class MatchmakingConsumer(AsyncWebsocketConsumer):
    # ---- Connection lifecycle -------------------------------------------
    async def connect(self):
        await self.accept()
        # We do NOT auto-join the queue here. The client joins explicitly
        # (after the user clicks "Start" and camera access is granted),
        # so nobody sits in the queue before they're actually ready.

    async def disconnect(self, close_code):
        await self._leave_queue_and_match(notify_partner=True)

    # ---- Incoming messages -------------------------------------------
    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            logger.warning("Received non-JSON WebSocket message; ignoring.")
            return

        msg_type = data.get("type")

        if msg_type == "join":
            await self._join_queue()
        elif msg_type in ("offer", "answer", "ice-candidate"):
            await self._relay_to_partner(data)
        elif msg_type == "next":
            await self._handle_next()
        elif msg_type == "stop":
            await self._leave_queue_and_match(notify_partner=True)
            await self._send_json({"type": "stopped"})
        else:
            logger.warning("Unknown message type: %s", msg_type)

    # ---- Matchmaking -------------------------------------------
    async def _join_queue(self):
        matched_partner = None

        async with _STATE_LOCK:
            if WAITING_QUEUE:
                # Someone else is already waiting: pair up with them.
                matched_partner = WAITING_QUEUE.pop(0)
                PARTNERS[self.channel_name] = matched_partner
                PARTNERS[matched_partner] = self.channel_name
            else:
                WAITING_QUEUE.append(self.channel_name)

        if matched_partner:
            # The newly-joined client (self) is designated "caller" and
            # will create the SDP offer; the one who was already waiting
            # is "callee" and will respond with an answer.
            await self._send_json({"type": "matched", "role": "caller"})
            await self._send_to_channel(
                matched_partner, {"type": "matched", "role": "callee"}
            )
        else:
            await self._send_json({"type": "waiting"})

    async def _handle_next(self):
        await self._leave_queue_and_match(notify_partner=True)
        # Immediately look for a new stranger.
        await self._join_queue()

    async def _leave_queue_and_match(self, notify_partner: bool):
        """Remove self from the waiting queue and/or break an active match."""
        partner = None
        async with _STATE_LOCK:
            if self.channel_name in WAITING_QUEUE:
                WAITING_QUEUE.remove(self.channel_name)
            partner = PARTNERS.pop(self.channel_name, None)
            if partner:
                PARTNERS.pop(partner, None)

        if partner and notify_partner:
            await self._send_to_channel(partner, {"type": "partner-left"})

    # ---- Signaling relay -------------------------------------------
    async def _relay_to_partner(self, data: dict):
        partner = PARTNERS.get(self.channel_name)
        if not partner:
            # No active match (e.g. stale message after disconnect) — drop it.
            return
        await self._send_to_channel(partner, data)

    # ---- Helpers: sending -------------------------------------------
    async def _send_json(self, payload: dict):
        await self.send(text_data=json.dumps(payload))

    async def _send_to_channel(self, channel_name: str, payload: dict):
        """Send a JSON payload to a specific channel_name via the channel
        layer. This is how we deliver a message to the *other* client's
        consumer instance, which may be handled by a different asyncio
        task (or, with a Redis channel layer, a different process)."""
        await self.channel_layer.send(
            channel_name,
            {"type": "signal.message", "payload": payload},
        )

    # ---- Channel layer event handler -------------------------------------------
    # Invoked when another consumer calls channel_layer.send(..., {"type": "signal.message", ...})
    # targeting this consumer's channel_name. Channels dispatches based on
    # the "type" key, translating dots to underscores in the method name.
    async def signal_message(self, event):
        await self._send_json(event["payload"])
