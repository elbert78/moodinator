import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { getSpotifyRecommendationParams, type MoodKey } from "@/lib/spotify";

export const dynamic = "force-dynamic";

const allowedMoods: MoodKey[] = [
  "happy",
  "sad",
  "angry",
  "surprised",
  "neutral",
];

type SpotifyTrack = {
  id: string;
  name: string;
  artists: string;
  uri: string;
  popularity?: number;
};

type SpotifySearchResponse = {
  tracks?: {
    items?: Array<{
      id: string;
      name: string;
      uri: string;
      popularity?: number;
      artists?: Array<{ name: string }>;
    }>;
  };
};

type SpotifyTrackItem = {
  id: string;
  name: string;
  uri: string;
  popularity?: number;
  artists?: Array<{ name: string }>;
};

function buildSearchQuery(mood: MoodKey, seedGenres: string[]) {
  return [mood, ...seedGenres].join(" ");
}

function shuffle<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function buildMoodSearchQueries(
  mood: MoodKey,
  params: ReturnType<typeof getSpotifyRecommendationParams>
): string[] {
  const terms = params.search_terms ?? [mood];
  const genreFilters = params.seed_genres.slice(0, 2).map((genre) => `genre:${genre}`);
  const artistFilters = (params.seed_artists ?? [])
    .slice(0, 2)
      .map((artist) => `artist:"${artist}"`);

  const queries: string[] = [];
  for (const term of terms.slice(0, 3)) {
    queries.push([term, ...genreFilters].join(" "));
  }

  if (artistFilters.length > 0) {
    queries.push([terms[0] ?? mood, ...artistFilters].join(" "));
  }

  return Array.from(new Set(queries));
}

function mapTracks(items: SpotifyTrackItem[] = []): SpotifyTrack[] {
  return items.map((track) => ({
    id: track.id,
    name: track.name,
    artists: track.artists?.map((artist) => artist.name).join(", ") ?? "",
    uri: track.uri,
    popularity: track.popularity,
  }));
}

async function searchTracks(
  query: string,
  headers: Record<string, string>
): Promise<SpotifyTrack[]> {
  const searchParams = new URLSearchParams({
    type: "track",
    market: "US",
    limit: "10",
    q: query,
  });

  const response = await fetch(
    `https://api.spotify.com/v1/search?${searchParams.toString()}`,
    { headers, cache: "no-store" }
  );

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as SpotifySearchResponse;
  return mapTracks(data.tracks?.items ?? []);
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const debugMode = searchParams.get("debug") === "1";
  const moodParam = searchParams.get("mood") ?? "neutral";
  const mood = allowedMoods.includes(moodParam as MoodKey)
    ? (moodParam as MoodKey)
    : "neutral";

  const params = getSpotifyRecommendationParams(mood);
  const query = new URLSearchParams({
    limit: "8",
    market: "US",
    seed_genres: params.seed_genres.join(","),
    target_valence: params.target_valence.toString(),
    target_energy: params.target_energy.toString(),
  });

  if ("target_acousticness" in params && params.target_acousticness) {
    query.set("target_acousticness", params.target_acousticness.toString());
  }

  if ("min_popularity" in params && params.min_popularity !== undefined) {
    query.set("min_popularity", params.min_popularity.toString());
  }

  if ("target_popularity" in params && params.target_popularity !== undefined) {
    query.set("target_popularity", params.target_popularity.toString());
  }

  const baseUrl = "https://api.spotify.com/v1/recommendations";
  const searchUrl = "https://api.spotify.com/v1/search";
  const headers = {
    Authorization: `Bearer ${session.accessToken}`,
  };

  if (debugMode) {
    const meResponse = await fetch("https://api.spotify.com/v1/me", {
      headers,
      cache: "no-store",
    });
    const meText = await meResponse.text().catch(() => "");

    const genresResponse = await fetch(
      "https://api.spotify.com/v1/recommendations/available-genre-seeds",
      {
        headers,
        cache: "no-store",
      }
    );
    const genresText = await genresResponse.text().catch(() => "");

    return NextResponse.json({
      me: {
        status: meResponse.status,
        statusText: meResponse.statusText,
        body: meText,
      },
      genres: {
        status: genresResponse.status,
        statusText: genresResponse.statusText,
        body: genresText,
      },
      recommendationsUrl: `${baseUrl}?${query.toString()}`,
    });
  }

  const searchQueries = shuffle(buildMoodSearchQueries(mood, params));
  const searchResults = await Promise.all(
    searchQueries.map((queryText) => searchTracks(queryText, headers))
  );
  const searchTracksMerged = searchResults.flat();

  const seen = new Set<string>();
  const dedupedSearch = searchTracksMerged.filter((track) => {
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });

  dedupedSearch.sort(
    (a, b) => (b.popularity ?? 0) - (a.popularity ?? 0)
  );

  let combinedTracks = dedupedSearch;

  if (combinedTracks.length < 8) {
    const response = await fetch(`${baseUrl}?${query.toString()}`, {
      headers,
      cache: "no-store",
    });

    if (response.ok) {
      const data = await response.json();
      const sourceTracks = Array.isArray(data?.tracks)
        ? data.tracks
        : data?.tracks?.items ?? [];
      const recommendationTracks =
        sourceTracks?.map((track: any) => ({
          id: track.id,
          name: track.name,
          artists: track.artists?.map((artist: any) => artist.name).join(", "),
          uri: track.uri,
          popularity: track.popularity,
        })) ?? [];

      for (const track of recommendationTracks) {
        if (!seen.has(track.id)) {
          seen.add(track.id);
          combinedTracks.push(track);
        }
      }
    }
  }

  if (combinedTracks.length === 0) {
    const fallbackQuery = new URLSearchParams({
      type: "track",
      market: "US",
      limit: "8",
      q: buildSearchQuery(mood, params.seed_genres),
    });

    const response = await fetch(`${searchUrl}?${fallbackQuery.toString()}`, {
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      let errorMessage = "Spotify request failed";

      try {
        const data = JSON.parse(errorText);
        errorMessage = data?.error?.message ?? errorMessage;
      } catch {
        // Response was not JSON.
      }

      return NextResponse.json(
        {
          error: errorMessage,
          status: response.status,
          statusText: response.statusText,
          details: errorText,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    combinedTracks = mapTracks(data?.tracks?.items ?? []);
  }

  const tracks = shuffle([...combinedTracks])
    .slice(0, 8)
    .map(({ popularity: _popularity, ...track }) => track);

  return NextResponse.json({ tracks });
}
