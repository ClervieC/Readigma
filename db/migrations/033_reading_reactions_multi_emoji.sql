-- Allow storing several emojis per reaction (e.g. "😍🥰🔥") instead of a single one.
alter table reading_reactions alter column emoji type varchar(64);
