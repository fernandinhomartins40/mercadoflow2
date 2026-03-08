with ranked as (
    select
        id,
        row_number() over (
            partition by product_id, provider
            order by fetched_at desc nulls last, last_verified_at desc nulls last, id desc
        ) as rn
    from product_enrichments
)
delete from product_enrichments pe
using ranked r
where pe.id = r.id
  and r.rn > 1;

create unique index if not exists uk_product_enrichments_product_provider
    on product_enrichments(product_id, provider);
