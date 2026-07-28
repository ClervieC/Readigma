-- Reverts 053: every spine now renders at the same fixed size again
-- regardless of the uploaded photo — the app instead guides the shot to
-- the right shape up front (a stencil overlay shown before the camera
-- opens), so there's no per-book aspect ratio left to track.
alter table user_books drop column if exists spine_photo_aspect;
