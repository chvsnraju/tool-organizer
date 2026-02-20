import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, SwitchCamera } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (imageSrc: string) => void;
  autoStart?: boolean;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, autoStart = false }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current?.play().catch(e => console.error("Play error:", e));
      };
    }
  }, [stream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stream?.getTracks().forEach(track => track.stop());
    };
  }, [stream]);

  const startCamera = useCallback(async (mode?: 'environment' | 'user') => {
    // Stop existing stream first
    stream?.getTracks().forEach(track => track.stop());

    const targetMode = mode || facingMode;
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: targetMode }
      });
      setStream(mediaStream);
      setError('');
      if (mode) setFacingMode(mode);
    } catch (err) {
      setError('Could not access camera. Please check permissions.');
      console.error('Camera access error:', err);
    }
  }, [facingMode, stream]);

  // Auto-start if requested
  useEffect(() => {
    if (autoStart && !stream) {
      startCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);



  const flipCamera = useCallback(() => {
    const newMode = facingMode === 'environment' ? 'user' : 'environment';
    startCamera(newMode);
  }, [facingMode, startCamera]);

  const takePhoto = useCallback(() => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const imageSrc = canvas.toDataURL('image/jpeg', 0.85);
        stream?.getTracks().forEach(track => track.stop());
        setStream(null);
        onCapture(imageSrc);
      }
    }
  }, [onCapture, stream]);

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center z-50 p-6">
        <div className="bg-black/90 backdrop-blur-md text-white p-6 rounded-2xl text-center max-w-xs border border-white/10">
          <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <Camera className="w-7 h-7 text-red-400" />
          </div>
          <p className="font-semibold text-base mb-1">Camera Access Needed</p>
          <p className="text-sm text-white/60 mb-5">{error}</p>
          <button onClick={() => startCamera()} className="px-6 py-2.5 bg-white text-black rounded-xl text-sm font-medium hover:bg-white/90 transition-all">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!stream) {
    return null; // Parent handles pre-camera UI
  }

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />

      {/* Viewfinder overlay */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-8 border-2 border-white/20 rounded-3xl" />
        <div className="absolute top-8 left-8 w-8 h-8 border-t-3 border-l-3 border-white/70 rounded-tl-2xl" />
        <div className="absolute top-8 right-8 w-8 h-8 border-t-3 border-r-3 border-white/70 rounded-tr-2xl" />
        <div className="absolute bottom-8 left-8 w-8 h-8 border-b-3 border-l-3 border-white/70 rounded-bl-2xl" />
        <div className="absolute bottom-8 right-8 w-8 h-8 border-b-3 border-r-3 border-white/70 rounded-br-2xl" />
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-8 z-20 pb-safe">
        {/* Flip camera */}
        <button
          onClick={flipCamera}
          className="w-12 h-12 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20 active:scale-90 transition-all"
        >
          <SwitchCamera className="w-5 h-5 text-white" />
        </button>

        {/* Shutter */}
        <button
          onClick={takePhoto}
          className="w-[72px] h-[72px] rounded-full border-[3px] border-white bg-white/15 backdrop-blur-sm shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all group"
        >
          <div className="w-[58px] h-[58px] bg-white rounded-full shadow-inner group-active:scale-90 transition-transform" />
        </button>

        {/* Spacer for symmetry */}
        <div className="w-12 h-12" />
      </div>
    </div>
  );
};
