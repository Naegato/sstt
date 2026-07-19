CREATE TABLE "game_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"event" jsonb NOT NULL,
	"api_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "game_events_room_sequence_idx" ON "game_events" USING btree ("room_id","sequence");--> statement-breakpoint
CREATE INDEX "game_events_room_id_idx" ON "game_events" USING btree ("room_id");