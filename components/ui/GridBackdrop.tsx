export function GridBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
      style={{
        backgroundImage:
          "linear-gradient(rgba(90,140,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(90,140,255,0.05) 1px, transparent 1px)",
        backgroundSize: "26px 26px",
        maskImage: "radial-gradient(120% 80% at 50% 0%, #000 40%, transparent 100%)",
        WebkitMaskImage: "radial-gradient(120% 80% at 50% 0%, #000 40%, transparent 100%)",
      }}
    />
  );
}
