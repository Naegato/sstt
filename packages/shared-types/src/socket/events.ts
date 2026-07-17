// Client → Server
export const CLIENT_EVENTS = {
  JOIN_ROOM: "room:join",
  LEAVE_ROOM: "room:leave",
  PLAY_CARD: "game:play-card",
  CONFIRM_MANUAL_ACTION: "game:confirm-manual-action",
  CHALLENGE_ELIMINATION: "game:challenge-elimination",
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
