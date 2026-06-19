-- Carousel posts support for scheduled_posts.
-- Adds a media_type discriminator and a slides JSONB array so a single
-- scheduled post can hold an ordered set of carousel slide images.
-- Backwards compatible: existing single-image posts default to media_type='IMAGE'
-- and keep using image_url. Carousel posts use media_type='CAROUSEL' + slides.

alter table public.scheduled_posts
  add column if not exists media_type text not null default 'IMAGE'
    check (media_type in ('IMAGE', 'CAROUSEL')),
  add column if not exists slides jsonb not null default '[]'::jsonb;

-- A CAROUSEL post must carry between 2 and 10 slides; an IMAGE post must not.
alter table public.scheduled_posts
  add constraint scheduled_posts_carousel_slides_chk
  check (
    (media_type = 'IMAGE')
    or (media_type = 'CAROUSEL'
        and jsonb_array_length(slides) between 2 and 10)
  );

comment on column public.scheduled_posts.slides is
  'Ordered carousel slides: [{ "image_url": text, "hook": text, "kicker": text, "theme": "light|dark" }]';
