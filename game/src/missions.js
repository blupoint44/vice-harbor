// Vice Harbor — the mission chain. Three scripted jobs offered in sequence
// by "Marina Vale", a fixer who works the harbour bars. Each mission is a
// small state machine: stages with a world target, an optional timer and a
// cash payout. main.js drives the machines; this file only describes them.

export const STORY_INTRO = 'Marina Vale runs the harbour. Do her jobs, earn her trust.';
export const STORY_DONE = 'Marina: "The harbour is yours now, kid. Stay shiny." — Free roam.';

export const MISSIONS = [
  {
    id: 'delivery',
    title: 'Sunset Delivery',
    giver: 'Marina Vale',
    brief: 'Pick up the package by the west garages and drop it at the pier kiosk. Clock is ticking.',
    pay: 450,
    stages: [
      { kind: 'pickup', label: 'Pick up the package', target: { x: -124, z: 44 }, radius: 6, needsCar: false },
      { kind: 'deliver', label: 'Deliver it to the pier kiosk', target: { x: 196, z: 4 }, radius: 7, needsCar: false, timer: 100 },
    ],
  },
  {
    id: 'escape',
    title: 'Hot Harbour',
    brief: 'Meet Marina at the casino corner — the drop will go loud. Then reach the Hideout Garage on the west wall.',
    pay: 650,
    wantedOnStart: 2,
    offerTarget: { x: 44, z: -44 },
    stages: [
      { kind: 'reach', label: 'Escape to the Hideout Garage', target: { x: -140, z: -22 }, radius: 8, needsCar: false },
    ],
  },
  {
    id: 'checkpoints',
    title: 'Neon Run',
    brief: 'One car, five neon gates, no excuses. Hit every gate before the timer dies.',
    pay: 800,
    stages: [
      { kind: 'checkpoint', label: 'Gate 1 of 5 — harbour boulevard', target: { x: 132, z: -88 }, radius: 8, needsCar: true, timer: 150 },
      { kind: 'checkpoint', label: 'Gate 2 of 5 — north crossing', target: { x: 44, z: -132 }, radius: 8, needsCar: true },
      { kind: 'checkpoint', label: 'Gate 3 of 5 — casino corner', target: { x: -44, z: -44 }, radius: 8, needsCar: true },
      { kind: 'checkpoint', label: 'Gate 4 of 5 — south palms', target: { x: -88, z: 88 }, radius: 8, needsCar: true },
      { kind: 'checkpoint', label: 'Gate 5 of 5 — finish at the pier', target: { x: 150, z: 4 }, radius: 9, needsCar: true },
    ],
  },
];

// Creates the runtime state for one mission instance.
export function startMission(index) {
  const def = MISSIONS[index];
  if (!def) return null;
  return {
    index,
    def,
    stage: 0,
    timeLeft: def.stages[0].timer || 0,
    active: true,
  };
}

// The current stage definition of a running mission, or null.
export function currentStage(state) {
  if (!state || !state.active) return null;
  return state.def.stages[state.stage] || null;
}

// Advances a mission after its current stage completes.
// Returns 'stage' when a next stage begins, 'done' when the mission ends.
export function advanceMission(state) {
  state.stage += 1;
  if (state.stage >= state.def.stages.length) {
    state.active = false;
    return 'done';
  }
  const next = state.def.stages[state.stage];
  if (next.timer) state.timeLeft = next.timer;
  return 'stage';
}
