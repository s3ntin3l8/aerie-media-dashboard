CREATE TABLE `account_links` (
	`portal_user_id` text PRIMARY KEY NOT NULL,
	`plex_user_id` text,
	`jellyfin_user_id` text,
	`overseerr_user_id` text,
	`tautulli_user_id` text,
	`linked` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`portal_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`name` text PRIMARY KEY NOT NULL,
	`label` text
);
--> statement-breakpoint
CREATE TABLE `preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`theme` text DEFAULT 'dark' NOT NULL,
	`favorites` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `service_secrets` (
	`service_id` text NOT NULL,
	`kind` text DEFAULT 'apiKey' NOT NULL,
	`iv` text NOT NULL,
	`auth_tag` text NOT NULL,
	`ciphertext` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`service_id`, `kind`),
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `service_visibility` (
	`service_id` text NOT NULL,
	`group_name` text NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	PRIMARY KEY(`service_id`, `group_name`),
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_name`) REFERENCES `groups`(`name`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`cat` text NOT NULL,
	`icon` text NOT NULL,
	`embeddable` integer DEFAULT false NOT NULL,
	`central` integer DEFAULT false NOT NULL,
	`central_label` text,
	`host` text NOT NULL,
	`base_url` text,
	`version` text,
	`note` text,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`req_quota` integer DEFAULT 5 NOT NULL,
	`created_at` integer NOT NULL
);
