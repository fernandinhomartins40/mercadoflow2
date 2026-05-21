-- Add Holt-Winters confidence interval columns to demand_forecasts
alter table demand_forecasts
    add column if not exists confidence_low   numeric(10, 3),
    add column if not exists confidence_high  numeric(10, 3),
    add column if not exists trend_direction  varchar(10);

-- Add leverage metric to market basket rules
alter table market_basket_rules
    add column if not exists leverage numeric(10, 6);
