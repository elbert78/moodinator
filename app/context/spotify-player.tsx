"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSession } from "next-auth/react";
import Script from "next/script";

// ── Spotify Web Playback SDK typings ──────────────────────────────────────────

interface SpotifyPlayerOptions {
  name: string;
  getOAuthToken: (callback: (token: string) => void) => void;
  volume?: number;
}

interface SpotifyPlaybackState {
  paused: boolean;
  position: number;
  duration: number;
  track_window: {
    current_track: SpotifySDKTrack;
  };
}

export interface SpotifySDKTrack {
  id: string;
  uri: string;
  name: string;
  artists: Array<{ name: string; uri: string }>;
  album: {
    name: string;
    images: Array<{ url: string; width: number; height: number }>;
  };
  duration_ms: number;
}

interface SpotifyPlayerInstance {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (event: string, callback: (arg: any) => void) => boolean;
  setVolume: (volume: number) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  previousTrack: () => Promise<void>;
  nextTrack: () => Promise<void>;
}

declare global {
  interface Window {
    Spotify: {
      Player: new (options: SpotifyPlayerOptions) => SpotifyPlayerInstance;
    };
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

// ── Context types ─────────────────────────────────────────────────────────────

export interface PlayerState {
  isReady: boolean;
  isPlaying: boolean;
  currentTrack: SpotifySDKTrack | null;
  position: number;
  duration: number;
  volume: number;
  deviceId: string | null;
  error: string | null;
  playPending: boolean;
}

interface SpotifyPlayerContextValue {
  state: PlayerState;
  playTracks: (uris: string[], offsetIndex?: number) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  skipNext: () => Promise<void>;
  skipPrev: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
}

const SpotifyPlayerContext = createContext<SpotifyPlayerContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function SpotifyPlayerProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();

  const playerRef = useRef<SpotifyPlayerInstance | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  // Always holds the latest access token so getOAuthToken stays current across refreshes
  const accessTokenRef = useRef<string | null>(null);

  const [sdkReady, setSdkReady] = useState(false);
  const [state, setState] = useState<PlayerState>({
    isReady: false,
    isPlaying: false,
    currentTrack: null,
    position: 0,
    duration: 0,
    volume: 0.5,
    deviceId: null,
    error: null,
    playPending: false,
  });

  useEffect(() => {
    accessTokenRef.current = session?.accessToken ?? null;
  }, [session?.accessToken]);

  const initializePlayer = useCallback(() => {
    if (playerRef.current || !window.Spotify) return;

    const player = new window.Spotify.Player({
      name: "Moodinator",
      getOAuthToken: (cb) => {
        if (accessTokenRef.current) cb(accessTokenRef.current);
      },
      volume: 0.5,
    });

    player.addListener("ready", ({ device_id }: { device_id: string }) => {
      deviceIdRef.current = device_id;
      setState((prev) => ({ ...prev, isReady: true, deviceId: device_id, error: null }));
    });

    player.addListener("not_ready", () => {
      deviceIdRef.current = null;
      setState((prev) => ({ ...prev, isReady: false, deviceId: null }));
    });

    player.addListener("player_state_changed", (ps: SpotifyPlaybackState | null) => {
      if (!ps) return;
      setState((prev) => ({
        ...prev,
        isPlaying: !ps.paused,
        currentTrack: ps.track_window.current_track,
        position: ps.position,
        duration: ps.duration,
      }));
    });

    player.addListener("initialization_error", ({ message }: { message: string }) => {
      setState((prev) => ({ ...prev, error: message }));
    });

    player.addListener("authentication_error", ({ message }: { message: string }) => {
      setState((prev) => ({ ...prev, error: message }));
    });

    // Fired when account is not Premium
    player.addListener("account_error", () => {
      setState((prev) => ({
        ...prev,
        error: "Spotify Premium is required for in-app playback.",
      }));
    });

    player.connect();
    playerRef.current = player;
  }, []);

  // Initialize once when both SDK and session are available
  useEffect(() => {
    if (!sdkReady || !session?.accessToken || playerRef.current) return;
    initializePlayer();
  }, [sdkReady, session?.accessToken, initializePlayer]);

  // Disconnect on unmount
  useEffect(() => {
    return () => {
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, []);

  // Register the SDK-ready callback before the script runs; also handle hot reloads
  // where window.Spotify might already exist
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.Spotify) {
      setSdkReady(true);
      return;
    }
    window.onSpotifyWebPlaybackSDKReady = () => setSdkReady(true);
  }, []);

  const playTracks = useCallback(async (uris: string[], offsetIndex = 0) => {
    const token = accessTokenRef.current;
    const deviceId = deviceIdRef.current;
    if (!token || !deviceId) return;

    setState((prev) => ({ ...prev, playPending: true, error: null }));

    const attempt = (devId: string, tok: string) =>
      fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(devId)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${tok}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ uris, offset: { position: offsetIndex } }),
        }
      );

    let res = await attempt(deviceId, token);

    // 404 = device not yet registered on Spotify's backend (SDK ready/backend lag)
    // 502/503 = transient Spotify API error — retry once after a short delay
    if (!res.ok && (res.status === 404 || res.status === 502 || res.status === 503)) {
      await new Promise<void>((r) => setTimeout(r, 500));
      // Re-read refs in case the device reconnected during the wait
      const retryDeviceId = deviceIdRef.current ?? deviceId;
      const retryToken = accessTokenRef.current ?? token;
      res = await attempt(retryDeviceId, retryToken);
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message: string =
        body?.error?.message ?? `Playback error (${res.status})`;
      setState((prev) => ({ ...prev, error: message, playPending: false }));
    } else {
      setState((prev) => ({ ...prev, playPending: false }));
    }
  }, []);

  const pause = useCallback(async () => {
    await playerRef.current?.pause();
  }, []);

  const resume = useCallback(async () => {
    await playerRef.current?.resume();
  }, []);

  const skipNext = useCallback(async () => {
    await playerRef.current?.nextTrack();
  }, []);

  const skipPrev = useCallback(async () => {
    await playerRef.current?.previousTrack();
  }, []);

  const seek = useCallback(async (positionMs: number) => {
    await playerRef.current?.seek(positionMs);
  }, []);

  const setVolumeHandler = useCallback(async (volume: number) => {
    await playerRef.current?.setVolume(volume);
    setState((prev) => ({ ...prev, volume }));
  }, []);

  return (
    <SpotifyPlayerContext.Provider
      value={{
        state,
        playTracks,
        pause,
        resume,
        skipNext,
        skipPrev,
        seek,
        setVolume: setVolumeHandler,
      }}
    >
      {/* Load SDK for all authenticated users; onLoad fires in client components */}
      <Script
        src="https://sdk.scdn.co/spotify-player.js"
        strategy="afterInteractive"
        onLoad={() => {
          if (window.Spotify) setSdkReady(true);
        }}
      />
      {children}
    </SpotifyPlayerContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSpotifyPlayer() {
  const ctx = useContext(SpotifyPlayerContext);
  if (!ctx) throw new Error("useSpotifyPlayer must be used inside SpotifyPlayerProvider");
  return ctx;
}
