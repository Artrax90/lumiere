type Mood = 'warm' | 'cool' | 'neutral' | 'tension' | 'playful' | 'organic';

/**
 * Premium application background — almost black with an extremely subtle
 * textured surface, microscopic film grain, slight luminance variation,
 * and barely perceptible depth. No mood colors. No Hero imagery.
 * The Hero creates the emotion; this creates calmness.
 */

interface AmbientBackgroundProps {
  mood: Mood;
}

export default function AmbientBackground({ mood: _mood }: AmbientBackgroundProps) {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-[#08080a]">
      {/* Base — near-black with the faintest warm-neutral tint */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0c] via-[#08080a] to-[#060608]" />

      {/* Barely perceptible luminance variation — not a gradient, just depth */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(255,255,255,0.012), transparent 60%)',
        }}
      />

      {/* Microscopic film grain — gives the surface texture without color */}
      <div
        className="absolute inset-0 opacity-[0.012] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' /%3E%3C/svg%3E")`,
        }}
      />

      {/* Gentle edge vignette — depth framing only */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 120% 90% at 50% 30%, transparent 50%, rgba(0,0,0,0.3) 100%)',
        }}
      />
    </div>
  );
}
