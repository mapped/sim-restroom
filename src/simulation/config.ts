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
  durations: [15, 30, 45, 60] as number[], // 15 min to 1 hour
  slotInterval: 30,          // Schedule slots every 30 minutes
  meetingWindowStart: 540,   // 9:00 AM — first meeting can start here
  meetingWindowEnd: 1020,    // 5:00 PM — last meeting must end by here
  emptySlotProbability: 0.3, // 30% chance a slot has no meeting
  roomIds: ['MEET-001', 'MEET-002'],
  // Guest settings (applied to most meetings)
  guestProbability: 0.85,    // 85% of meetings have external guests
  guestCountMin: 1,
  guestCountMax: 3,
  guestArrivalLeadTime: 5,   // MEETING_GUEST arrives this many sim-minutes before meeting start
};

export const JANITORIAL_RULES = {
  cleaningThreshold: 20,
  dirtyThreshold: 25,
  cleaningDuration: 5,
  scheduledCleanTime: 1020,
  janitorClosetId: 'JAN-CLOSET',
  restroomIds: ['REST-001', 'REST-002'],
};

export const LIFECYCLE_RULES = {
  // Employee arrival window: 6:00 AM - 9:00 AM
  employeeArrivalStart: 360,
  employeeArrivalEnd: 540,
  // Employee departure window: 4:00 PM - 6:00 PM
  employeeDepartureStart: 960,
  employeeDepartureEnd: 1080,
  // Building entrance (grid coordinates)
  entryPoint: { x: 24, y: 38 },
  lobbyId: 'LOBBY',
  // Guest parameters
  maxGuests: 20,
  guestSpawnProbability: 0.00002,   // per tick, scales with speedMultiplier
  guestStayMin: 30,                  // minutes
  guestStayMax: 120,
  // Guest work day (when guests can appear)
  guestWindowStart: 480,  // 8 AM
  guestWindowEnd: 1020,   // 5 PM
};
