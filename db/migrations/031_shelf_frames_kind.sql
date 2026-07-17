-- Generalizes shelf_frames beyond photo frames — a 'plant' is a purely
-- decorative shelf piece with no content picker (no book_id/image_url ever
-- set), reusing the exact same position/tilt/drag machinery as a frame.

alter table shelf_frames
  add column if not exists kind varchar(10) not null default 'frame';
