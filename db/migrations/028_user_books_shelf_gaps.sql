-- Persistent horizontal empty space around books in the editable shelf.
-- `before` supports a hole on the left or between books; `after` also lets
-- the last book leave intentional empty space to its right.

alter table user_books
  add column if not exists shelf_gap_before boolean not null default false,
  add column if not exists shelf_gap_after boolean not null default false;
