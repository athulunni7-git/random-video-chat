import { useCallback, useEffect, useRef, useState } from "react";
import { createSignalingSocket } from "../services/websocket.js";
import {
  acceptAnswer,
  addRemoteIceCandidate,
  createAnswer,
  createOffer,
  createPeerConnection,
  closePeerConnection,
} from "../services/webrtc.js";

// Connection states drive both the UI copy and which buttons are shown.
const STATES = {
  IDLE: "idle",
  STARTING_CAMERA: "starting-camera",
  WAITING: "waiting",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  STRANGER_DISCONNECTED: "stranger-disconnected",
  PERMISSION_ERROR: "permission-error",
};

const STATUS_LABEL = {
  [STATES.IDLE]: "Idle",
  [STATES.STARTING_CAMERA]: "Starting camera...",
  [STATES.WAITING]: "Waiting for a stranger...",
  [STATES.CONNECTING]: "Connecting...",
  [STATES.CONNECTED]: "Connected",
  [STATES.STRANGER_DISCONNECTED]: "Stranger disconnected",
  [STATES.PERMISSION_ERROR]: "Camera/microphone permission required",
};

export default function VideoChat() {
  const [connectionState, setConnectionState] = useState(STATES.IDLE);
  const [errorMessage, setErrorMessage] = useState("");

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const localStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);
  const roleRef = useRef(null); // "caller" | "callee"

  // ---- Cleanup helpers -------------------------------------------
  const teardownPeerConnection = useCallback(() => {
    closePeerConnection(peerConnectionRef.current);
    peerConnectionRef.current = null;
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  const stopLocalStream = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, []);

  // ---- WebRTC setup for a fresh match -------------------------------------------
  const setupPeerConnection = useCallback((role) => {
    roleRef.current = role;

    const pc = createPeerConnection({
      localStream: localStreamRef.current,
      onIceCandidate: (candidate) => {
        socketRef.current?.send({ type: "ice-candidate", candidate });
      },
      onRemoteStream: (stream) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      },
      onConnectionStateChange: (state) => {
        if (state === "connected") {
          setConnectionState(STATES.CONNECTED);
        }
      },
    });
    peerConnectionRef.current = pc;

    if (role === "caller") {
      createOffer(pc).then((offer) => {
        socketRef.current?.send({ type: "offer", sdp: offer });
      });
    }
    // If "callee", we just wait for the incoming "offer" message.
  }, []);

  // ---- Signaling message handling -------------------------------------------
  const handleSignalingMessage = useCallback(
    async (data) => {
      switch (data.type) {
        case "waiting":
          setConnectionState(STATES.WAITING);
          break;

        case "matched":
          setConnectionState(STATES.CONNECTING);
          setupPeerConnection(data.role);
          break;

        case "offer": {
          const pc = peerConnectionRef.current;
          if (!pc) return;
          const answer = await createAnswer(pc, data.sdp);
          socketRef.current?.send({ type: "answer", sdp: answer });
          break;
        }

        case "answer": {
          const pc = peerConnectionRef.current;
          if (!pc) return;
          await acceptAnswer(pc, data.sdp);
          break;
        }

        case "ice-candidate": {
          const pc = peerConnectionRef.current;
          if (!pc) return;
          await addRemoteIceCandidate(pc, data.candidate);
          break;
        }

        case "partner-left":
          teardownPeerConnection();
          setConnectionState(STATES.STRANGER_DISCONNECTED);
          // Automatically look for someone new, same as clicking Next.
          setTimeout(() => {
            setConnectionState(STATES.WAITING);
            socketRef.current?.send({ type: "join" });
          }, 800);
          break;

        case "stopped":
          teardownPeerConnection();
          setConnectionState(STATES.IDLE);
          break;

        default:
          break;
      }
    },
    [setupPeerConnection, teardownPeerConnection]
  );

  // ---- Button handlers -------------------------------------------
  const handleStart = useCallback(async () => {
    setErrorMessage("");
    setConnectionState(STATES.STARTING_CAMERA);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      setConnectionState(STATES.PERMISSION_ERROR);
      setErrorMessage(
        "Camera and microphone permission is required to use video chat."
      );
      return;
    }

    const socket = createSignalingSocket({
      onOpen: () => {
        socket.send({ type: "join" });
      },
      onMessage: handleSignalingMessage,
      onClose: () => {
        // Only surface as an error if we didn't intentionally stop.
      },
      onError: () => {
        setErrorMessage("Connection to the server was lost.");
      },
    });
    socketRef.current = socket;
    setConnectionState(STATES.WAITING);
  }, [handleSignalingMessage]);

  const handleNext = useCallback(() => {
    teardownPeerConnection();
    setConnectionState(STATES.WAITING);
    socketRef.current?.send({ type: "next" });
  }, [teardownPeerConnection]);

  const handleStop = useCallback(() => {
    socketRef.current?.send({ type: "stop" });
    socketRef.current?.close();
    socketRef.current = null;
    teardownPeerConnection();
    stopLocalStream();
    setConnectionState(STATES.IDLE);
  }, [teardownPeerConnection, stopLocalStream]);

  // Full cleanup if the component unmounts / tab closes.
  useEffect(() => {
    return () => {
      socketRef.current?.close();
      teardownPeerConnection();
      stopLocalStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Render -------------------------------------------
  const isIdle = connectionState === STATES.IDLE;
  const isPermissionError = connectionState === STATES.PERMISSION_ERROR;
  const isActive = !isIdle && !isPermissionError;

  return (
    <div className="video-chat">
      <h1>Random Video Chat</h1>

      {isIdle && (
        <div className="panel">
          <p className="subtitle">Meet a random stranger</p>
          <button className="btn btn-primary" onClick={handleStart}>
            Start
          </button>
        </div>
      )}

      {isPermissionError && (
        <div className="panel">
          <p className="error-text">{errorMessage}</p>
          <button className="btn btn-primary" onClick={handleStart}>
            Try Again
          </button>
        </div>
      )}

      {isActive && (
        <div className="call-screen">
          <p className="status">{STATUS_LABEL[connectionState]}</p>

          <div className="video-stage">
            <video
              ref={remoteVideoRef}
              className="remote-video"
              autoPlay
              playsInline
            />
            <video
              ref={localVideoRef}
              className="local-video"
              autoPlay
              playsInline
              muted
            />
          </div>

          <div className="controls">
            {connectionState === STATES.CONNECTED && (
              <button className="btn btn-secondary" onClick={handleNext}>
                Next
              </button>
            )}
            <button className="btn btn-danger" onClick={handleStop}>
              Stop
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
