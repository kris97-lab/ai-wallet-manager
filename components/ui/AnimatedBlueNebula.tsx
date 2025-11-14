export function AnimatedBlueNebula() {
  return (
    <div className="pointer-events-none relative h-full w-full overflow-hidden bg-[#0a1b3a]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(26,64,124,0.55),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(106,168,255,0.4),transparent_65%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(10,27,58,0.95),rgba(15,47,93,0.65)_40%,rgba(27,63,124,0.55)_70%,rgba(106,168,255,0.25))]" />

      <div
        className="absolute -top-1/3 left-[-20%] h-[70%] w-[60%] animate-[nebulaPulse_18s_ease-in-out_infinite_alternate] rounded-full bg-[radial-gradient(circle,rgba(106,168,255,0.45),transparent_70%)] blur-3xl"
        style={{ willChange: 'transform, opacity' }}
      />
      <div
        className="absolute -bottom-1/3 right-[-15%] h-[70%] w-[55%] animate-[nebulaDrift_22s_linear_infinite] rounded-full bg-[radial-gradient(circle,rgba(27,63,124,0.55),transparent_72%)] blur-3xl"
        style={{ willChange: 'transform, opacity' }}
      />
      <div
        className="absolute top-1/4 right-[-10%] h-[55%] w-[50%] animate-[nebulaGlow_26s_ease-in-out_infinite] rounded-full bg-[radial-gradient(circle,rgba(111,166,255,0.35),transparent_75%)] blur-2xl"
        style={{ willChange: 'transform, opacity' }}
      />
      <div
        className="absolute left-1/4 top-1/3 h-[40%] w-[35%] animate-[nebulaTwinkle_12s_ease-in-out_infinite] rounded-full bg-[radial-gradient(circle,rgba(14,58,120,0.45),transparent_70%)] blur-2xl opacity-70"
        style={{ willChange: 'transform, opacity' }}
      />
    </div>
  );
}
