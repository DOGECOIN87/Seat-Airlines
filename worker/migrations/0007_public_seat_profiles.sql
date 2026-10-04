-- Presence is the holder's explicit consent to publish website/social links.
-- Existing profiles remain private until their owner enables this setting.
CREATE TABLE IF NOT EXISTS public_seat_profiles (
  address TEXT PRIMARY KEY
);

-- Offering tags are public descriptions selected by the profile owner.
CREATE TABLE IF NOT EXISTS profile_categories (
  address TEXT PRIMARY KEY,
  categories TEXT NOT NULL DEFAULT '[]'
);
