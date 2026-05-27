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

function buildSearchQuery(mood: MoodKey, seedGenres: string[]) {
  return [mood, ...seedGenres].join(" ");
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

  let response = await fetch(`${baseUrl}?${query.toString()}`, {
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const searchQuery = new URLSearchParams({
      type: "track",
      market: "US",
      limit: "8",
      q: buildSearchQuery(mood, params.seed_genres),
    });

    response = await fetch(`${searchUrl}?${searchQuery.toString()}`, {
      headers,
      cache: "no-store",
    });
  }

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
  const sourceTracks = Array.isArray(data?.tracks)
    ? data.tracks
    : data?.tracks?.items ?? [];
  const tracks =
    sourceTracks?.map((track: any) => ({
      id: track.id,
      name: track.name,
      artists: track.artists?.map((artist: any) => artist.name).join(", "),
      uri: track.uri,
    })) ?? [];

  return NextResponse.json({ tracks });
}
