do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_name = 'product_enrichments'
          and column_name = 'canonical_name'
          and data_type = 'bytea'
    ) then
        alter table product_enrichments
            alter column canonical_name type text using case when canonical_name is null then null else encode(canonical_name, 'escape') end;
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_name = 'product_enrichments'
          and column_name = 'brand'
          and data_type = 'bytea'
    ) then
        alter table product_enrichments
            alter column brand type text using case when brand is null then null else encode(brand, 'escape') end;
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_name = 'product_enrichments'
          and column_name = 'category'
          and data_type = 'bytea'
    ) then
        alter table product_enrichments
            alter column category type text using case when category is null then null else encode(category, 'escape') end;
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_name = 'products'
          and column_name = 'name'
          and data_type = 'bytea'
    ) then
        alter table products
            alter column name type text using case when name is null then null else encode(name, 'escape') end;
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_name = 'products'
          and column_name = 'ean'
          and data_type = 'bytea'
    ) then
        alter table products
            alter column ean type text using case when ean is null then null else encode(ean, 'escape') end;
    end if;
end $$;

