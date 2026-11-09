"use client";

import { useEffect, useRef } from "react";

/** A mirrored self-view. Muted so that the microphone doesn't feed back. */
export function CameraPreview({ stream }: { stream: MediaStream | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <figure className="camera">
      <video ref={videoRef} autoPlay muted playsInline aria-label="Your camera preview" />
    </figure>
  );
}
