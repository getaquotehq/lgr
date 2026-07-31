-- Service type for the solar trial: distinguishes "Residential Solar + Battery"
-- from "Battery Retrofit" orders placed via /solar-trial.
-- Defaults to 'residential_solar_battery' for all existing rows.

alter table public.rental_checkouts
  add column if not exists service_type text not null default 'residential_solar_battery';

alter table public.rentals
  add column if not exists service_type text not null default 'residential_solar_battery';
