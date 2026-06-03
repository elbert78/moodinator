"use client";

import Image from "next/image";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";

export default function AuthButton() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 animate-pulse rounded-full bg-slate-200" />
        <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
      </div>
    );
  }

  // ── Not logged in ──────────────────────────────────────────────────────────
  if (!session) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-2 rounded-full bg-[#1ed760] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#17c554]"
      >
        <SpotifyIcon />
        Connect Spotify
      </Link>
    );
  }

  // ── Token refresh failed — needs reconnection ──────────────────────────────
  if (session.error) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Session expired
        </span>
        <button
          type="button"
          onClick={() => signIn("spotify", { callbackUrl: "/" })}
          className="flex items-center gap-2 rounded-full bg-[#1ed760] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#17c554]"
        >
          <SpotifyIcon />
          Reconnect
        </button>
      </div>
    );
  }

  // ── Connected ──────────────────────────────────────────────────────────────
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        {session.user?.image ? (
          <Image
            src={session.user.image}
            alt={session.user.name ?? "Spotify user"}
            width={32}
            height={32}
            className="rounded-full object-cover ring-2 ring-[#1ed760]/60"
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1ed760]/20 text-xs font-bold text-[#1ed760]">
            {session.user?.name?.[0]?.toUpperCase() ?? "S"}
          </span>
        )}
        <div className="hidden sm:block">
          <p className="text-xs font-semibold text-slate-900 leading-tight">
            {session.user?.name ?? "Spotify User"}
          </p>
          <p className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 leading-tight">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Connected
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => signOut()}
        className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
      >
        Disconnect
      </button>
    </div>
  );
}

function SpotifyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.494 17.307a.748.748 0 0 1-1.029.249c-2.819-1.722-6.368-2.112-10.547-1.157a.748.748 0 1 1-.333-1.459c4.574-1.045 8.496-.595 11.66 1.337a.749.749 0 0 1 .249 1.03zm1.466-3.261a.937.937 0 0 1-1.287.308C14.65 12.517 10.535 11.9 7.391 12.82a.938.938 0 0 1-.543-1.793c3.595-1.089 8.063-.561 11.105 1.532a.936.936 0 0 1 .307 1.287zm.126-3.396C15.29 8.443 9.74 8.257 6.547 9.239a1.124 1.124 0 1 1-.652-2.15c3.661-1.111 9.75-.896 13.595 1.363a1.124 1.124 0 0 1-1.404 1.758z" />
    </svg>
  );
}
