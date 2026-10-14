CREATE TABLE "saved_view" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "search_document" (
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"search_text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_document_entity_type_entity_id_pk" PRIMARY KEY("entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "view_favorite" (
	"user_id" uuid NOT NULL,
	"view_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "view_favorite_user_id_view_id_pk" PRIMARY KEY("user_id","view_id")
);
--> statement-breakpoint
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_favorite" ADD CONSTRAINT "view_favorite_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_favorite" ADD CONSTRAINT "view_favorite_view_id_saved_view_id_fk" FOREIGN KEY ("view_id") REFERENCES "public"."saved_view"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_view_entity_idx" ON "saved_view" USING btree ("entity_type","owner_id");--> statement-breakpoint
CREATE INDEX "search_document_trgm_idx" ON "search_document" USING gin ("search_text" gin_trgm_ops);