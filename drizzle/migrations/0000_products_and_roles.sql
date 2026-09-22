create type public.app_role as enum ('admin', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create policy "Users can read own roles"
on public.user_roles for select to authenticated
using (user_id = auth.uid());

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  tagline text not null default '',
  price numeric(10,2) not null,
  audience text not null default 'unissex' check (audience in ('feminino','masculino','unissex')),
  image_path text not null,
  color_name text not null default '',
  color_hex text not null default '#888888',
  fabric text not null default '',
  silhouette text not null default '',
  styles text[] not null default '{}',
  occasions text[] not null default '{}',
  flatters text[] not null default '{}',
  fit jsonb not null,
  sizes jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.products to anon;
grant select on public.products to authenticated;
grant insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;

alter table public.products enable row level security;

create policy "Anyone can read products"
on public.products for select to anon, authenticated
using (true);

create policy "Admins can insert products"
on public.products for insert to authenticated
with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can update products"
on public.products for update to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can delete products"
on public.products for delete to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can read product images"
on storage.objects for select to authenticated
using (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));

create policy "Admins can upload product images"
on storage.objects for insert to authenticated
with check (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));

create policy "Admins can update product images"
on storage.objects for update to authenticated
using (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));

create policy "Admins can delete product images"
on storage.objects for delete to authenticated
using (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));

insert into public.products (slug, name, tagline, price, audience, image_path, color_name, color_hex, fabric, silhouette, styles, occasions, flatters, fit, sizes) values
('camiseta-pima','Camiseta Pima Essencial','Algodão pima peruano, costura reforçada, cai reto no corpo.',129,'unissex','demo/camiseta-pima.jpg','cru','#EFE7D8','Algodão pima 100%','Modelagem reta que não marca a cintura.','{basico,minimalista,descontraido}','{dia-a-dia,praia,viagem}','{ampulheta,triangle,retangulo,oval}','{"stretch":0.15,"ease":{"chest":8,"waist":6,"shoulder":1.5},"weight":{"chest":0.55,"waist":0.2,"shoulder":0.25},"tolerance":{"chest":5,"waist":5,"shoulder":1.6}}','[{"size":"PP","stock":false,"measurements":{"chest":92,"waist":88,"shoulder":40}},{"size":"P","stock":true,"measurements":{"chest":98,"waist":94,"shoulder":42}},{"size":"M","stock":true,"measurements":{"chest":104,"waist":100,"shoulder":44}},{"size":"G","stock":true,"measurements":{"chest":112,"waist":108,"shoulder":46}},{"size":"GG","stock":true,"measurements":{"chest":120,"waist":116,"shoulder":48}}]'),
('camisa-viscose','Camisa Fluida Oversized','Viscose certificada com caimento leve e ombro deslocado.',249,'unissex','demo/camisa-viscose.jpg','verde sálvia','#9BAA8E','Viscose de eucalipto','Ombro caído e barra longa alongam a silhueta.','{minimalista,descontraido,romantico}','{dia-a-dia,trabalho,viagem,encontro}','{inverted,retangulo,oval,ampulheta}','{"stretch":0.05,"ease":{"chest":16,"waist":16,"shoulder":5},"weight":{"chest":0.6,"waist":0.15,"shoulder":0.25},"tolerance":{"chest":7,"waist":8,"shoulder":2.5}}','[{"size":"PP","stock":true,"measurements":{"chest":104,"waist":98,"shoulder":43}},{"size":"P","stock":true,"measurements":{"chest":110,"waist":104,"shoulder":45}},{"size":"M","stock":true,"measurements":{"chest":116,"waist":110,"shoulder":47}},{"size":"G","stock":true,"measurements":{"chest":122,"waist":116,"shoulder":49}},{"size":"GG","stock":true,"measurements":{"chest":128,"waist":122,"shoulder":51}}]'),
('calca-alfaiataria','Calça Alfaiataria Cintura Alta','Pregas fundas, cintura que não abre e perna wide leg.',389,'unissex','demo/calca-alfaiataria.jpg','caramelo','#C08B54','Lã fria com elastano','Cintura alta e barra ampla criam linha contínua.','{alfaiataria,minimalista,festa}','{trabalho,encontro,festa,dia-a-dia}','{ampulheta,inverted,retangulo,oval}','{"stretch":0.08,"ease":{"waist":2,"hips":6,"inseam":0},"weight":{"waist":0.42,"hips":0.4,"inseam":0.18},"tolerance":{"waist":2.5,"hips":4,"inseam":3}}','[{"size":"PP","stock":true,"measurements":{"waist":62,"hips":90,"inseam":70}},{"size":"P","stock":true,"measurements":{"waist":67,"hips":95,"inseam":72}},{"size":"M","stock":true,"measurements":{"waist":72,"hips":100,"inseam":73}},{"size":"G","stock":true,"measurements":{"waist":78,"hips":106,"inseam":75}},{"size":"GG","stock":true,"measurements":{"waist":84,"hips":112,"inseam":76}}]'),
('vestido-linho','Vestido Midi de Linho','Linho lavado com cinto para amarrar e saia evasê.',459,'feminino','demo/vestido-linho.jpg','terracota','#B4614A','Linho europeu','Saia evasê que afasta do quadril sem volume.','{romantico,descontraido}','{praia,encontro,viagem,festa}','{triangle,inverted,ampulheta,oval}','{"stretch":0.03,"ease":{"chest":8,"waist":6,"hips":8},"weight":{"chest":0.4,"waist":0.3,"hips":0.3},"tolerance":{"chest":5,"waist":4,"hips":5}}','[{"size":"PP","stock":true,"measurements":{"chest":88,"waist":74,"hips":96}},{"size":"P","stock":true,"measurements":{"chest":94,"waist":80,"hips":102}},{"size":"M","stock":true,"measurements":{"chest":100,"waist":86,"hips":108}},{"size":"G","stock":true,"measurements":{"chest":108,"waist":92,"hips":114}},{"size":"GG","stock":false,"measurements":{"chest":116,"waist":100,"hips":122}}]'),
('blazer','Blazer Desestruturado','Sem ombreiras, forro parcial, veste como um casaco leve.',649,'unissex','demo/blazer.jpg','grafite','#3A3A3C','Lã fria com viscose','Lapela longa afina o tronco e desvia do volume.','{alfaiataria,minimalista,festa}','{trabalho,festa,encontro}','{triangle,retangulo,ampulheta}','{"stretch":0.04,"ease":{"chest":12,"waist":10,"shoulder":2.5},"weight":{"chest":0.5,"shoulder":0.3,"waist":0.2},"tolerance":{"chest":5,"shoulder":1.8,"waist":5}}','[{"size":"PP","stock":true,"measurements":{"chest":100,"waist":94,"shoulder":41}},{"size":"P","stock":true,"measurements":{"chest":106,"waist":100,"shoulder":42.5}},{"size":"M","stock":true,"measurements":{"chest":112,"waist":106,"shoulder":44}},{"size":"G","stock":true,"measurements":{"chest":118,"waist":112,"shoulder":45.5}},{"size":"GG","stock":false,"measurements":{"chest":126,"waist":120,"shoulder":47.5}}]'),
('saia-plissada','Saia Midi Plissada','Pala de elástico embutido e plissado que não abre.',329,'feminino','demo/saia-plissada.jpg','rosé queimado','#C08C88','Georgette plissada','Plissado vertical que desce reto sobre o quadril.','{romantico,minimalista,festa}','{festa,encontro,trabalho}','{inverted,triangle,retangulo,ampulheta}','{"stretch":0.12,"ease":{"waist":2,"hips":6},"weight":{"waist":0.55,"hips":0.45},"tolerance":{"waist":2.5,"hips":4}}','[{"size":"PP","stock":true,"measurements":{"waist":60,"hips":88}},{"size":"P","stock":true,"measurements":{"waist":65,"hips":93}},{"size":"M","stock":true,"measurements":{"waist":70,"hips":98}},{"size":"G","stock":true,"measurements":{"waist":76,"hips":104}},{"size":"GG","stock":true,"measurements":{"waist":82,"hips":110}}]'),
('tricot','Tricot Canelado Gola Alta','Canelado de toque macio com elasticidade real.',379,'unissex','demo/tricot.jpg','verde oliva','#5E6B4A','Malha canelada de viscose e elastano','Acompanha o corpo sem colar, com gola que alonga.','{basico,minimalista,descontraido}','{dia-a-dia,viagem,encontro}','{ampulheta,retangulo,inverted}','{"stretch":0.35,"ease":{"chest":4,"waist":8,"shoulder":1},"weight":{"chest":0.55,"waist":0.2,"shoulder":0.25},"tolerance":{"chest":5,"waist":6,"shoulder":1.6}}','[{"size":"PP","stock":true,"measurements":{"chest":84,"waist":78,"shoulder":38}},{"size":"P","stock":true,"measurements":{"chest":90,"waist":84,"shoulder":40}},{"size":"M","stock":true,"measurements":{"chest":96,"waist":90,"shoulder":42}},{"size":"G","stock":true,"measurements":{"chest":102,"waist":96,"shoulder":44}},{"size":"GG","stock":true,"measurements":{"chest":110,"waist":104,"shoulder":46}}]'),
('jaqueta-jeans','Jaqueta Jeans Cropped','Barra curta, lavagem média e estrutura que segura a forma.',429,'unissex','demo/jaqueta-jeans.jpg','índigo','#4A6584','Denim 100% algodão','Cropped que marca a cintura e amplia a perna.','{streetwear,descontraido,basico}','{dia-a-dia,festa,viagem}','{retangulo,inverted,ampulheta}','{"stretch":0.02,"ease":{"chest":10,"waist":8,"shoulder":2},"weight":{"chest":0.5,"shoulder":0.3,"waist":0.2},"tolerance":{"chest":5,"shoulder":1.8,"waist":5}}','[{"size":"PP","stock":true,"measurements":{"chest":94,"waist":86,"shoulder":41}},{"size":"P","stock":true,"measurements":{"chest":100,"waist":92,"shoulder":42.5}},{"size":"M","stock":true,"measurements":{"chest":106,"waist":98,"shoulder":44}},{"size":"G","stock":true,"measurements":{"chest":112,"waist":104,"shoulder":45.5}},{"size":"GG","stock":true,"measurements":{"chest":120,"waist":112,"shoulder":47.5}}]');