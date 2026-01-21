import { useMemo } from "react";
import "./Waveform.css";

const BAR_COUNT = 10;

export function Waveform() {
  const bars = useMemo(
    () =>
      Array.from({ length: BAR_COUNT }, (_, i) => ({
        height: Math.random() * 100,
        delay: i * 0.1,
      })),
    [],
  );

  return (
    <div className="waveform__container">
      <div className="waveform">
        {bars.map(({ height, delay }, i) => (
          <div
            key={i}
            className="waveform__bar"
            style={{
              height: `${height}%`,
              animationDelay: `${delay}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
