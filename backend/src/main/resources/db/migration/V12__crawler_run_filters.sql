alter table catalog_crawler_runs
    add column if not exists filters_json text;
