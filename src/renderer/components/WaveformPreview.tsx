import { useEffect, useRef } from 'react';

interface WaveformPreviewProps {
  audioBuffer: AudioBuffer | null;
  width?: number;
  height?: number;
}

export function WaveformPreview({
  audioBuffer,
  width = 200,
  height = 80,
}: WaveformPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioBuffer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const data = audioBuffer.getChannelData(0);
    const barCount = width;
    const step = Math.max(1, Math.floor(data.length / barCount));

    ctx.clearRect(0, 0, width, height);

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(108, 140, 255, 0.55)');
    gradient.addColorStop(0.5, 'rgba(108, 140, 255, 0.9)');
    gradient.addColorStop(1, 'rgba(108, 140, 255, 0.55)');

    ctx.fillStyle = 'rgba(108, 140, 255, 0.08)';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';

    for (let i = 0; i < barCount; i++) {
      let min = 1;
      let max = -1;
      const start = i * step;
      const end = Math.min(start + step, data.length);

      for (let j = start; j < end; j++) {
        const v = data[j];
        if (v < min) min = v;
        if (v > max) max = v;
      }

      const mid = height / 2;
      const y1 = mid - max * mid * 0.9;
      const y2 = mid - min * mid * 0.9;

      ctx.beginPath();
      ctx.moveTo(i + 0.5, y1);
      ctx.lineTo(i + 0.5, y2);
      ctx.stroke();
    }
  }, [audioBuffer, width, height]);

  if (!audioBuffer) return null;

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="waveform-preview"
      aria-label="Audio waveform preview"
    />
  );
}
