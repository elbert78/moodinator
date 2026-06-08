"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import * as faceapi from "face-api.js";
import { useSpotifyPlayer } from "@/app/context/spotify-player";
import { getPlaylistTitle } from "@/lib/spotify";
import type { MoodKey } from "@/lib/spotify";

type Track = {
  id: string;
  name: string;
  artists: string;
  uri: string;
};

const moodDetails: Record<
  MoodKey,
  { label: string; description: string; badge: string }
> = {
  happy: {
    label: "Happy",
    badge: "bg-lime-200 text-lime-900",
    description:
      "We're recommending upbeat, feel-good songs to match your positive energy and keep the vibes high.",
  },
  sad: {
    label: "Sad",
    badge: "bg-sky-200 text-sky-900",
    description:
      "We've lined up gentle, warm tracks to help you feel seen and supported.",
  },
  angry: {
    label: "Angry",
    badge: "bg-rose-200 text-rose-900",
    description:
      "High-energy picks ahead to channel that intensity into something powerful.",
  },
  surprised: {
    label: "Surprised",
    badge: "bg-amber-200 text-amber-900",
    description:
      "Expect bold, playful tracks to match that wide-eyed energy.",
  },
  neutral: {
    label: "Neutral",
    badge: "bg-slate-200 text-slate-900",
    description:
      "Calm, focused songs to keep things steady and comfortable.",
  },
};

function mapExpressionToMood(expression: string): MoodKey {
  switch (expression) {
    case "happy":
      return "happy";
    case "sad":
      return "sad";
    case "angry":
      return "angry";
    case "surprised":
      return "surprised";
    case "fearful":
      return "surprised";
    case "disgusted":
      return "angry";
    case "neutral":
    default:
      return "neutral";
  }
}

export default function MoodDashboard() {
  const { data: session } = useSession();
  const { state: playerState, playTracks } = useSpotifyPlayer();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const detectingRef = useRef(false);
  const lastRequestedMoodRef = useRef<MoodKey | null>(null);

  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [dominantExpression, setDominantExpression] = useState<string>("neutral");
  const [confidence, setConfidence] = useState(0);
  const [hasFace, setHasFace] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlistStatus, setPlaylistStatus] = useState<{
    state: "idle" | "loading" | "ready" | "error";
    message?: string;
  }>({ state: "idle" });
  const [savingPlaylist, setSavingPlaylist] = useState(false);
  const [savedPlaylistUrl, setSavedPlaylistUrl] = useState<string | null>(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionMood, setCorrectionMood] = useState<MoodKey>("neutral");
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [correctionSaving, setCorrectionSaving] = useState(false);
  const [confirmedMood, setConfirmedMood] = useState<MoodKey | null>(null);
  const [accuracyFeedback, setAccuracyFeedback] = useState<string | null>(null);
  const [titleVariant, setTitleVariant] = useState(0);

  const moodKey = useMemo(
    () => mapExpressionToMood(dominantExpression),
    [dominantExpression]
  );

  const activeMood = confirmedMood ?? moodKey;

  const playlistTitle = useMemo(
    () => getPlaylistTitle(tracks.length > 0 ? activeMood : null, titleVariant),
    [activeMood, tracks.length, titleVariant]
  );

  useEffect(() => {
    let active = true;

    async function loadModels() {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
          faceapi.nets.faceExpressionNet.loadFromUri("/models"),
        ]);
        if (active) {
          setModelsLoaded(true);
        }
      } catch (error) {
        if (active) {
          setModelsLoaded(false);
        }
      }
    }

    loadModels();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function initCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraReady(true);
        setCameraError(null);
      } catch (error) {
        setCameraError("Camera permission denied or unavailable.");
      }
    }

    initCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  async function analyzeFrame() {
    if (!videoRef.current) return;
    if (detectingRef.current) return;
    detectingRef.current = true;
    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: 224,
      scoreThreshold: 0.5,
    });
    try {
      const result = await faceapi
        .detectSingleFace(videoRef.current, options)
        .withFaceExpressions();

      if (!result?.expressions) {
        setConfidence(0);
        setDominantExpression("neutral");
        setHasFace(false);
        return;
      }

      const entries = Object.entries(result.expressions);
      const [topExpression, topScore] = entries.sort((a, b) => b[1] - a[1])[0];
      setDominantExpression(topExpression);
      setConfidence(topScore);
      setHasFace(true);
    } finally {
      detectingRef.current = false;
    }
  }

  function startAnalyzing() {
    if (!modelsLoaded || !cameraReady || !videoRef.current) return;
    if (intervalRef.current) return;
    setConfirmedMood(null);
    lastRequestedMoodRef.current = null;
    setIsAnalyzing(true);
    intervalRef.current = window.setInterval(() => {
      analyzeFrame();
    }, 500);
  }

  function stopAnalyzing() {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsAnalyzing(false);
  }

  useEffect(() => {
    if (!isAnalyzing) return;
    if (!session?.accessToken) return;
    if (!hasFace) return;
    if (confirmedMood) return;
    if (lastRequestedMoodRef.current === moodKey) return;

    lastRequestedMoodRef.current = moodKey;
    fetchRecommendations(moodKey).catch((error) => {
      setPlaylistStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    });
  }, [isAnalyzing, moodKey, session?.accessToken, hasFace, confirmedMood]);

  async function fetchRecommendations(requestedMood: MoodKey) {
    setPlaylistStatus({ state: "loading" });
    setSavedPlaylistUrl(null);

    const response = await fetch(
      `/api/spotify/recommendations?mood=${requestedMood}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error ?? "Failed to fetch recommendations.");
    }

    const data = await response.json();
    const nextTracks = data.tracks ?? [];
    setTracks(nextTracks);
    setTitleVariant((v) => v + 1);
    setPlaylistStatus({ state: "ready" });
    return nextTracks as Track[];
  }

  async function savePlaylist(requestedMood: MoodKey, nextTracks: Track[]) {
    const response = await fetch("/api/spotify/playlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mood: requestedMood,
        tracks: nextTracks.map((track) => track.uri),
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error ?? "Failed to save playlist.");
    }

    const data = await response.json();
    return data.url ?? null;
  }

  async function handleSavePlaylist() {
    if (!session?.accessToken || tracks.length === 0) return;
    setSavingPlaylist(true);
    setSavedPlaylistUrl(null);

    try {
      const url = await savePlaylist(activeMood, tracks);
      setSavedPlaylistUrl(url);
    } catch (error) {
      setPlaylistStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSavingPlaylist(false);
    }
  }

  async function handleCorrectionSubmit() {
    if (!session?.accessToken) return;
    setCorrectionError(null);
    setCorrectionSaving(true);
    let success = false;

    try {
      const nextTracks = await fetchRecommendations(correctionMood);
      if (nextTracks.length === 0) {
        throw new Error("No tracks found for that mood.");
      }
      const url = await savePlaylist(correctionMood, nextTracks);
      setConfirmedMood(correctionMood);
      lastRequestedMoodRef.current = correctionMood;
      setSavedPlaylistUrl(url);
      success = true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save playlist.";
      setPlaylistStatus({ state: "error", message });
      setCorrectionError(message);
    } finally {
      setCorrectionSaving(false);
      if (success) {
        setShowCorrection(false);
      }
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pb-32">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="rounded-[32px] border border-white/80 bg-white/90 p-8 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.6)] backdrop-blur">
          <h2 className="text-2xl font-semibold text-slate-900">
            Detect your mood!
          </h2>
          <div className="relative mt-6 aspect-video overflow-hidden rounded-2xl bg-slate-900/10">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              muted
              playsInline
            />
            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-200/70 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Waiting for camera...
              </div>
            )}
          </div>
          {cameraError && (
            <p className="mt-3 text-sm text-red-600">{cameraError}</p>
          )}
          <button
            className="mt-6 w-full rounded-full bg-gradient-to-r from-[var(--accent-warm)] to-[var(--accent)] py-3 text-lg font-semibold text-white shadow-[0_12px_25px_-18px_rgba(255,106,106,0.9)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={isAnalyzing ? stopAnalyzing : startAnalyzing}
            type="button"
            disabled={!modelsLoaded || !cameraReady}
          >
            {isAnalyzing ? "Stop" : "Analyze"}
          </button>
          {!modelsLoaded && (
            <p className="mt-3 text-xs text-slate-500">
              Loading face detection models...
            </p>
          )}
        </div>

        <div className="min-w-0 rounded-[32px] border border-white/80 bg-white/90 p-8 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.6)] backdrop-blur">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <h3 className="min-w-0 truncate text-xl font-semibold text-slate-900">
              {playlistTitle}
            </h3>
            {playerState.isReady && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Player ready
              </span>
            )}
          </div>
          <div className="mt-6 min-w-0 space-y-3">
            {playlistStatus.state === "loading" ? (
              <div className="rounded-2xl bg-slate-100/90 px-4 py-3 text-sm font-medium text-slate-500">
                Generating recommendations...
              </div>
            ) : tracks.length === 0 ? (
              <div className="rounded-2xl bg-slate-100/90 px-4 py-3 text-sm font-medium text-slate-500">
                {session?.accessToken
                  ? "Analyze to generate tracks."
                  : "Login to generate tracks from Spotify."}
              </div>
            ) : null}
            {tracks.map((track, index) => {
              const isCurrentTrack = playerState.currentTrack?.uri === track.uri;
              const isPending = playerState.playPending && !isCurrentTrack;
              const isDisabled = !playerState.isReady || playerState.playPending;
              return (
                <button
                  key={track.id}
                  type="button"
                  disabled={isDisabled}
                  onClick={() =>
                    playTracks(
                      tracks.map((t) => t.uri),
                      index
                    )
                  }
                  className={`group flex min-w-0 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium shadow-[0_10px_25px_-20px_rgba(15,23,42,0.4)] transition disabled:cursor-default ${
                    isCurrentTrack
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100/90 text-slate-700 hover:bg-slate-200/80 disabled:opacity-60"
                  }`}
                >
                  {/* Play / spinner / equalizer icon */}
                  <span className="shrink-0">
                    {playerState.playPending && isCurrentTrack ? (
                      // Spinner while this track's request is in-flight
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin text-slate-300" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                        <path d="M12 2a10 10 0 0 1 10 10" />
                      </svg>
                    ) : isCurrentTrack && playerState.isPlaying ? (
                      // Equalizer bars while playing
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-emerald-400">
                        <rect x="2" y="10" width="4" height="10" rx="1" />
                        <rect x="10" y="4" width="4" height="16" rx="1" />
                        <rect x="18" y="7" width="4" height="13" rx="1" />
                      </svg>
                    ) : (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className={`transition ${
                          isCurrentTrack
                            ? "text-slate-300"
                            : "text-slate-400 group-hover:text-slate-600"
                        } ${!playerState.isReady || isPending ? "opacity-0" : ""}`}
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </span>
                  <span className="block min-w-0 flex-1 truncate">
                    {track.name} — {track.artists}
                  </span>
                </button>
              );
            })}
          </div>
          {playlistStatus.state === "error" && (
            <p className="mt-4 text-sm text-red-600">
              {playlistStatus.message}
            </p>
          )}
          {session?.error && (
            <p className="mt-4 text-sm text-amber-600">
              Your Spotify session expired. Please log in again.
            </p>
          )}
          <button
            className="mt-6 w-full rounded-full bg-gradient-to-r from-[#66f05e] to-[#2ecf4f] py-3 text-lg font-semibold text-white shadow-[0_12px_25px_-18px_rgba(46,207,79,0.8)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={!session?.accessToken || tracks.length === 0 || savingPlaylist}
            onClick={handleSavePlaylist}
          >
            {savingPlaylist ? "Saving..." : "Save to Spotify"}
          </button>
          {savedPlaylistUrl && (
            <p className="mt-3 text-xs text-emerald-600">
              Playlist saved.{" "}
              <a
                className="font-semibold text-emerald-700 underline"
                href={savedPlaylistUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open it in Spotify
              </a>
              .
            </p>
          )}
        </div>
      </section>

      <section className="rounded-[32px] border border-white/80 bg-white/90 p-8 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.6)]">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-lg font-semibold text-slate-900">You seem</span>
          <span
            className={`rounded-full px-4 py-1 text-sm font-semibold ${moodDetails[activeMood].badge}`}
          >
            {moodDetails[activeMood].label}
          </span>
          <span className="text-xs font-semibold text-slate-400">
            {Math.round(confidence * 100)}% confidence
          </span>
        </div>
        <p className="mt-4 text-base font-medium text-slate-700">
          {moodDetails[activeMood].description}
        </p>
        {!hasFace && isAnalyzing && (
          <p className="mt-3 text-sm text-amber-600">
            We can&apos;t see a face yet. Try better lighting or adjust your
            camera position.
          </p>
        )}
        <div className="mt-6 text-sm font-semibold text-slate-800">
          Is this accurate?
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            className="rounded-full bg-emerald-500 px-6 py-2 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5"
            type="button"
            onClick={() => {
              setConfirmedMood(null);
              lastRequestedMoodRef.current = null;
              setAccuracyFeedback("Thank you! We'll keep refining your mood match.");
            }}
          >
            Yes
          </button>
          <button
            className="rounded-full bg-red-500 px-6 py-2 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5"
            type="button"
            onClick={() => {
              setCorrectionMood(activeMood);
              setCorrectionError(null);
              setAccuracyFeedback(null);
              setShowCorrection(true);
            }}
          >
            No
          </button>
        </div>
        {accuracyFeedback && (
          <p className="mt-3 text-sm text-emerald-700">{accuracyFeedback}</p>
        )}
      </section>

      {showCorrection && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-6">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h4 className="text-lg font-semibold text-slate-900">
              Sorry about that.
            </h4>
            <p className="mt-2 text-sm text-slate-600">
              Tell us your current mood and we will create a playlist for it.
            </p>
            <div className="mt-4">
              <label className="text-sm font-semibold text-slate-700">
                Current mood
              </label>
              <select
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-100/70 px-4 py-3 text-sm text-slate-900"
                value={correctionMood}
                onChange={(event) =>
                  setCorrectionMood(event.target.value as MoodKey)
                }
              >
                {Object.keys(moodDetails).map((key) => (
                  <option key={key} value={key}>
                    {moodDetails[key as MoodKey].label}
                  </option>
                ))}
              </select>
            </div>
            {correctionError && (
              <p className="mt-3 text-sm text-red-600">{correctionError}</p>
            )}
            <div className="mt-5 flex gap-3">
              <button
                className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
                type="button"
                onClick={() => setShowCorrection(false)}
                disabled={correctionSaving}
              >
                Cancel
              </button>
              <button
                className="flex-1 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                type="button"
                onClick={handleCorrectionSubmit}
                disabled={correctionSaving}
              >
                {correctionSaving ? "Saving..." : "Create playlist"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
