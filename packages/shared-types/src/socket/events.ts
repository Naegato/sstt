// Client → Server
export const CLIENT_EVENTS = {
  JOIN_ROOM: "room:join",
  LEAVE_ROOM: "room:leave",
  START_GAME: "game:start",
  PLAY_CARD: "game:play-card",
  END_TURN: "game:end-turn",
  CAST_VOTE: "game:cast-vote",
  STEAL_PLAYED_CARD: "game:steal-played-card",
  PASS_HOT_POTATO: "game:pass-hot-potato",
  CONFIRM_MANUAL_ACTION: "game:confirm-manual-action",
  CHALLENGE_ELIMINATION: "game:challenge-elimination",
  RESET_GAME: "game:reset",
  SUBMIT_CHOICE: "game:submit-choice",
  TOGGLE_NOSE_TOUCH: "game:toggle-nose-touch",
  SLAP_HAND: "game:slap-hand",
  CHAT: "chat:message",
} as const;

// Server → Client
export const SERVER_EVENTS = {
  ROOM_JOINED: "room:joined",
  PLAYER_JOINED: "player:joined",
  PLAYER_LEFT: "player:left",
  GAME_STATE_UPDATE: "game:state-update",
  GAME_OVER: "game:over",
  ERROR: "error:message",
} as const;

export type ClientEvent = (typeof CLIENT_EVENTS)[keyof typeof CLIENT_EVENTS];
export type ServerEvent = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS];
