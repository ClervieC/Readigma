-- A real book's spine has its own physical thickness — a photo of it
-- shouldn't get squeezed into every other book's fixed-width tile. Storing
-- the photo's own width/height ratio lets the shelf render this book
-- proportionally wider or thinner instead.
alter table user_books add column if not exists spine_photo_aspect numeric(6,4);
