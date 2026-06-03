export type MoodKey = "happy" | "sad" | "angry" | "surprised" | "neutral";

// Each mood has several title variants; the caller may pick by index or randomly.
const playlistTitles: Record<MoodKey, string[]> = {
  happy: [
    "Feel-Good Energy",
    "Sunshine & Good Vibes",
    "Pure Joy, No Filter",
    "Bright Side Anthems",
  ],
  sad: [
    "Late Night Reflections",
    "Soft Tears & Slow Songs",
    "Quiet Places",
    "Gentle Ache",
  ],
  angry: [
    "Full Throttle",
    "Channel the Rage",
    "High Voltage",
    "Unfiltered Intensity",
  ],
  surprised: [
    "Plot Twist Playlist",
    "Wide-Eyed & Electric",
    "Expect the Unexpected",
    "Bold & Unscripted",
  ],
  neutral: [
    "Calm & Collected",
    "Focus & Momentum",
    "Steady State",
    "Quiet Concentration",
  ],
};

const fallbackTitle = "Your Mood Mix";

/**
 * Returns a playlist title for a given mood.
 * Pass an optional `variant` index to cycle through alternatives
 * (wraps around, so any integer is safe).
 */
export function getPlaylistTitle(mood: MoodKey | null | undefined, variant = 0): string {
  if (!mood) return fallbackTitle;
  const titles = playlistTitles[mood];
  return titles[Math.abs(variant) % titles.length];
}

export function getSpotifyRecommendationParams(mood: MoodKey) {
  switch (mood) {
    case "happy":
      return {
        seed_genres: ["pop", "dance", "electronic"],
        target_valence: 0.85,
        target_energy: 0.8,
        min_popularity: 65,
        target_popularity: 85,
        search_terms: ["feel good", "uplifting", "sunny", "happy"],
        seed_artists: ["Dua Lipa", "Bruno Mars", "Katy Perry"],
      };
    case "sad":
      return {
        seed_genres: ["acoustic", "indie", "folk"],
        target_valence: 0.25,
        target_energy: 0.3,
        target_acousticness: 0.7,
        min_popularity: 45,
        target_popularity: 70,
        search_terms: ["slow", "melancholy", "heartbreak", "sad"],
        seed_artists: ["Olivia Dean", "Phoebe Bridgers", "Adele"],
      };
    case "angry":
      return {
        seed_genres: ["rock", "metal", "hard-rock"],
        target_valence: 0.2,
        target_energy: 0.9,
        min_popularity: 55,
        target_popularity: 80,
        search_terms: ["rage", "aggressive", "hard", "angry"],
        seed_artists: ["Linkin Park", "Metallica", "Bring Me The Horizon"],
      };
    case "surprised":
      return {
        seed_genres: ["edm", "pop", "dance"],
        target_valence: 0.65,
        target_energy: 0.75,
        min_popularity: 60,
        target_popularity: 82,
        search_terms: ["unexpected", "hype", "wild", "surprise"],
        seed_artists: ["The Weeknd", "Daft Punk", "Calvin Harris"],
      };
    case "neutral":
    default:
      return {
        seed_genres: ["jazz", "classical", "acoustic"],
        target_valence: 0.5,
        target_energy: 0.45,
        min_popularity: 40,
        target_popularity: 65,
        search_terms: ["calm", "chill", "focus", "steady"],
        seed_artists: ["Khruangbin", "Nujabes", "Norah Jones"],
      };
  }
}
