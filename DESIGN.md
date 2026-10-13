# Garden visual system

<!-- impeccable:design-schema 1 -->

## Direction

Garden is a confident, file-centric team workspace for a team lead. It borrows the functional clarity of modern cloud storage products — a bright blue action language, roomy white canvas, compact list rows, and strong navigation — without copying Dropbox branding, artwork, or UI assets.

## Operating mode

Operate. The interface should let a leader scan work, people and risk quickly, then move directly into the relevant record.

## Visual language

- **Palette:** Garden blue is the single action color; cobalt navy, cloud gray, ink, white and semantic status colors complete the system.
- **Typography:** Roboto is the single family for UI and display roles, loaded in `index.html` (400/500/600/700) and exposed as `--font-ui`, `--font-display` and `--font-mono` tokens. Hierarchy comes from size and weight, with a tight, confident heading scale. Sentence case and high contrast replace decorative labels.
- **Structure:** a dark-blue primary rail, bright utility header, and an expansive white content canvas. Lists are the default information container; elevated cards are reserved for focused groups and dialogs.
- **Controls:** squared-soft 10–14px corners, clear borders, blue filled primary actions, and concise icon-plus-label affordances.
- **Navigation:** sections feel like a workspace library: obvious active location, predictable hierarchy, unobtrusive secondary navigation.
- **Motion:** one quiet content-enter transition and responsive state transitions. Reduced-motion users receive immediate state changes.

## Responsive behavior

Desktop keeps the navigation rail visible and gives leadership views a broad working canvas. Tablet and mobile collapse navigation into the existing menu; page spacing, grids and rows reduce without changing tasks or information order.

## Accessibility

All body text and interaction states meet contrast requirements. Keyboard focus uses a visible blue ring, controls retain semantic labels, and motion respects `prefers-reduced-motion`.
