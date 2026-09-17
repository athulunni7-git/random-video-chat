/**
 * Small wrapper around the browser's native WebSocket for talking to the
 * Django Channels matchmaking/signaling endpoint. Keeps VideoChat.jsx from
 * having to deal with JSON.stringify/parse and raw event listeners itself.
 */

// Same host as the page in production; explicit dev URL for local testing
// where the frontend (5173) and backend (8000) run on different ports.
const WS_URL =
  import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws/matchmaking/";

export function createSignalingSocket({ onOpen, onMessage, onClose, onError }) {
  const socket = new WebSocket(WS_URL);

  socket.onopen = () => onOpen && onOpen();
  socket.onclose = () => onClose && onClose();
  socket.onerror = (err) => onError && onError(err);
  socket.onmessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      console.warn("Received non-JSON WebSocket message, ignoring.");
      return;
    }
    onMessage && onMessage(data);
  };

  return {
    send(payload) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
      }
    },
    close() {
      socket.close();
    },
  };
}
