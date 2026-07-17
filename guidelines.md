# 🎴 Card Game — Technical Guidelines

> **Version:** 1.0.0  
> **Last Updated:** July 2026  
> **Stack:** Bun + Turborepo + Next.js (Frontend) + Fastify (Backend) + Socket.io + Event Sourcing + Deterministic Testing  
> **Language:** TypeScript (strict mode everywhere)

---

## Table of Contents

1. [Why This Guide?](#1-why-this-guide)
2. [Tech Stack Rationale](#2-tech-stack-rationale)
3. [Project Architecture](#3-project-architecture)
4. [Shared-Types Library](#4-shared-types-library)
5. [Backend (apps/server)](#5-backend-appsserver)
6. [Frontend (apps/web)](#6-frontend-appsweb)
7. [Testing Strategy](#7-testing-strategy)
8. [Event Sourcing & Replay System](#8-event-sourcing--replay-system)
9. [Coding Conventions](#9-coding-conventions)
10. [Directory Layout](#10-directory-layout)
11. [CI/CD & Automation](#11-cicd--automation)
12. [Glossary](#12-glossary)

---

## 1. Why This Guide?

This document is the **single source of truth** for the project. It serves two audiences:

| Audience | Purpose |
|---|---|
| **Human Developers** | onboarding, architecture decisions, coding standards, onboarding |
| **AI Agents** | autonomous decision-making, consistent code generation, adherence to conventions |

Every technical decision, folder structure rule, and coding standard mentioned here **must be respected** by all contributors — human or artificial.

> **⚠️ Rule for AI Agents:** Before making any code change, read this file. Do not contradict its decisions. If a situation is not covered, propose an amendment in a pull request instead of improvising.

---

## 2. Tech Stack Rationale

### 2.1 Why Bun?

| Criterion | Bun | npm | pnpm | yarn |
|---|---|---|---|---|
| Installation speed | ⚡ 5–10x faster | 🐢 Slow | Fast | Fast |
| Runtime (bunx) | Native, fast | Node, slower | Node, slower | Node, slower |
| Package manager | Drop-in npm compatible | Baseline | Good | Good |
| Test runner (bun:test) | Built-in, fastest | Jest/Vitest | Jest/Vitest | Jest/Vitest |
| Registry | npm compatible | npm | npm | npm |

**Decision:** Bun is used as both the **package manager** AND the **runtime** (`bun run dev`, `bun test`, `bunx`). It is a drop-in replacement for npm scripts and is npm-compatible.

**Installation:**
```bash
curl -fsSL https://bun.sh/install | bash
```

### 2.2 Why Turborepo?

Turborepo is the build system orchestrator for the monorepo. It provides:

- **Smart caching:** Build outputs are cached; unchanged packages skip rebuilds.
- **Parallel execution:** Tasks across packages run in parallel where possible.
- **Remote caching (optional):** Vercel Remote Cache or Turso for team-wide caching.
- **Task orchestration:** `lint`, `test`, `build` run across all packages with a single command.

**Installation (global):**
```bash
bunx turbo --version  # Should show 2.x+
```

### 2.3 Why Next.js (Frontend)?

- **React Server Components (RSC):** For dashboard, matchmaking, profile pages.
- **Client Components:** For the real-time game board (client-heavy).
- **Built-in WebSocket fallback:** Next.js handles HTTP/1.1, SSE, and can proxy Socket.io.
- **TypeScript-first:** Native TS support with strict mode.

**Version:** Next.js 15 (latest stable).

### 2.4 Why Fastify (Backend)?

| Criterion | Fastify | Express | NestJS |
|---|---|---|---|
| Performance (req/sec) | ⚡⚡⚡ ~50k+ | 🐢 ~20k | 🐢 ~15k |
| JSON serialization | Schema-compiled (fast-json-stringify) | JSON.stringify (slow) | JSON.stringify |
| Validation | Native JSON Schema + ajv | Manual/middleware | Class-validator |
| Type safety | Full via schemas & generics | None natively | Partial (decorators) |
| Plugin ecosystem | Rich, modular | Rich but old | Rigid DI |
| Opinionation | Low (flexible) | Very low | High (opinionated) |

**Why not NestJS?**  
NestJS enforces a rigid dependency-injection architecture that adds boilerplate and couples your game logic to its runtime. For a game server where you need **direct control over the event loop and WebSocket handling**, Fastify is the right balance of performance and ergonomics.

**Why not Express?**  
Express is slow, lacks built-in validation, and has no schema compilation. It is the legacy choice. We are building for performance.

### 2.5 Why Socket.io?

- **Fallback transport:** Automatically falls back from WebSocket to HTTP long-polling if WebSocket is blocked (corporate firewalls, certain proxies).
- **Room management:** Native support for game rooms (`socket.join(roomId)`).
- **Acknowledgement patterns:** For request/response over WebSocket (`socket.emitWithAck`).
- **Broadcasting:** Easy room-wide state updates.
- **Middleware:** Auth middleware per connection.

**Alternative considered:** Raw WebSocket via `ws` library. Rejected because fallback + room management are essential for a card game with casual players.

### 2.6 Why Event Sourcing?

Event Sourcing is the architecture pattern where the state of the game is **reconstructed by replaying a sequence of events** rather than storing the current state directly.

**Benefits for this project:**
1. **Replay is free:** If your game is deterministic, replaying events from tick 0 produces the same result. Replay is a first-class feature.
2. **Debugging:** Any bug can be reproduced by replaying the exact event sequence.
3. **Undo/redo:** Easy to implement for game clients.
4. **Audit trail:** Full history of every game action.
5. **Determinism guarantee:** The game engine is pure; tests verify it by replaying events and comparing outputs.

---

## 3. Project Architecture

### 3.1 Monorepo Structure

```
card-game/
├── apps/
│   ├── server/          # Fastify backend (game engine, WebSocket, REST API)
│   └── web/             # Next.js frontend (UI, game board, matchmaking)
├── packages/
│   └── shared-types/    # Shared TypeScript types, event schemas, utilities
├── turbo.json           # Turborepo configuration
├── package.json         # Root workspace config
├── bun.lockb            # Bun lockfile (do NOT use package-lock.json or yarn.lock)
└── README.md
```

### 3.2 Data Flow Architecture

```
[Player Browser]
      │
      │ WebSocket (Socket.io)
      │ HTTP (REST for auth/lobby)
      ▼
[Next.js Web App]
      │ (only for matchmaking, profile, leaderboards)
      │ (game rendering is fully client-side after room join)
      ▼
[Fastify Server] ◄────────────────── [Event Store]
      │                                │
      │ Events (game actions)          │ Append
      ▼                                │
[Game Engine] ─────────────────────────┘
(pure TypeScript, no I/O)
      │
      │ State snapshots + events
      ▼
[Socket.io Broadcast]
      │
      ▼
[All Players in Room]
```

### 3.3 Key Architectural Principle: The Game Engine is Pure

The **core game logic** (card effects, turn order, win conditions, damage calculation) MUST be a **pure function**:

```
Input:  CurrentGameState + GameEvent → Output: NewGameState + SideEffects
```

**No side effects inside the game engine.** No Socket.io, no database, no API calls. This enables:
- Deterministic testing (replay the same event → same result)
- Replay system (just replay events from the event store)
- Independent testing without needing a running server

Side effects (broadcasting, persistence) are handled in the **Fastify service layer**, which calls the engine and then dispatches side effects.

---

## 4. Shared-Types Library

**Location:** `packages/shared-types/`

### 4.1 Purpose

Every type, event schema, and utility shared between frontend and backend lives here. This is the **contract** between client and server.

### 4.2 Required Exports

```
packages/shared-types/
├── src/
│   ├── events/
│   │   ├── index.ts              # All event type unions
│   │   ├── player-joined.ts      # Example event type
│   │   ├── card-played.ts        # Example event type
│   │   └── ...
│   ├── game/
│   │   ├── types.ts              # GameState, Player, Card, etc.
│   │   └── constants.ts          # MAX_PLAYERS, DECK_SIZE, etc.
│   ├── socket/
│   │   └── events.ts             # Client ↔ Server socket event names
│   └── index.ts                  # Barrel export
├── tests/
│   └── event-serialization.test.ts  # Verify events are JSON-serializable
├── package.json
└── tsconfig.json
```

### 4.3 Types Example

```typescript
// packages/shared-types/src/game/types.ts

export type CardId = string; // e.g. "laser-blue-01"
export type PlayerId = string;
export type RoomId = string;

export type Card = {
  id: CardId;
  name: string;
  type: 'attack' | 'defense' | 'special';
  damage?: number;
  cost: number;
  description: string;
};

export type Player = {
  id: PlayerId;
  name: string;
  health: number;
  hand: Card[];
  deck: Card[];
  energy: number;
  maxEnergy: number;
};

export type GameState = {
  roomId: RoomId;
  turn: number;
  currentPlayerId: PlayerId;
  players: Player[];
  deck: Card[];
  discardPile: Card[];
  phase: 'lobby' | 'playing' | 'ended';
  winner?: PlayerId;
};

export type GameResult = 'win' | 'lose' | 'draw';
```

### 4.4 Event Types Example

```typescript
// packages/shared-types/src/events/index.ts

import { CardId, PlayerId } from '../game/types';

export type GameEvent =
  | PlayerJoinedEvent
  | CardPlayedEvent
  | TurnEndedEvent
  | GameStartedEvent
  | GameEndedEvent;

export type PlayerJoinedEvent = {
  type: 'PLAYER_JOINED';
  playerId: PlayerId;
  playerName: string;
  timestamp: number;
};

export type CardPlayedEvent = {
  type: 'CARD_PLAYED';
  playerId: PlayerId;
  cardId: CardId;
  targetId?: PlayerId;
  timestamp: number;
};

export type TurnEndedEvent = {
  type: 'TURN_ENDED';
  playerId: PlayerId;
  timestamp: number;
};

export type GameStartedEvent = {
  type: 'GAME_STARTED';
  timestamp: number;
};

export type GameEndedEvent = {
  type: 'GAME_ENDED';
  winnerId: PlayerId;
  timestamp: number;
};

// Event validation schema (for Fastify + ajv)
export const GAME_EVENT_SCHEMA = {
  type: 'object',
  oneOf: [
    { $ref: '#/$defs/PlayerJoinedEvent' },
    { $ref: '#/$defs/CardPlayedEvent' },
    { $ref: '#/$defs/TurnEndedEvent' },
    { $ref: '#/$defs/GameStartedEvent' },
    { $ref: '#/$defs/GameEndedEvent' },
  ],
  $defs: {
    PlayerJoinedEvent: {
      type: 'object',
      properties: {
        type: { const: 'PLAYER_JOINED' },
        playerId: { type: 'string' },
        playerName: { type: 'string' },
        timestamp: { type: 'number' },
      },
      required: ['type', 'playerId', 'playerName', 'timestamp'],
      additionalProperties: false,
    },
    CardPlayedEvent: {
      type: 'object',
      properties: {
        type: { const: 'CARD_PLAYED' },
        playerId: { type: 'string' },
        cardId: { type: 'string' },
        targetId: { type: 'string' },
        timestamp: { type: 'number' },
      },
      required: ['type', 'playerId', 'cardId', 'timestamp'],
      additionalProperties: false,
    },
    TurnEndedEvent: {
      type: 'object',
      properties: {
        type: { const: 'TURN_ENDED' },
        playerId: { type: 'string' },
        timestamp: { type: 'number' },
      },
      required: ['type', 'playerId', 'timestamp'],
      additionalProperties: false,
    },
    GameStartedEvent: {
      type: 'object',
      properties: {
        type: { const: 'GAME_STARTED' },
        timestamp: { type: 'number' },
      },
      required: ['type', 'timestamp'],
      additionalProperties: false,
    },
    GameEndedEvent: {
      type: 'object',
      properties: {
        type: { const: 'GAME_ENDED' },
        winnerId: { type: 'string' },
        timestamp: { type: 'number' },
      },
      required: ['type', 'winnerId', 'timestamp'],
      additionalProperties: false,
    },
  },
};
```

### 4.5 Socket Events

```typescript
// packages/shared-types/src/socket/events.ts

// Client → Server
export const CLIENT_EVENTS = {
  JOIN_ROOM: 'room:join',
  LEAVE_ROOM: 'room:leave',
  PLAY_CARD: 'game:play-card',
  END_TURN: 'game:end-turn',
  CHAT: 'chat:message',
} as const;

// Server → Client
export const SERVER_EVENTS = {
  ROOM_JOINED: 'room:joined',
  PLAYER_JOINED: 'player:joined',
  GAME_STATE_UPDATE: 'game:state-update',
  CARD_PLAYED: 'game:card-played',
  TURN_CHANGED: 'game:turn-changed',
  GAME_OVER: 'game:over',
  ERROR: 'error:message',
} as const;

export type ClientEvent = typeof CLIENT_EVENTS[keyof typeof CLIENT_EVENTS];
export type ServerEvent = typeof SERVER_EVENTS[keyof typeof SERVER_EVENTS];
```

### 4.6 Package.json for shared-types

```json
{
  "name": "@card-game/shared-types",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./events": "./src/events/index.ts",
    "./game": "./src/game/types.ts",
    "./socket": "./src/socket/events.ts"
  },
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

---

## 5. Backend (apps/server)

**Location:** `apps/server/`  
**Runtime:** Bun (`bun run dev`, `bun run build`, `bun test`)  
**Framework:** Fastify 5.x  
**WebSocket:** @fastify/websocket + Socket.io (for fallback transport)  
**Validation:** Fastify JSON Schema + ajv

### 5.1 Directory Structure

```
apps/server/
├── src/
│   ├── index.ts              # Entry point: Fastify server bootstrap
│   ├── app.ts                # Fastify instance configuration
│   ├── config/
│   │   └── env.ts            # Environment variable validation (zod or joi)
│   ├── plugins/
│   │   ├── socket.ts         # Socket.io plugin registration
│   │   └── cors.ts           # CORS configuration
│   ├── services/
│   │   ├── room-manager.ts   # Room lifecycle, player management
│   │   └── game-service.ts   # Orchestrates game engine + broadcasting
│   ├── engine/
│   │   ├── index.ts          # Pure game engine entry
│   │   ├── state.ts          # State machine (lobby → playing → ended)
│   │   ├── cards.ts          # Card effect logic
│   │   ├── turns.ts          # Turn management
│   │   └── damage.ts         # Damage calculation
│   ├── events/
│   │   ├── dispatcher.ts     # Event store append + broadcast
│   │   └── replay.ts         # Event replay for state reconstruction
│   ├── routes/
│   │   ├── auth.ts           # Login, register, token generation
│   │   └── rooms.ts          # REST endpoints for lobby/matchmaking
│   └── types/
│       └── fastify.ts        # Fastify type augmentation
├── tests/
│   ├── engine/
│   │   └── engine.test.ts    # Pure engine tests (bun:test)
│   ├── integration/
│   │   └── game-flow.test.ts # Full game flow tests
│   └── helpers/
│       └── fixtures.ts       # Test fixtures: mock events, mock players
├── package.json
├── tsconfig.json
├── fastify.config.ts
└── .env.example
```

### 5.2 Server Entry Point

```typescript
// apps/server/src/index.ts

import { app } from './app.js';
import { config } from './config/env.js';

async function start() {
  try {
    await app.listen({
      port: config.PORT,
      host: '0.0.0.0',
    });
    console.log(`🚀 Server ready at http://localhost:${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
```

### 5.3 Fastify App Configuration

```typescript
// apps/server/src/app.ts

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { websocketPlugin } from './plugins/socket.js';
import authRoutes from './routes/auth.js';
import roomRoutes from './routes/rooms.js';

export const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
  credentials: true,
});

await app.register(websocketPlugin);

await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(roomRoutes, { prefix: '/api/rooms' });

// Health check
app.get('/health', async () => ({ status: 'ok', timestamp: Date.now() }));
```

### 5.4 Pure Game Engine (Core Principle)

The engine must never import anything from `fastify`, `socket.io`, or any I/O module.

```typescript
// apps/server/src/engine/index.ts

import { GameState, Player, Card } from '@card-game/shared-types';
import { GameEvent } from '@card-game/shared-types';
import { createInitialState } from './state.js';
import { applyCardEffect } from './cards.js';
import { advanceTurn } from './turns.js';

export type EngineResult = {
  state: GameState;
  sideEffects: SideEffect[];
};

export type SideEffect =
  | { type: 'DAMAGE_DEALT'; targetId: string; amount: number }
  | { type: 'CARD_DRAWN'; playerId: string; card: Card }
  | { type: 'PLAYER_DIED'; playerId: string }
  | { type: 'GAME_WON'; winnerId: string };

/**
 * Pure function: same state + same event → always same result.
 * This is the heart of determinism and replay capability.
 */
export function processEvent(
  state: GameState,
  event: GameEvent
): EngineResult {
  if (state.phase === 'ended') {
    return { state, sideEffects: [] }; // No events processed after game over
  }

  switch (event.type) {
    case 'GAME_STARTED':
      return startGame(state, event);
    case 'PLAYER_JOINED':
      return handlePlayerJoin(state, event);
    case 'CARD_PLAYED':
      return playCard(state, event);
    case 'TURN_ENDED':
      return handleTurnEnd(state, event);
    case 'GAME_ENDED':
      return endGame(state, event);
    default:
      return { state, sideEffects: [] };
  }
}

/**
 * Replay a full event sequence to reconstruct state.
 * This is how the replay system works.
 */
export function replayEvents(events: GameEvent[], initialState?: GameState): GameState {
  const state = initialState ?? createInitialState();
  return events.reduce((currentState, event) => {
    return processEvent(currentState, event).state;
  }, state);
}
```

### 5.5 Game Service (Orchestration Layer)

The service layer connects the pure engine to the I/O side (Socket.io broadcasting + event store).

```typescript
// apps/server/src/services/game-service.ts

import { replayEvents } from '../engine/index.js';
import { GameEvent } from '@card-game/shared-types';
import { RoomManager } from './room-manager.js';
import { EventDispatcher } from '../events/dispatcher.js';

export class GameService {
  constructor(
    private roomManager: RoomManager,
    private dispatcher: EventDispatcher
  ) {}

  async handleGameEvent(roomId: string, event: GameEvent): Promise<void> {
    // 1. Get current room state
    const room = this.roomManager.getRoom(roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);

    // 2. Process event through the pure engine
    const { state, sideEffects } = room.engine.processEvent(event);

    // 3. Update room state
    room.engine.updateState(state);

    // 4. Append event to event store (durable)
    await this.dispatcher.appendEvent(roomId, event);

    // 5. Broadcast new state to all players in room
    await this.dispatcher.broadcastState(roomId, state, event, sideEffects);
  }

  async getReplay(roomId: string): Promise<{ events: GameEvent[]; finalState: GameState }> {
    const events = await this.dispatcher.getEvents(roomId);
    const finalState = replayEvents(events);
    return { events, finalState };
  }
}
```

### 5.6 Event Store Schema

For MVP, use a simple JSON file storage or SQLite. For production, use PostgreSQL with an events table.

```sql
-- PostgreSQL schema for event store
CREATE TABLE game_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB NOT NULL,
  sequence_number SERIAL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (event_data ? 'type') -- Ensure every event has a 'type' field
);

CREATE INDEX idx_game_events_room_id ON game_events(room_id);
CREATE INDEX idx_game_events_room_sequence ON game_events(room_id, sequence_number);
```

### 5.7 WebSocket Handler

```typescript
// apps/server/src/plugins/socket.ts

import { FastifyInstance } from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@card-game/shared-types';
import { GameService } from '../services/game-service.js';
import { RoomManager } from '../services/room-manager.js';
import { validateEvent } from '../events/validation.js';

export async function websocketPlugin(fastify: FastifyInstance) {
  const io = new SocketIOServer(fastify.server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
  });

  const roomManager = new RoomManager();
  const gameService = new GameService(roomManager, /* dispatcher */);

  io.on('connection', (socket) => {
    fastify.log.info(`Client connected: ${socket.id}`);

    socket.on(CLIENT_EVENTS.JOIN_ROOM, async ({ roomId, playerName }) => {
      await roomManager.addPlayer(socket, roomId, playerName);
      socket.join(roomId);
      socket.emit(SERVER_EVENTS.ROOM_JOINED, { roomId, playerId: socket.id });

      // If room is full, start the game
      if (roomManager.isRoomFull(roomId)) {
        await gameService.handleGameEvent(roomId, {
          type: 'GAME_STARTED',
          timestamp: Date.now(),
        });
      }
    });

    socket.on(CLIENT_EVENTS.PLAY_CARD, async ({ cardId, targetId }) => {
      const room = roomManager.getRoomBySocket(socket.id);
      if (!room) return;

      const event = {
        type: 'CARD_PLAYED' as const,
        playerId: socket.id,
        cardId,
        targetId,
        timestamp: Date.now(),
      };

      await gameService.handleGameEvent(room.id, event);
    });

    socket.on('disconnect', () => {
      const room = roomManager.getRoomBySocket(socket.id);
      if (room) {
        roomManager.removePlayer(socket.id);
        io.to(room.id).emit(SERVER_EVENTS.PLAYER_LEFT, { playerId: socket.id });
      }
    });
  });

  fastify.decorate('io', io);
}
```

---

## 6. Frontend (apps/web)

**Location:** `apps/web/`  
**Framework:** Next.js 15 (App Router)  
**Runtime:** Bun (`bunx next dev`, `bunx next build`, `bun test`)  
**Testing:** Vitest + React Testing Library  
**Styling:** Tailwind CSS v4 + shadcn/ui  
**State Management:** Zustand (client-side game state)  
**Socket Client:** socket.io-client

### 6.1 Directory Structure

```
apps/web/
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout
│   │   ├── page.tsx             # Landing page
│   │   ├── lobby/
│   │   │   └── page.tsx         # Matchmaking / room creation
│   │   └── game/
│   │       └── [roomId]/
│   │           └── page.tsx     # Game board (Client Component)
│   ├── components/
│   │   ├── ui/                  # shadcn/ui components
│   │   ├── game/
│   │   │   ├── GameBoard.tsx    # Main game board
│   │   │   ├── PlayerHand.tsx   # Player's card hand
│   │   │   ├── Card.tsx         # Individual card component
│   │   │   ├── TurnIndicator.tsx
│   │   │   └── GameChat.tsx
│   │   └── lobby/
│   │       ├── CreateRoom.tsx
│   │       └── RoomList.tsx
│   ├── hooks/
│   │   ├── useSocket.ts         # Socket.io connection hook
│   │   ├── useGameState.ts      # Zustand store for game state
│   │   └── useReplay.ts         # Replay playback hook
│   ├── stores/
│   │   └── gameStore.ts         # Zustand store (client-side state)
│   ├── lib/
│   │   ├── socket.ts            # Socket.io client singleton
│   │   └── api.ts               # REST API client (fetch wrapper)
│   └── types/
│       └── local.ts             # Frontend-only types (UI state, etc.)
├── tests/
│   ├── components/
│   │   └── Card.test.tsx        # Vitest + RTL tests
│   └── hooks/
│       └── useGameState.test.ts
├── package.json
└── tsconfig.json
```

### 6.2 Game State Store (Zustand)

```typescript
// apps/web/src/stores/gameStore.ts

import { create } from 'zustand';
import { GameState, Player, Card } from '@card-game/shared-types';

type GamePhase = 'idle' | 'connecting' | 'lobby' | 'playing' | 'replay' | 'ended';

interface GameStore {
  // Connection
  phase: GamePhase;
  roomId: string | null;
  playerId: string | null;

  // Game state (reconstructed from events)
  gameState: GameState | null;

  // Events (for replay)
  eventHistory: GameEvent[];

  // Actions
  setPhase: (phase: GamePhase) => void;
  setRoomId: (roomId: string) => void;
  setPlayerId: (playerId: string) => void;
  updateGameState: (state: GameState) => void;
  appendEvent: (event: GameEvent) => void;
  resetGame: () => void;

  // Replay-specific
  replayIndex: number;
  isReplaying: boolean;
  setReplayIndex: (index: number) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  phase: 'idle',
  roomId: null,
  playerId: null,
  gameState: null,
  eventHistory: [],
  replayIndex: 0,
  isReplaying: false,

  setPhase: (phase) => set({ phase }),
  setRoomId: (roomId) => set({ roomId }),
  setPlayerId: (playerId) => set({ playerId }),
  updateGameState: (state) => set({ gameState: state }),

  appendEvent: (event) =>
    set((s) => ({ eventHistory: [...s.eventHistory, event] })),

  resetGame: () =>
    set({
      gameState: null,
      eventHistory: [],
      replayIndex: 0,
      isReplaying: false,
      phase: 'idle',
    }),

  setReplayIndex: (index) => set({ replayIndex: index }),
}));
```

### 6.3 Socket Hook

```typescript
// apps/web/src/hooks/useSocket.ts

'use client';

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useGameStore } from '../stores/gameStore';
import { CLIENT_EVENTS, SERVER_EVENTS, GameEvent } from '@card-game/shared-types';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const { setPhase, setPlayerId, appendEvent, updateGameState } = useGameStore();

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setPhase('lobby');
      setPlayerId(socket.id ?? null);
    });

    socket.on(SERVER_EVENTS.GAME_STATE_UPDATE, (payload: { state: GameState; event: GameEvent }) => {
      updateGameState(payload.state);
      appendEvent(payload.event);
    });

    socket.on(SERVER_EVENTS.GAME_OVER, (payload: { winnerId: string }) => {
      setPhase('ended');
    });

    socket.on('disconnect', () => {
      setPhase('idle');
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const playCard = (cardId: string, targetId?: string) => {
    socketRef.current?.emit(CLIENT_EVENTS.PLAY_CARD, { cardId, targetId });
  };

  const endTurn = () => {
    socketRef.current?.emit(CLIENT_EVENTS.END_TURN);
  };

  const joinRoom = (roomId: string, playerName: string) => {
    socketRef.current?.emit(CLIENT_EVENTS.JOIN_ROOM, { roomId, playerName });
  };

  return { playCard, endTurn, joinRoom };
}
```

### 6.4 Game Board Component

```typescript
// apps/web/src/components/game/GameBoard.tsx

'use client';

import { useGameStore } from '@/stores/gameStore';
import { useSocket } from '@/hooks/useSocket';
import { PlayerHand } from './PlayerHand';
import { Card } from './Card';
import { TurnIndicator } from './TurnIndicator';

export function GameBoard() {
  const { gameState, playerId } = useGameStore();
  const { playCard, endTurn } = useSocket();

  if (!gameState) return <div className="p-8">Connecting to game...</div>;

  const currentPlayer = gameState.players.find((p) => p.id === playerId);
  const isMyTurn = gameState.currentPlayerId === playerId;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <TurnIndicator
        currentPlayer={gameState.currentPlayerId}
        players={gameState.players}
        isMyTurn={isMyTurn}
      />

      <div className="grid grid-cols-4 gap-4 mt-8">
        {gameState.players.map((player) => (
          <div key={player.id} className="bg-slate-800 rounded-xl p-4">
            <h3 className="font-bold">{player.name}</h3>
            <p>HP: {player.health}</p>
            <p>Energy: {player.energy}/{player.maxEnergy}</p>
            <p>Cards: {player.hand.length}</p>
          </div>
        ))}
      </div>

      {currentPlayer && isMyTurn && (
        <PlayerHand
          cards={currentPlayer.hand}
          onPlayCard={(card) => playCard(card.id)}
          energy={currentPlayer.energy}
        />
      )}

      {isMyTurn && (
        <button
          onClick={endTurn}
          className="mt-6 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold"
        >
          End Turn
        </button>
      )}
    </div>
  );
}
```

### 6.5 Card Component

```typescript
// apps/web/src/components/game/Card.tsx

import { Card as CardType } from '@card-game/shared-types';

type CardProps = {
  card: CardType;
  disabled?: boolean;
  onPlay?: (card: CardType) => void;
};

export function Card({ card, disabled, onPlay }: CardProps) {
  const typeColors = {
    attack: 'border-red-500 bg-red-900',
    defense: 'border-blue-500 bg-blue-900',
    special: 'border-purple-500 bg-purple-900',
  };

  return (
    <div
      onClick={() => !disabled && onPlay?.(card)}
      className={`
        w-32 h-44 rounded-xl border-2 p-3 flex flex-col justify-between
        cursor-pointer transition-all hover:scale-105
        ${typeColors[card.type]}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-xl'}
      `}
    >
      <div className="text-xs font-bold uppercase tracking-wide opacity-75">
        {card.type}
      </div>
      <div className="text-sm font-bold leading-tight">{card.name}</div>
      {card.damage && (
        <div className="text-2xl font-black text-yellow-400">⚔️ {card.damage}</div>
      )}
      <div className="text-xs opacity-60">⚡ {card.cost} energy</div>
    </div>
  );
}
```

---

## 7. Testing Strategy

### 7.1 Philosophy

> **Determinism first.** If the game engine is pure, testing it is trivial. The more logic you put into the pure engine, the less integration testing you need.

**Test Pyramid:**
```
        ▲ E2E (Vitest + Playwright) — 10% (critical paths: full game flow)
       ▲▲▲ Integration (bun:test) — 30% (service layer, WebSocket flows)
▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲ Unit (bun:test) — 60% (pure engine)
```

### 7.2 Backend Tests (bun:test)

```typescript
// apps/server/tests/engine/engine.test.ts

import { describe, it, expect } from 'bun:test';
import { processEvent, replayEvents } from '../../src/engine/index.js';
import { createInitialState } from '../../src/engine/state.js';
import { PlayerJoinedEvent, CardPlayedEvent, GameStartedEvent } from '@card-game/shared-types';

describe('Game Engine — Deterministic Behavior', () => {
  describe('processEvent', () => {
    it('should deal 5 damage when Laser card is played on a target', () => {
      // Arrange
      const state = createInitialState();
      state.players = [
        { id: 'player1', name: 'Alice', health: 30, hand: [], deck: [], energy: 3, maxEnergy: 3 },
        { id: 'player2', name: 'Bob', health: 20, hand: [], deck: [], energy: 3, maxEnergy: 3 },
      ];

      const event: CardPlayedEvent = {
        type: 'CARD_PLAYED',
        playerId: 'player1',
        cardId: 'laser-blue-01',
        targetId: 'player2',
        timestamp: 1000,
      };

      // Act
      const { state: newState, sideEffects } = processEvent(state, event);

      // Assert — Deterministic expectation
      expect(newState.players.find(p => p.id === 'player2')?.health).toBe(15); // 20 - 5
      expect(sideEffects).toContainEqual(
        expect.objectContaining({ type: 'DAMAGE_DEALT', targetId: 'player2', amount: 5 })
      );
    });

    it('should not process events after game has ended', () => {
      const endedState = createInitialState();
      endedState.phase = 'ended';

      const event: CardPlayedEvent = {
        type: 'CARD_PLAYED',
        playerId: 'player1',
        cardId: 'laser-01',
        timestamp: 2000,
      };

      const { state: resultState } = processEvent(endedState, event);
      expect(resultState.phase).toBe('ended');
    });
  });

  describe('replayEvents — Determinism Guarantee', () => {
    it('should reconstruct the same final state regardless of how many times we replay', () => {
      const events: GameEvent[] = [
        { type: 'GAME_STARTED', timestamp: 100 },
        { type: 'PLAYER_JOINED', playerId: 'p1', playerName: 'Alice', timestamp: 200 },
        { type: 'PLAYER_JOINED', playerId: 'p2', playerName: 'Bob', timestamp: 300 },
        { type: 'CARD_PLAYED', playerId: 'p1', cardId: 'laser-01', targetId: 'p2', timestamp: 400 },
        { type: 'TURN_ENDED', playerId: 'p1', timestamp: 500 },
        { type: 'CARD_PLAYED', playerId: 'p2', cardId: 'shield-01', timestamp: 600 },
      ];

      const state1 = replayEvents(events);
      const state2 = replayEvents(events); // Replay again — must be identical
      const state3 = replayEvents(events, createInitialState()); // Fresh start — must be identical

      expect(state1).toEqual(state2);
      expect(state1).toEqual(state3);
    });
  });
});
```

### 7.3 Frontend Tests (Vitest + React Testing Library)

```typescript
// apps/web/tests/components/Card.test.tsx

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from '../../src/components/game/Card';
import type { Card as CardType } from '@card-game/shared-types';

const mockCard: CardType = {
  id: 'test-card-01',
  name: 'Fireball',
  type: 'attack',
  damage: 8,
  cost: 3,
  description: 'Deal 8 damage to a target.',
};

describe('Card Component', () => {
  it('should render card name and type', () => {
    render(<Card card={mockCard} />);
    expect(screen.getByText('Fireball')).toBeDefined();
    expect(screen.getByText('attack')).toBeDefined();
  });

  it('should show damage when present', () => {
    render(<Card card={mockCard} />);
    expect(screen.getByText(/⚔️ 8/)).toBeDefined();
  });

  it('should disable interaction when disabled prop is true', () => {
    const handlePlay = vi.fn();
    const { container } = render(
      <Card card={mockCard} disabled onPlay={handlePlay} />
    );

    // Click should not trigger handler
    container.firstChild?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handlePlay).not.toHaveBeenCalled();
  });

  it('should call onPlay with card data when clicked and not disabled', () => {
    const handlePlay = vi.fn();
    const { container } = render(
      <Card card={mockCard} disabled={false} onPlay={handlePlay} />
    );

    container.firstChild?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handlePlay).toHaveBeenCalledWith(mockCard);
  });
});
```

### 7.4 Running Tests

```bash
# All tests (monorepo)
bun run test

# Backend only
cd apps/server && bun test

# Frontend only
cd apps/web && bun test

# Shared-types tests
cd packages/shared-types && bun test

# Watch mode
bun run test --watch
```

### 7.5 Turborepo Test Pipeline

```json
// turbo.json

{
  "pipeline": {
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"],
      "cache": true
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"],
      "cache": true
    },
    "lint": {
      "cache": true
    },
    "typecheck": {
      "cache": true
    }
  }
}
```

---

## 8. Event Sourcing & Replay System

### 8.1 The Event Store Principle

The server does **not** store the current game state. It stores a log of events. The current state is always **reconstructed by replaying all events from the beginning**.

```
Traditional approach:
  Current State → Action → New State (overwrite)

Event Sourcing approach:
  [E1, E2, E3, ...] → Replay → Current State
```

### 8.2 Replay System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    REPLAY SYSTEM                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Client requests /api/replay/:roomId                 │
│                          │                              │
│                          ▼                              │
│  2. Server fetches all events from event store          │
│     SELECT * FROM game_events WHERE room_id = ?         │
│     ORDER BY sequence_number ASC                        │
│                          │                              │
│                          ▼                              │
│  3. Server calls replayEvents(events, initialState)     │
│     → Returns final state + full history                │
│                          │                              │
│                          ▼                              │
│  4. Server sends { events[], finalState } to client     │
│                          │                              │
│                          ▼                              │
│  5. Client enters "REPLAY MODE" in Zustand store        │
│     → UI shows playback controls (play, pause, seek)    │
│     → Game engine runs on client to render each step    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 8.3 Replay UI Components

```typescript
// apps/web/src/components/replay/ReplayControls.tsx

'use client';

import { useGameStore } from '@/stores/gameStore';
import { replayEvents } from '@card-game/shared-types';

export function ReplayControls() {
  const { eventHistory, replayIndex, setReplayIndex, updateGameState, phase } = useGameStore();

  const handleSeek = (index: number) => {
    const stateAtIndex = replayEvents(eventHistory.slice(0, index + 1));
    updateGameState(stateAtIndex);
    setReplayIndex(index);
  };

  const handlePlay = () => {
    // Auto-advance replay by 1 event per 500ms
    const interval = setInterval(() => {
      setReplayIndex((prev) => {
        if (prev >= eventHistory.length - 1) {
          clearInterval(interval);
          return prev;
        }
        handleSeek(prev + 1);
        return prev + 1;
      });
    }, 500);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-800 p-4 flex items-center gap-4">
      <button onClick={() => handleSeek(Math.max(0, replayIndex - 1))}>⏮</button>
      <button onClick={handlePlay}>▶</button>
      <button onClick={() => handleSeek(Math.min(eventHistory.length - 1, replayIndex + 1))}>⏭</button>

      <input
        type="range"
        min={0}
        max={eventHistory.length - 1}
        value={replayIndex}
        onChange={(e) => handleSeek(Number(e.target.value))}
        className="flex-1"
      />

      <span>
        Event {replayIndex + 1} / {eventHistory.length}
      </span>
    </div>
  );
}
```

### 8.4 Determinism Verification in CI

```typescript
// apps/server/tests/determinism.test.ts

/**
 * This test runs in CI to ensure the engine is deterministic.
 * It replays a batch of real game events 100 times and fails
 * if any replay produces a different result.
 */
describe('Determinism CI Test', () => {
  it('engine must produce identical output for 100 consecutive replays', () => {
    const realGameEvents: GameEvent[] = loadRecordedGameEvents();

    const results = Array.from({ length: 100 }, () =>
      JSON.stringify(replayEvents(realGameEvents))
    );

    const uniqueResults = new Set(results);
    expect(uniqueResults.size).toBe(1); // All 100 must be identical
  });
});
```

---

## 9. Coding Conventions

### 9.1 TypeScript Strict Mode

**Every package** must have TypeScript strict mode enabled:

```json
// tsconfig.json (in every package)
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

### 9.2 Naming Conventions

| Context | Convention | Example |
|---|---|---|
| Files | kebab-case | `game-service.ts`, `use-socket.ts` |
| Types/Interfaces | PascalCase | `GameState`, `PlayerJoinedEvent` |
| Functions | camelCase | `processEvent`, `handlePlayerJoin` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_PLAYERS`, `DEFAULT_ENERGY` |
| Events (type field) | SCREAMING_SNAKE_CASE | `'CARD_PLAYED'`, `'TURN_ENDED'` |
| Socket event names | kebab-case | `'game:play-card'`, `'room:joined'` |

### 9.3 Module Boundaries

```
packages/shared-types/     → CAN be imported by: apps/server, apps/web
apps/server/               → CAN be imported by: apps/server only
apps/web/                  → CAN be imported by: apps/web only

apps/server/               → MUST NOT import from apps/web
apps/web/                  → MUST NOT import from apps/server

engine/                    → MUST NOT import from services/, plugins/, routes/
services/                  → MUST NOT import from plugins/ (except for Fastify decorators)
```

### 9.4 Error Handling

- Use typed errors (custom Error subclasses) in the engine
- Use Fastify's error handling (`fastify.errorHandler`) for HTTP errors
- WebSocket errors: emit a `SERVER_EVENTS.ERROR` event to the client, never crash the server

```typescript
// apps/server/src/engine/errors.ts

export class GameLogicError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'GameLogicError';
  }
}

// Usage in engine
throw new GameLogicError(
  'Player does not have enough energy',
  'INSUFFICIENT_ENERGY',
  { required: card.cost, available: player.energy }
);
```

### 9.5 Logging

- Backend: Use Fastify's built-in logger (Pino under the hood)
- Frontend: Use `console` with structured objects, never `console.log` with strings interpolation

```typescript
// Good
fastify.log.info({ roomId, playerId, event: 'CARD_PLAYED' }, 'Player played a card');

// Bad
console.log(`Player ${playerId} played card in room ${roomId}`);
```

### 9.6 No `any` Type

The `any` type is forbidden. Use:
- `unknown` when the type is truly unknown
- Type predicates / type guards for narrowing
- `@ts-expect-error` only when absolutely necessary (document why)

---

## 10. Directory Layout (Full Tree)

```
card-game/
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── app.ts
│   │   │   ├── config/
│   │   │   │   └── env.ts
│   │   │   ├── plugins/
│   │   │   │   ├── socket.ts
│   │   │   │   └── cors.ts
│   │   │   ├── services/
│   │   │   │   ├── room-manager.ts
│   │   │   │   └── game-service.ts
│   │   │   ├── engine/
│   │   │   │   ├── index.ts
│   │   │   │   ├── state.ts
│   │   │   │   ├── cards.ts
│   │   │   │   ├── turns.ts
│   │   │   │   ├── damage.ts
│   │   │   │   └── errors.ts
│   │   │   ├── events/
│   │   │   │   ├── dispatcher.ts
│   │   │   │   ├── replay.ts
│   │   │   │   └── validation.ts
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts
│   │   │   │   └── rooms.ts
│   │   │   └── types/
│   │   │       └── fastify.ts
│   │   ├── tests/
│   │   │   ├── engine/
│   │   │   │   ├── engine.test.ts
│   │   │   │   └── cards.test.ts
│   │   │   ├── integration/
│   │   │   │   └── game-flow.test.ts
│   │   │   └── determinism.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx
│       │   │   ├── page.tsx
│       │   │   ├── lobby/
│       │   │   │   └── page.tsx
│       │   │   ├── game/
│       │   │   │   └── [roomId]/
│       │   │   │       └── page.tsx
│       │   │   └── replay/
│       │   │       └── [roomId]/
│       │   │           └── page.tsx
│       │   ├── components/
│       │   │   ├── ui/
│       │   │   ├── game/
│       │   │   │   ├── GameBoard.tsx
│       │   │   │   ├── PlayerHand.tsx
│       │   │   │   ├── Card.tsx
│       │   │   │   ├── TurnIndicator.tsx
│       │   │   │   └── GameChat.tsx
│       │   │   ├── lobby/
│       │   │   │   ├── CreateRoom.tsx
│       │   │   │   └── RoomList.tsx
│       │   │   └── replay/
│       │   │       ├── ReplayControls.tsx
│       │   │       └── ReplayBoard.tsx
│       │   ├── hooks/
│       │   │   ├── useSocket.ts
│       │   │   ├── useGameState.ts
│       │   │   └── useReplay.ts
│       │   ├── stores/
│       │   │   └── gameStore.ts
│       │   ├── lib/
│       │   │   ├── socket.ts
│       │   │   └── api.ts
│       │   └── types/
│       │       └── local.ts
│       ├── tests/
│       │   ├── components/
│       │   │   └── Card.test.tsx
│       │   └── hooks/
│       │       └── useGameState.test.ts
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   └── shared-types/
│       ├── src/
│       │   ├── events/
│       │   │   ├── index.ts
│       │   │   ├── player-joined.ts
│       │   │   ├── card-played.ts
│       │   │   ├── turn-ended.ts
│       │   │   ├── game-started.ts
│       │   │   └── game-ended.ts
│       │   ├── game/
│       │   │   ├── types.ts
│       │   │   └── constants.ts
│       │   ├── socket/
│       │   │   └── events.ts
│       │   └── index.ts
│       ├── tests/
│       │   └── event-serialization.test.ts
│       ├── package.json
│       └── tsconfig.json
├── turbo.json
├── package.json
├── bun.lockb
└── README.md
```

---

## 11. CI/CD & Automation

### 11.1 Turborepo Pipeline Commands

```bash
# Full build pipeline (cached)
bun run build

# Run all tests across packages
bun run test

# Type check all packages
bun run typecheck

# Lint all packages
bun run lint
```

### 11.2 GitHub Actions (Recommended)

```yaml
# .github/workflows/ci.yml

name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun run typecheck
      - run: bun run test --coverage
      - run: bun run lint

  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run build
```

### 11.3 Pre-commit Hooks (Husky + lint-staged)

```bash
bun add -D husky lint-staged
```

```json
// package.json addition
{
  "lint-staged": {
    "*.ts": ["bun run lint", "bun run typecheck"],
    "*.tsx": ["bun run lint", "bun run typecheck"],
    "*.test.ts": ["bun test"]
  }
}
```

---

## 12. Glossary

| Term | Definition |
|---|---|
| **Determinism** | The property that the same input always produces the same output. Core requirement for replay and testing. |
| **Event Sourcing** | Architecture pattern where state is reconstructed by replaying a log of events instead of storing current state directly. |
| **Pure Function** | A function with no side effects; same inputs always produce same outputs. The game engine must be pure. |
| **Side Effect** | Any observable change outside the function: network calls, file writes, global state mutations. |
| **Event Store** | The durable log of all game events. Append-only. The source of truth for game state. |
| **Reconciliation (Reconcile)** | The process of comparing client-side predicted state with server-authoritative state and fixing differences. |
| **Hot Path** | The code path executed most frequently (e.g., every card play in a game). Optimize this above all else. |
| **Monorepo** | A single repository containing multiple packages/projects that share code and tooling. |
| **Task Pipeline** | Turborepo's definition of how tasks depend on and cache each other. |
| **Remote Cache** | Cloud-based build cache shared across all developers on a team (Vercel/Turbo). |

---

## Quick Reference: Import Paths

```typescript
// From apps/server or apps/web → import shared-types
import { GameState, GameEvent } from '@card-game/shared-types';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@card-game/shared-types/socket';
import { GAME_EVENT_SCHEMA } from '@card-game/shared-types/events';

// From server → import engine (pure)
import { processEvent, replayEvents } from '../engine/index.js';

// From server → import services
import { GameService } from '../services/game-service.js';

// From web → import store
import { useGameStore } from '@/stores/gameStore';

// From web → import hooks
import { useSocket } from '@/hooks/useSocket';
```

---

*This document is the single source of truth. All AI agents and developers must adhere to it. For proposed changes, open a pull request.*