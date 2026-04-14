// ============================================================================
// CONFIGURATION — All tunable rules in one place
// Shared by engine.ts and prediction.ts (avoids circular imports)
// ============================================================================

export const SIM_CONFIG = {
  RESTROOM_VISITS_PER_DAY: 5,
  RESTROOM_DURATION_MIN: 3,
  RESTROOM_DURATION_MAX: 10,
  WORK_DAY_START: 360, // 6 AM
  WORK_DAY_END: 1080,  // 6 PM
  ALL_HANDS_TIME: 780,  // 1 PM
  ALL_HANDS_DURATION: 10,
  LOUNGE_PROBABILITY: 0.000001,
};

export const MEETING_RULES = {
  attendeesMin: 2,
  attendeesMax: 4,
  durations: [5, 15] as number[],
  boundaryInterval: 5,
  roomIds: ['MEET-001', 'MEET-002'],
};

export const JANITORIAL_RULES = {
  cleaningThreshold: 20,
  dirtyThreshold: 25,
  cleaningDuration: 5,
  scheduledCleanTime: 1020,
  janitorClosetId: 'JAN-CLOSET',
  restroomIds: ['REST-001', 'REST-002'],
};
