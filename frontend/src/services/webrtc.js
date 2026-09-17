/**
 * WebRTC helper: wraps RTCPeerConnection creation and wiring so
 * VideoChat.jsx can stay focused on UI/state rather than peer-connection
 * plumbing.
 *
 * STUN server: a public Google STUN server is used here for development.
 * STUN only helps peers discover their public IP/port so they can attempt
 * a direct connection; it does not relay media. Some users behind
 * restrictive NATs/firewalls (symmetric NAT, some corporate networks)
 * won't be able to establish a direct peer-to-peer path even with STUN —
 * in production you'd add a TURN server (which *does* relay media as a
 * fallback) alongside this, e.g.:
 *
 *   { urls: "turn:your-turn-server.example.com:3478", username: "...", credential: "..." }
 */
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

/**
 * Creates a configured RTCPeerConnection.
 *
 * @param {MediaStream} localStream - local camera/mic stream to send.
 * @param {(candidate: RTCIceCandidate) => void} onIceCandidate - called for
 *   each local ICE candidate that needs to be sent to the remote peer over
 *   the signaling WebSocket.
 * @param {(stream: MediaStream) => void} onRemoteStream - called once the
 *   remote peer's video/audio stream is available.
 * @param {(state: RTCPeerConnectionState) => void} onConnectionStateChange
 */
export function createPeerConnection({
  localStream,
  onIceCandidate,
  onRemoteStream,
  onConnectionStateChange,
}) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  // Send our camera/mic tracks to the peer.
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Collect the remote peer's tracks into a single stream for <video>.
  const remoteStream = new MediaStream();
  pc.ontrack = (event) => {
    event.streams[0]?.getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
    onRemoteStream(remoteStream);
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      onIceCandidate(event.candidate);
    }
  };

  pc.onconnectionstatechange = () => {
    onConnectionStateChange && onConnectionStateChange(pc.connectionState);
  };

  return pc;
}

/** Cleanly tears down a peer connection: stops senders, closes it. */
export function closePeerConnection(pc) {
  if (!pc) return;
 
  pc.onicecandidate = null;
  pc.ontrack = null;
  pc.onconnectionstatechange = null;
  pc.close();
}

export async function createOffer(pc) {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  return offer;
}

export async function createAnswer(pc, remoteOfferSdp) {
  await pc.setRemoteDescription(new RTCSessionDescription(remoteOfferSdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  return answer;
}

export async function acceptAnswer(pc, remoteAnswerSdp) {
  await pc.setRemoteDescription(new RTCSessionDescription(remoteAnswerSdp));
}

export async function addRemoteIceCandidate(pc, candidate) {
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.warn("Failed to add ICE candidate:", err);
  }
}
