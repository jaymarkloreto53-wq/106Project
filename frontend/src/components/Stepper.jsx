const STEPS = ["Traveler details", "Review", "Payment", "Confirmed"];

// Progress bar for the booking flow. `current` is 1-4.
export default function Stepper({ current }) {
  return (
    <ol className="stepper" aria-label="Booking progress">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "todo";
        return (
          <li key={label} className={state} aria-current={n === current ? "step" : undefined}>
            <span className="step-dot">{state === "done" ? "✓" : n}</span>
            <span className="step-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
