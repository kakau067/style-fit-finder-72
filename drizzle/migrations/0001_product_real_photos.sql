ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_front_path text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_back_path text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_detail_path text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS store_url text NOT NULL DEFAULT '';