"use client";

import jsQR from "jsqr";
import { useEffect, useEffectEvent, useRef } from "react";

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options: { formats: string[] }): BarcodeDetectorLike;
      getSupportedFormats(): Promise<string[]>;
    };
  }
}

interface ScannerProps {
  paused: boolean;
  torch: boolean;
  onCode: (text: string) => void;
  onTorchAvailable: (available: boolean) => void;
  onError: (message: string) => void;
}

/**
 * Continuous QR scanning from the rear camera. Uses the phone's built-in barcode detector where
 * available (Android Chrome: fast, good in low light) and falls back to jsQR elsewhere (iOS).
 */
export function Scanner({ paused, torch, onCode, onTorchAvailable, onError }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const pausedRef = useRef(paused);

  const emitCode = useEffectEvent((text: string) => onCode(text));
  const emitTorch = useEffectEvent((available: boolean) => onTorchAvailable(available));
  const emitError = useEffectEvent((message: string) => onError(message));

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let frame = 0;
    let busy = false;
    let lastScan = 0;
    let detector: BarcodeDetectorLike | null = null;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    async function start() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        emitError("The camera needs a secure (https) link. Use manual entry, or open the https address.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (error) {
        const name = (error as DOMException).name;
        emitError(
          name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access in the browser settings."
            : name === "NotFoundError"
              ? "No camera found on this device."
              : "Could not start the camera.",
        );
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => undefined);

      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      const capabilities = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
      emitTorch(Boolean(capabilities.torch));

      if (window.BarcodeDetector) {
        try {
          const formats = await window.BarcodeDetector.getSupportedFormats();
          if (formats.includes("qr_code")) detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        } catch {
          detector = null;
        }
      }
      loop();
    }

    async function scanFrame() {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) return;
      if (detector) {
        const codes = await detector.detect(video);
        if (codes[0]?.rawValue) emitCode(codes[0].rawValue);
        return;
      }
      if (!context) return;
      const scale = Math.min(1, 720 / video.videoWidth);
      const width = Math.round(video.videoWidth * scale);
      const height = Math.round(video.videoHeight * scale);
      canvas.width = width;
      canvas.height = height;
      context.drawImage(video, 0, 0, width, height);
      const image = context.getImageData(0, 0, width, height);
      const result = jsQR(image.data, width, height, { inversionAttempts: "dontInvert" });
      if (result?.data) emitCode(result.data);
    }

    function loop() {
      frame = requestAnimationFrame(async (time) => {
        if (stopped) return;
        if (!busy && !pausedRef.current && time - lastScan > (detector ? 60 : 100)) {
          busy = true;
          lastScan = time;
          try {
            await scanFrame();
          } catch {
            // A dropped frame is harmless; try the next one.
          }
          busy = false;
        }
        loop();
      });
    }

    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
      trackRef.current = null;
    };
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.applyConstraints({ advanced: [{ torch } as MediaTrackConstraintSet] }).catch(() => undefined);
  }, [torch]);

  return <video ref={videoRef} muted playsInline autoPlay className="absolute inset-0 size-full object-cover" aria-label="Camera view" />;
}
