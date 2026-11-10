"use client";

import { useEffect, useRef, useState } from "react";
import { CameraPreview } from "@/components/practice/CameraPreview";
import {
  DEVICE_PROBLEM_TEXT,
  checkStorage,
  estimateRecordingBytes,
  requestDevices,
  type DeviceCheckResult,
  type StorageCheck,
} from "@/lib/media/devices";
import { isRecordingSupported } from "@/lib/media/recorder";
import { formatDuration, totalSeconds } from "@/lib/practice/timeline";
import { isOnDeviceSpeechReady, isSpeechSupported } from "@/lib/speech/transcriber";
import type { CaptureMode, PracticeSession } from "@/lib/storage/sessions";

export interface StartChoices {
  stream: MediaStream | null;
  captureMode: CaptureMode;
  transcriptionEnabled: boolean;
  onDeviceSpeech: boolean;
}

function MicLevel({ stream }: { stream: MediaStream }) {
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const Context = window.AudioContext;
    if (!Context || stream.getAudioTracks().length === 0) return;
    const context = new Context();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let frame = 0;
    const draw = () => {
      analyser.getByteTimeDomainData(samples);
      let peak = 0;
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128));
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${Math.min(1, peak / 64)})`;
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      void context.close();
    };
  }, [stream]);

  return (
    <div className="meter" role="img" aria-label="Microphone level">
      <div className="meter-fill" ref={fillRef} />
    </div>
  );
}

function formatSize(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.ceil(bytes / 1e6)} MB`;
}

export function DeviceCheck({ session, onStart }: { session: PracticeSession; onStart: (choices: StartChoices) => void }) {
  const [result, setResult] = useState<DeviceCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [storage, setStorage] = useState<StorageCheck | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [onDeviceSpeech, setOnDeviceSpeech] = useState(false);
  const [transcribe, setTranscribe] = useState(true);
  const [acceptNoRecording, setAcceptNoRecording] = useState(false);
  const [recordingSupported, setRecordingSupported] = useState(true);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setSpeechSupported(isSpeechSupported());
    setRecordingSupported(isRecordingSupported());
    void isOnDeviceSpeechReady().then(setOnDeviceSpeech);
    void checkStorage().then(setStorage);
    // Leaving this screen releases the devices, unless onStart took them over.
    return () => streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const check = async () => {
    setChecking(true);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const next = await requestDevices();
    streamRef.current = next.stream;
    setResult(next);
    setAcceptNoRecording(false);
    setChecking(false);
  };

  const stream = result?.stream ?? null;
  const hasVideo = Boolean(stream && stream.getVideoTracks().length > 0);
  const captureMode: CaptureMode = !recordingSupported || !stream ? "none" : hasVideo ? "video" : "audio";
  const needed = estimateRecordingBytes(captureMode, session.config.stationCount, session.config.speakSeconds);
  const lowStorage = storage?.availableBytes != null && storage.availableBytes < needed;
  const ready = result !== null && (captureMode !== "none" || acceptNoRecording);

  const begin = () => {
    const handed = streamRef.current;
    streamRef.current = null;
    onStart({ stream: captureMode === "none" ? null : handed, captureMode, transcriptionEnabled: speechSupported && transcribe, onDeviceSpeech });
    if (captureMode === "none") handed?.getTracks().forEach((track) => track.stop());
  };

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Check your camera and microphone</h1>
        <p className="lead">
          {session.config.stationCount} station{session.config.stationCount === 1 ? "" : "s"}, {formatDuration(totalSeconds(session.config))} in total. Once you start, the
          clock doesn&apos;t pause. Your recordings stay in this browser.
        </p>
      </div>

      {!recordingSupported ? <p className="alert alert-warning">This browser can&apos;t record. You can still practice with the timer.</p> : null}

      <section className="panel" aria-labelledby="devices-heading">
        <div className="panel-head">
          <h2 id="devices-heading">Camera and microphone</h2>
          <p className="hint">Your browser will ask for permission. Choose Allow.</p>
        </div>
        {result === null ? (
          <div className="device-start">
            <p className="muted">Turn them on to see yourself and test your sound before you begin.</p>
            <button type="button" className="btn btn-primary btn-large" onClick={() => void check()} disabled={checking}>
              {checking ? "Waiting for permission…" : "Turn on camera and microphone"}
            </button>
          </div>
        ) : (
          <div className="device-grid">
            <div>{hasVideo ? <CameraPreview stream={stream} /> : <div className="device-start"><p className="muted">No camera picture</p></div>}</div>
            <div className="status-list">
              <p className={result.camera ? "status-bad" : "status-ok"} role="status">
                Camera: {result.camera ? DEVICE_PROBLEM_TEXT[result.camera] : "working"}
              </p>
              <p className={result.microphone ? "status-bad" : "status-ok"} role="status">
                Microphone: {result.microphone ? DEVICE_PROBLEM_TEXT[result.microphone] : "working. Speak to see the level move."}
              </p>
              {stream ? <MicLevel stream={stream} /> : null}
              {result.camera || result.microphone ? (
                <div>
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => void check()} disabled={checking}>
                    Try again
                  </button>
                </div>
              ) : null}
              {stream && !hasVideo ? <p className="hint">You can continue with audio only.</p> : null}
              {captureMode === "none" ? (
                <label className="check">
                  <input type="checkbox" checked={acceptNoRecording} onChange={(event) => setAcceptNoRecording(event.target.checked)} />
                  <span>Continue without recording. You&apos;ll only have the timer and questions.</span>
                </label>
              ) : null}
            </div>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="transcript-heading">
        <h2 id="transcript-heading">Live transcript</h2>
        {speechSupported ? (
          <>
            <label className="check">
              <input type="checkbox" checked={transcribe} onChange={(event) => setTranscribe(event.target.checked)} />
              <span>Transcribe what I say</span>
            </label>
            <p className="hint">
              {onDeviceSpeech
                ? "This browser transcribes on your device."
                : "This uses your browser's speech service, which can send your microphone audio to Google (Chrome, Edge) or Apple (Safari). Your video recording is never sent. Turn this off to keep all audio on this device."}
            </p>
          </>
        ) : (
          <p className="hint">This browser doesn&apos;t support live transcription. Recording still works, and you can type a transcript afterwards. Chrome has the best support.</p>
        )}
      </section>

      {lowStorage ? (
        <p className="alert alert-warning">
          This session could need about {formatSize(needed)}, but this browser only has {formatSize(storage.availableBytes!)} free for this site. Recording stops if storage runs out.
        </p>
      ) : null}

      <div className="action-bar">
        <p className="hint">{ready ? "The first question appears and the clock starts as soon as you press Start." : "Turn on your camera and microphone first."}</p>
        <button type="button" className="btn btn-gold btn-large" disabled={!ready} onClick={begin}>
          Start practice
        </button>
      </div>
    </div>
  );
}
