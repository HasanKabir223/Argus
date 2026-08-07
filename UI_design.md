# UI Design Spec — Checkpoint-Based Missing Person Matching Dashboard
### For use with AI coding tools (Antigravity, Cursor, etc.)

---

## 0. One-line brief for the AI tool

Build a dark, data-dense, real-time operations dashboard for a missing-person checkpoint matching system — visually in the spirit of Palantir Gotham / a military-grade intelligence ops center, but for a humanitarian use case. The hero screen is a rotating 3D globe showing checkpoints and sighting trails; a secondary detail view shows a 2D map, ranked match list, and event timeline.

---

## 1. Project Context (give this to the AI so it understands *why*, not just *what*)

This is a hackathon prototype for a **checkpoint-based missing person face-matching system**. Fixed "checkpoints" (simulated CCTV locations — train station, bus stand, police post) run face detection + embedding + similarity search against a small reference database of missing persons. When a match is found above a confidence threshold, it's logged with location + timestamp and shown on this dashboard for **human review** — the system flags candidates, a human confirms, nothing is automated end-to-end.

**Tone the UI needs to convey:** serious, operational, trustworthy, precise — like software built for people making real decisions under time pressure. Not playful, not "startup SaaS," not consumer-app friendly. Think: mission control, not a to-do list app.

**Ethical framing the UI must visually reinforce:** this is checkpoint-based (discrete locations, discrete events), not continuous surveillance. Every match shown must carry a confidence score and a "pending review" / "confirmed" / "dismissed" state — the UI should never present a match as an automatic, final identification.

---

## 2. Design Tokens (the AI tool should derive everything from these)

**Color palette** — dark operational theme, not generic "dark mode":
- `--bg-void: #0A0E14` — near-black base, slightly blue-shifted (not pure black — pure black reads as cheap dark mode)
- `--bg-panel: #12161F` — panel/card background, one step up from void
- `--bg-panel-raised: #1A2029` — hover/active panel state
- `--border-hairline: #262D3A` — subtle structural dividers
- `--text-primary: #E8ECF1` — main text, not pure white
- `--text-secondary: #8892A0` — labels, metadata, timestamps
- `--accent-signal: #00D9A3` — the ONE accent color: a cold, precise teal-green used ONLY for active/confirmed/positive states (a "signal detected" color, not decorative)
- `--accent-alert: #FF4757` — reserved strictly for high-priority alerts / new unconfirmed matches — use sparingly so it retains urgency
- `--accent-muted: #3D4759` — inactive checkpoints, dimmed states

**Typography:**
- Display/headers: a geometric monospace or semi-monospace face (e.g. **JetBrains Mono**, **IBM Plex Mono**, or **Space Mono**) — monospace is the deliberate signature choice here: it reads as "data system," not "product." Use restraint — headers and key numbers only, not body paragraphs.
- Body/UI text: a clean grotesque sans (e.g. **Inter** or **IBM Plex Sans**) for labels, descriptions, panel content
- Data/numeric readouts (coordinates, confidence %, timestamps): same monospace as display, tabular-nums, so numbers align in columns

**Layout concept:**
- Full-bleed dark canvas, no page margins/whitespace padding like a marketing site — this is a control room, not a landing page
- Persistent thin top bar: system name, live status indicator (pulsing dot + "SYSTEM ACTIVE"), current time (live-updating, monospace)
- Left or right-docked panel for the ranked match list — collapsible, not modal
- Bottom-docked horizontal timeline strip — always visible, this is a signature structural element (see below)
- Hairline 1px borders between all major regions (`--border-hairline`), zero drop-shadows, zero border-radius on structural panels (small radius like 2-4px is fine for buttons/badges only) — sharp edges reinforce the "instrument panel" feel over "consumer app" feel

**Signature element (the one memorable thing):** the animated arc trail on the 3D globe — a glowing dash that visibly travels along the arc path when a person's sighting history is selected, like a signal propagating across the earth. This is the single moment worth spending visual "budget" on; everything else stays disciplined and quiet around it.

---

## 3. Screens / Views

### 3.1 Hero View — 3D Globe (default landing screen)
- Full-viewport rotating globe, dark "night lights" earth texture
- Checkpoint locations rendered as small pulsing points (color = `--accent-muted` when idle, `--accent-alert` briefly when a new match just landed, settling to `--accent-signal` once acknowledged)
- Top bar overlays the globe (semi-transparent panel background, not a solid bar, so the globe reads as the primary surface)
- Bottom timeline strip overlays the globe similarly
- When a person is selected (from the match list or by clicking a pin), animated arcs draw between every checkpoint where they were sighted, in chronological order, with the traveling-dash animation
- Idle state: globe auto-rotates slowly; stops rotating on user interaction (drag to orbit, scroll to zoom)
- Empty state (no matches yet): globe still shows checkpoints, a small caption near the bottom: "No active matches. Checkpoints are live and monitoring." — not a blank void, the system should always look "alive"

### 3.2 Match List Panel (docked side panel)
- Header: "ACTIVE MATCHES" with a live count badge
- Each list item: thumbnail (matched face crop) + person ID/name + checkpoint name + confidence score (large, monospace, color-coded: `--accent-signal` if above threshold, dimmed if borderline) + relative timestamp ("2 min ago")
- Status badge per item: `PENDING REVIEW` / `CONFIRMED` / `DISMISSED` — pending should visually stand out (subtle pulse or `--accent-alert` edge) since that's the actionable state
- Click an item → selects that person on the globe (triggers the arc animation) and opens the detail view

### 3.3 Detail View (modal panel or slide-over, not full page navigation — keep context on the globe behind it)
- Side-by-side: reference photo vs. matched checkpoint photo
- Confidence score, large and prominent, with a simple visual meter (not a gimmicky gauge — a clean horizontal bar is enough)
- Checkpoint name, coordinates, exact timestamp
- Action buttons: `Confirm Match` / `Dismiss` / `Flag for Manual Review` — these should look like deliberate, weighty actions (not default browser-style buttons), since confirming a match is a serious action in the real system

### 3.4 2D Operational Map (secondary tab/toggle from the globe)
- Standard dark-styled map (Leaflet/Mapbox dark theme, matching the token palette)
- Same checkpoint pins, same color logic as the globe
- Better suited for "zoom into one checkpoint's exact detail" than the globe — position this as the tactical/detail view, globe as the strategic/overview view

### 3.5 Timeline Strip (persistent, bottom-docked, visible on all views)
- Horizontal scrubber spanning a time range (e.g. last 24 hours, or full session)
- Each match event = a small dot/tick at its timestamp position
- Dragging or clicking scrubs the globe/map to show only matches up to that point in time — this is what lets someone "replay" how sightings accumulated
- Live edge on the right = "now," with a subtle pulse to show the system is live

---

## 4. Interaction / Motion Notes

- Motion should feel like instrumentation, not decoration: value changes tick/update crisply, no bouncy easing, no playful spring physics
- The globe's arc-drawing animation on person-selection is the one place to let motion be a little more expressive (the "traveling light" effect) — everywhere else, keep transitions fast (150-200ms) and linear/ease-out
- New match arriving live: a brief pulse on the relevant checkpoint pin + a subtle slide-in of the new list item — enough to catch the eye without being alarmist/gamey
- Respect reduced-motion preferences: fall back to instant state changes, no arc animation, just static highlighted paths

---

## 5. Copy / Voice Guidelines

- Plain, operational language. "Confirm Match," not "Yes, that's them!" — this is instrument-panel language, not consumer-app language
- Status labels are factual, not editorialized: `PENDING REVIEW`, not `Needs Your Attention!`
- Empty/idle states describe system status factually: "No active matches. Checkpoints are live and monitoring." — never apologetic, never cutesy
- Never use language that implies full automation or certainty the system doesn't have — always "match," "candidate," "flagged," never "identified" or "confirmed" until a human has actually confirmed it in-app

---

## 6. Explicit Instructions for the AI Coding Tool

1. Use `react-globe.gl` for the 3D globe (arcs, points, dark earth texture) — do not attempt to hand-roll a WebGL globe.
2. Use Leaflet or Mapbox GL (dark style) for the secondary 2D map.
3. Derive every color from the token list in Section 2 — no default Tailwind/Material blues, no default dark-mode grays.
4. Use the monospace/sans pairing described in Section 2 deliberately — headers and data in monospace, body/UI copy in the sans face. Don't use the same font family for everything.
5. Zero border-radius on structural panels; small radius (2-4px) only on buttons/badges/pills.
6. No drop shadows for elevation — use the panel background steps (`--bg-panel` → `--bg-panel-raised`) and hairline borders instead.
7. Build responsive down to a reasonable laptop demo size at minimum; mobile responsiveness is not a priority for this hackathon demo.
8. Keep the timeline strip and top status bar persistent across all views — they anchor the "control room" feel.
9. Do not add decorative animation beyond what's specified — restraint is part of the brief, not an oversight.

---

## 7. Tips for Vibe Coding This Well

- **Feed it this doc, plus the PRD, in the same session** — the AI tool builds a much more coherent UI when it understands the underlying system (checkpoints, confidence thresholds, human-review flow) rather than just styling instructions in isolation.
- **Build screen by screen, not all at once.** Start with the globe view alone, get it looking right, then add the match list panel, then the detail view, then the timeline. A single giant prompt for the whole dashboard tends to produce something generic; iterating screen-by-screen lets you correct drift early.
- **Paste in the design tokens as actual CSS variables early** (Section 2), before asking for any screen — this anchors the AI to your palette instead of it defaulting to a generic dark-mode blue/purple theme.
- **Ask it to explain its component structure before generating a lot of code**, especially for the globe + map + panel layout — catching a wrong architecture (e.g. globe and map as separate pages instead of a toggle within one persistent shell) early saves a lot of rework.
- **Be specific about what NOT to do.** "Don't use a gradient hero," "don't use rounded cards with drop shadows," "don't add a sidebar nav with icons" — AI design tools default hard to generic SaaS-dashboard patterns unless explicitly told not to.
- **Use real (or realistic fake) data from the start**, not lorem-ipsum placeholders — plug in your actual checkpoint names/coordinates and sample match data early so the UI is styled against content that looks like your real demo, not generic placeholder text that'll look different once real data goes in.
- **Screenshot and iterate.** After each screen, look at it critically against Section 2's tokens — ask "does this look like a template, or does it look like this specific system?" If it looks templated, say exactly what feels generic and ask for a revision, rather than accepting the first pass.
- **Save your best prompts.** When a prompt produces a screen you like, keep it — you'll likely need near-identical phrasing again when asking for a new screen to stay visually consistent with the first.
