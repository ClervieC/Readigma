-- Same idea as user_books.manual_tilt (see migration 019): a user-chosen
-- tilt for a hung frame always wins over the automatic hashed angle; null
-- means "let it pick automatically".

alter table shelf_frames
  add column if not exists manual_tilt smallint;
