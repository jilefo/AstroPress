CREATE TABLE `wp_postmeta` (
	`meta_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer DEFAULT 0 NOT NULL,
	`meta_key` text,
	`meta_value` text
);
--> statement-breakpoint
CREATE TABLE `wp_posts` (
	`ID` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_author` integer DEFAULT 0 NOT NULL,
	`post_date` text DEFAULT '0000-00-00 00:00:00' NOT NULL,
	`post_date_gmt` text DEFAULT '0000-00-00 00:00:00' NOT NULL,
	`post_content` text DEFAULT '' NOT NULL,
	`post_title` text DEFAULT '' NOT NULL,
	`post_excerpt` text DEFAULT '' NOT NULL,
	`post_status` text DEFAULT 'publish' NOT NULL,
	`comment_status` text DEFAULT 'open' NOT NULL,
	`ping_status` text DEFAULT 'open' NOT NULL,
	`post_password` text DEFAULT '' NOT NULL,
	`post_name` text DEFAULT '' NOT NULL,
	`to_ping` text DEFAULT '' NOT NULL,
	`pinged` text DEFAULT '' NOT NULL,
	`post_modified` text DEFAULT '0000-00-00 00:00:00' NOT NULL,
	`post_modified_gmt` text DEFAULT '0000-00-00 00:00:00' NOT NULL,
	`post_content_filtered` text DEFAULT '' NOT NULL,
	`post_parent` integer DEFAULT 0 NOT NULL,
	`guid` text DEFAULT '' NOT NULL,
	`menu_order` integer DEFAULT 0 NOT NULL,
	`post_type` text DEFAULT 'post' NOT NULL,
	`post_mime_type` text DEFAULT '' NOT NULL,
	`comment_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wp_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wp_usermeta` (
	`umeta_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer DEFAULT 0 NOT NULL,
	`meta_key` text,
	`meta_value` text
);
--> statement-breakpoint
CREATE TABLE `wp_users` (
	`ID` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_login` text DEFAULT '' NOT NULL,
	`user_pass` text DEFAULT '' NOT NULL,
	`user_nicename` text DEFAULT '' NOT NULL,
	`user_email` text DEFAULT '' NOT NULL,
	`user_url` text DEFAULT '' NOT NULL,
	`user_registered` text DEFAULT '0000-00-00 00:00:00' NOT NULL,
	`user_activation_key` text DEFAULT '' NOT NULL,
	`user_status` integer DEFAULT 0 NOT NULL,
	`display_name` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wp_options` (
	`option_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`option_name` text NOT NULL,
	`option_value` text DEFAULT '' NOT NULL,
	`autoload` text DEFAULT 'yes' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wp_term_relationships` (
	`object_id` integer NOT NULL,
	`term_taxonomy_id` integer NOT NULL,
	`term_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wp_term_taxonomy` (
	`term_taxonomy_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`term_id` integer DEFAULT 0 NOT NULL,
	`taxonomy` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`parent` integer DEFAULT 0 NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wp_terms` (
	`term_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`slug` text DEFAULT '' NOT NULL,
	`term_group` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `postmeta_post_id_idx` ON `wp_postmeta` (`post_id`);--> statement-breakpoint
CREATE INDEX `postmeta_meta_key_idx` ON `wp_postmeta` (`meta_key`);--> statement-breakpoint
CREATE INDEX `post_name_idx` ON `wp_posts` (`post_name`);--> statement-breakpoint
CREATE INDEX `post_type_status_date_idx` ON `wp_posts` (`post_type`,`post_status`,`post_date`,`ID`);--> statement-breakpoint
CREATE INDEX `post_parent_idx` ON `wp_posts` (`post_parent`);--> statement-breakpoint
CREATE INDEX `post_author_idx` ON `wp_posts` (`post_author`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `wp_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `usermeta_user_id_idx` ON `wp_usermeta` (`user_id`);--> statement-breakpoint
CREATE INDEX `usermeta_meta_key_idx` ON `wp_usermeta` (`meta_key`);--> statement-breakpoint
CREATE INDEX `user_login_key_idx` ON `wp_users` (`user_login`);--> statement-breakpoint
CREATE INDEX `user_nicename_idx` ON `wp_users` (`user_nicename`);--> statement-breakpoint
CREATE INDEX `user_email_idx` ON `wp_users` (`user_email`);--> statement-breakpoint
CREATE UNIQUE INDEX `wp_options_option_name_unique` ON `wp_options` (`option_name`);--> statement-breakpoint
CREATE INDEX `option_name_idx` ON `wp_options` (`option_name`);--> statement-breakpoint
CREATE INDEX `autoload_idx` ON `wp_options` (`autoload`);--> statement-breakpoint
CREATE INDEX `term_relationships_taxonomy_id_idx` ON `wp_term_relationships` (`term_taxonomy_id`);--> statement-breakpoint
CREATE INDEX `term_taxonomy_taxonomy_idx` ON `wp_term_taxonomy` (`taxonomy`);--> statement-breakpoint
CREATE INDEX `term_id_taxonomy_idx` ON `wp_term_taxonomy` (`term_id`,`taxonomy`);--> statement-breakpoint
CREATE INDEX `terms_slug_idx` ON `wp_terms` (`slug`);--> statement-breakpoint
CREATE INDEX `terms_name_idx` ON `wp_terms` (`name`);