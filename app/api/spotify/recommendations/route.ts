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

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
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
  const headers = {
    Authorization: `Bearer ${session.accessToken}`,
  };

  let response = await fetch(`${baseUrl}?${query.toString()}`, {
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const fallbackQuery = new URLSearchParams({
      limit: "8",
      market: "US",
      seed_genres: "pop",
    });

    response = await fetch(`${baseUrl}?${fallbackQuery.toString()}`, {
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
  const tracks =
    data.tracks?.map((track: any) => ({
      id: track.id,
      name: track.name,
      artists: track.artists?.map((artist: any) => artist.name).join(", "),
      uri: track.uri,
    })) ?? [];

  return NextResponse.json({ tracks });
}
