import React, { useRef, useState } from 'react';
import Cropper, { type ReactCropperElement } from 'react-cropper';
import 'cropperjs/dist/cropper.css';
import { X, Check, RotateCw, ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';

interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedImageBase64: string) => void;
  onCancel: () => void;
}

export const ImageCropper: React.FC<ImageCropperProps> = ({ imageSrc, onCropComplete, onCancel }) => {
  const cropperRef = useRef<ReactCropperElement>(null);
  const [processing, setProcessing] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<number | undefined>(undefined);

  const saveCroppedImage = () => {
    const cropper = cropperRef.current?.cropper;
    if (cropper) {
      setProcessing(true);
      // Get cropped canvas
      const canvas = cropper.getCroppedCanvas({
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
      });
      
      const base64 = canvas.toDataURL('image/jpeg', 0.9);
      onCropComplete(base64);
      setProcessing(false);
    }
  };

  const setRatio = (ratio: number | undefined) => {
    setAspectRatio(ratio);
    const cropper = cropperRef.current?.cropper;
    if (cropper) {
      cropper.setAspectRatio(ratio || NaN);
    }
  };

  const rotate = (deg: number) => {
    const cropper = cropperRef.current?.cropper;
    if (cropper) {
      cropper.rotate(deg);
    }
  };

  const zoom = (ratio: number) => {
    const cropper = cropperRef.current?.cropper;
    if (cropper) {
      cropper.zoom(ratio);
    }
  };

  const reset = () => {
    const cropper = cropperRef.current?.cropper;
    if (cropper) {
      cropper.reset();
      setAspectRatio(undefined);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-in fade-in duration-200">
      <div className="relative flex-1 w-full bg-black overflow-hidden flex items-center justify-center">
        <Cropper
          src={imageSrc}
          style={{ height: '100%', width: '100%' }}
          initialAspectRatio={NaN}
          aspectRatio={NaN} // Free by default
          guides={true}
          viewMode={1}
          dragMode="move"
          minCropBoxHeight={10}
          minCropBoxWidth={10}
          background={false}
          responsive={true}
          autoCropArea={0.8}
          checkOrientation={false}
          ref={cropperRef}
        />
      </div>

      <div className="bg-zinc-900 border-t border-white/10 p-6 space-y-6 shrink-0 pb-safe z-[110]">
        
        {/* Controls Row */}
        <div className="flex flex-col gap-4">
          
          {/* Aspect Ratios */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-none">
            {[
              { label: 'Free', value: undefined },
              { label: '1:1', value: 1 },
              { label: '4:3', value: 4 / 3 },
              { label: '16:9', value: 16 / 9 },
            ].map((ratio) => (
              <button
                key={ratio.label}
                onClick={() => setRatio(ratio.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                  aspectRatio === ratio.value
                    ? 'bg-white text-black'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                }`}
              >
                {ratio.label}
              </button>
            ))}
             <button
                onClick={reset}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Reset
              </button>
          </div>

          {/* Tools */}
          <div className="flex items-center justify-around p-2 bg-zinc-800/50 rounded-xl">
             <button onClick={() => zoom(-0.1)} className="p-2 text-zinc-400 hover:text-white">
                <ZoomOut className="w-5 h-5" />
             </button>
             <button onClick={() => zoom(0.1)} className="p-2 text-zinc-400 hover:text-white">
                <ZoomIn className="w-5 h-5" />
             </button>
             <div className="w-px h-6 bg-zinc-700 mx-2" />
             <button onClick={() => rotate(-90)} className="p-2 text-zinc-400 hover:text-white">
                <RotateCw className="w-5 h-5 -scale-x-100" />
             </button>
             <button onClick={() => rotate(90)} className="p-2 text-zinc-400 hover:text-white">
                <RotateCw className="w-5 h-5" />
             </button>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-zinc-800 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-zinc-700 transition-colors"
          >
            <X className="w-4 h-4" /> Cancel
          </button>
          <button
            onClick={saveCroppedImage}
            disabled={processing}
            className="flex-1 py-3 bg-white text-black rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-gray-200 transition-colors"
          >
            {processing ? 'Saving...' : <><Check className="w-4 h-4" /> Apply Crop</>}
          </button>
        </div>
      </div>
    </div>
  );
};
