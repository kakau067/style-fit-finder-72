alter table public.products
  add column if not exists image_front_path text,
  add column if not exists image_back_path text,
  add column if not exists image_detail_path text,
  add column if not exists store_url text not null default '';

update public.products
set
  image_front_path = coalesce(image_front_path, image_path),
  image_back_path = coalesce(image_back_path, image_path),
  image_detail_path = coalesce(image_detail_path, image_path)
where image_front_path is null
   or image_back_path is null
   or image_detail_path is null;

alter table public.products
  alter column image_front_path set not null,
  alter column image_back_path set not null,
  alter column image_detail_path set not null;