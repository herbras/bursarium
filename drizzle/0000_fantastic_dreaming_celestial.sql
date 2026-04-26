CREATE TABLE `active_frequency` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text,
	`volume` integer,
	`value` real,
	`frequency` integer,
	`volume_percent` real,
	`value_percent` real,
	`frequency_percent` real,
	`trading_days` integer,
	`period` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `active_value` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text,
	`volume` integer,
	`value` real,
	`frequency` integer,
	`volume_percent` real,
	`value_percent` real,
	`frequency_percent` real,
	`trading_days` integer,
	`period` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `active_volume` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text,
	`volume` integer,
	`value` real,
	`frequency` integer,
	`volume_percent` real,
	`value_percent` real,
	`frequency_percent` real,
	`trading_days` integer,
	`period` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `additional_listing` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`shares` integer NOT NULL,
	`type` text,
	`start_date` integer NOT NULL,
	`last_date` integer NOT NULL,
	`period` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `participant_broker` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`license` text
);
--> statement-breakpoint
CREATE TABLE `broker_summary` (
	`id` integer PRIMARY KEY NOT NULL,
	`date` integer NOT NULL,
	`broker_code` text NOT NULL,
	`broker_name` text,
	`total_value` real NOT NULL,
	`volume` integer NOT NULL,
	`frequency` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `company_announcement` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`date` integer NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`company_code` text NOT NULL,
	`created_date` integer NOT NULL,
	`form_id` text NOT NULL,
	`subject` text,
	`is_stock` integer NOT NULL,
	`is_bond` integer NOT NULL,
	`attachments` text
);
--> statement-breakpoint
CREATE TABLE `company_delisting` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`listed_shares` real NOT NULL,
	`market_cap` real NOT NULL,
	`regular_price` real NOT NULL,
	`last_date` integer NOT NULL,
	`listing_date` integer,
	`delisting_date` integer NOT NULL,
	`period` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `company_detail` (
	`code` text PRIMARY KEY NOT NULL,
	`address` text,
	`bae` text,
	`industry` text,
	`sub_industry` text,
	`email` text,
	`fax` text,
	`business_activity` text,
	`phone` text,
	`website` text,
	`npwp` text,
	`history` text,
	`board` text,
	`sector` text,
	`sub_sector` text,
	`status` text,
	`secretary` text,
	`directors` text,
	`commissioners` text,
	`committees` text,
	`shareholders` text,
	`subsidiaries` text
);
--> statement-breakpoint
CREATE TABLE `company_dividend` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text,
	`cash_dividend` real NOT NULL,
	`cum_dividend` integer,
	`ex_dividend` integer,
	`record_date` integer,
	`payment_date` integer,
	`period` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `company_profile` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`listing_date` integer
);
--> statement-breakpoint
CREATE TABLE `company_relisting` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`listing_date` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `company_suspend` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`title` text,
	`date` integer NOT NULL,
	`type` text,
	`download_url` text
);
--> statement-breakpoint
CREATE TABLE `daily_index` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`close` real NOT NULL,
	`date` integer NOT NULL,
	`period` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `participant_dealer` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`license` text,
	`is_primary` integer DEFAULT false
);
--> statement-breakpoint
CREATE TABLE `domestic_trading` (
	`date` integer PRIMARY KEY NOT NULL,
	`buy_volume` integer NOT NULL,
	`buy_value` real NOT NULL,
	`buy_frequency` integer NOT NULL,
	`sell_volume` integer NOT NULL,
	`sell_value` real NOT NULL,
	`sell_frequency` integer NOT NULL,
	`period` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `financial_ratio` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text,
	`sector` text,
	`sub_sector` text,
	`industry` text,
	`sub_industry` text,
	`period` integer NOT NULL,
	`assets` real,
	`liabilities` real,
	`equity` real,
	`sales` real,
	`ebt` real,
	`profit` real,
	`eps` real,
	`book_value` real,
	`per` real,
	`pbv` real,
	`der` real,
	`roa` real,
	`roe` real,
	`npm` real
);
--> statement-breakpoint
CREATE TABLE `financial_report` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text,
	`year` integer NOT NULL,
	`period` text NOT NULL,
	`attachments` text
);
--> statement-breakpoint
CREATE TABLE `foreign_trading` (
	`date` integer PRIMARY KEY NOT NULL,
	`buy_volume` integer NOT NULL,
	`buy_value` real NOT NULL,
	`buy_frequency` integer NOT NULL,
	`sell_volume` integer NOT NULL,
	`sell_value` real NOT NULL,
	`sell_frequency` integer NOT NULL,
	`period` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `index_chart` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`date` integer NOT NULL,
	`value` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `index_list` (
	`code` text PRIMARY KEY NOT NULL,
	`close` text,
	`change` text,
	`percent` text,
	`current` text
);
--> statement-breakpoint
CREATE TABLE `index_summary` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`date` integer NOT NULL,
	`previous` real,
	`high` real,
	`low` real,
	`close` real,
	`change` real,
	`percent` real,
	`volume` integer,
	`value` real,
	`frequency` integer,
	`market_cap` real
);
--> statement-breakpoint
CREATE TABLE `industry_trading` (
	`id` text PRIMARY KEY NOT NULL,
	`date` integer NOT NULL,
	`industry` text NOT NULL,
	`members` integer,
	`shares` integer,
	`market_cap` real,
	`volume` real,
	`value` real,
	`frequency` integer,
	`per` real,
	`pbv` real,
	`period` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `issued_history` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`shares` integer NOT NULL,
	`total_shares` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `market_calendar` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`type` text,
	`description` text,
	`location` text,
	`step` text,
	`date` integer NOT NULL,
	`year` text
);
--> statement-breakpoint
CREATE TABLE `new_listing` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`listed_shares` integer,
	`offering_shares` integer NOT NULL,
	`offering_price` real NOT NULL,
	`fund_raised` real,
	`listing_date` integer NOT NULL,
	`period` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profile_announcement` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`attachments` text
);
--> statement-breakpoint
CREATE TABLE `participant_profile` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`license` text,
	`is_primary` integer DEFAULT false
);
--> statement-breakpoint
CREATE TABLE `right_offering` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text,
	`ratio` text,
	`exercise_price` real,
	`fund_raised` real,
	`exercise_date` integer,
	`recording_date` integer,
	`trading_period` text,
	`period` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sectoral_movement` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`date` integer NOT NULL,
	`change` real NOT NULL,
	`period` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `security_stock` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`shares` integer,
	`listing_board` text,
	`listing_date` integer
);
--> statement-breakpoint
CREATE TABLE `stock_screener` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text,
	`industry` text,
	`sector` text,
	`sub_sector` text,
	`sub_industry` text,
	`sub_industry_code` text,
	`market_capital` real,
	`total_revenue` real,
	`npm` real,
	`per` real,
	`pbv` real,
	`roa` real,
	`roe` real,
	`der` real,
	`week4` real,
	`week13` real,
	`week26` real,
	`week52` real,
	`ytd` real,
	`mtd` real,
	`uma_date` text,
	`notation` text,
	`status` text,
	`corp_action` text,
	`corp_action_date` text
);
--> statement-breakpoint
CREATE TABLE `stock_split` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text,
	`type` text,
	`ratio` text,
	`old_nominal` real,
	`new_nominal` real,
	`additional_shares` integer,
	`listed_shares` integer,
	`listing_date` integer NOT NULL,
	`period` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_summary` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text,
	`date` integer NOT NULL,
	`remarks` text,
	`open` real,
	`high` real,
	`low` real,
	`close` real,
	`previous` real,
	`change` real,
	`volume` integer,
	`value` real,
	`frequency` integer,
	`first_trade` real,
	`bid` real,
	`bid_volume` integer,
	`offer` real,
	`offer_volume` integer,
	`foreign_buy` integer,
	`foreign_sell` integer,
	`foreign_net` integer,
	`listed_shares` integer,
	`tradable_shares` integer,
	`weight_for_index` real,
	`individual_index` real,
	`non_regular_volume` integer,
	`non_regular_value` real,
	`non_regular_frequency` integer
);
--> statement-breakpoint
CREATE TABLE `top_gainer` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text,
	`previous` real,
	`previous_ca` real,
	`close` real,
	`dilution` real,
	`change` real,
	`percentage` real,
	`period` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `top_loser` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text,
	`previous` real,
	`previous_ca` real,
	`close` real,
	`dilution` real,
	`change` real,
	`percentage` real,
	`period` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trade_summary` (
	`id` text NOT NULL,
	`volume` integer NOT NULL,
	`value` real NOT NULL,
	`frequency` integer NOT NULL,
	`date` integer NOT NULL,
	PRIMARY KEY(`id`, `date`)
);
--> statement-breakpoint
CREATE TABLE `trading_daily` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`board` text,
	`previous` real,
	`open` real,
	`high` real,
	`low` real,
	`close` real,
	`change` real,
	`volume` integer,
	`value` real,
	`frequency` integer,
	`bid` real,
	`bid_volume` integer,
	`offer` real,
	`offer_volume` integer,
	`individual_index` real,
	`foreign_shares` real,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `trading_ss` (
	`id` integer PRIMARY KEY NOT NULL,
	`no` integer,
	`code` text NOT NULL,
	`name` text,
	`date` text NOT NULL,
	`previous` real,
	`open` real,
	`high` real,
	`low` real,
	`close` real,
	`change` real,
	`volume` integer,
	`value` real,
	`frequency` integer,
	`first_trade` real,
	`bid` real,
	`bid_volume` integer,
	`offer` real,
	`offer_volume` integer,
	`listed_shares` integer,
	`tradable_shares` integer,
	`weight_for_index` real,
	`individual_index` real
);
