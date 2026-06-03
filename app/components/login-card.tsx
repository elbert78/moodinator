"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";

export default function LoginCard() {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [router, status]);

  return (
    <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-10 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.5)]">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1ed760]/15">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="#1ed760" aria-hidden>
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.494 17.307a.748.748 0 0 1-1.029.249c-2.819-1.722-6.368-2.112-10.547-1.157a.748.748 0 1 1-.333-1.459c4.574-1.045 8.496-.595 11.66 1.337a.749.749 0 0 1 .249 1.03zm1.466-3.261a.937.937 0 0 1-1.287.308C14.65 12.517 10.535 11.9 7.391 12.82a.938.938 0 0 1-.543-1.793c3.595-1.089 8.063-.561 11.105 1.532a.936.936 0 0 1 .307 1.287zm.126-3.396C15.29 8.443 9.74 8.257 6.547 9.239a1.124 1.124 0 1 1-.652-2.15c3.661-1.111 9.75-.896 13.595 1.363a1.124 1.124 0 0 1-1.404 1.758z" />
          </svg>
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900">Welcome to MOODINATOR</h1>
          <p className="text-sm text-slate-500">
            Connect your Spotify account to detect your mood and generate personalised playlists.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => signIn("spotify", { callbackUrl: "/" })}
        className="mt-8 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#1ed760] py-3.5 text-sm font-semibold text-white shadow-[0_8px_20px_-10px_rgba(30,215,96,0.7)] transition hover:-translate-y-0.5 hover:bg-[#17c554] active:translate-y-0"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.494 17.307a.748.748 0 0 1-1.029.249c-2.819-1.722-6.368-2.112-10.547-1.157a.748.748 0 1 1-.333-1.459c4.574-1.045 8.496-.595 11.66 1.337a.749.749 0 0 1 .249 1.03zm1.466-3.261a.937.937 0 0 1-1.287.308C14.65 12.517 10.535 11.9 7.391 12.82a.938.938 0 0 1-.543-1.793c3.595-1.089 8.063-.561 11.105 1.532a.936.936 0 0 1 .307 1.287zm.126-3.396C15.29 8.443 9.74 8.257 6.547 9.239a1.124 1.124 0 1 1-.652-2.15c3.661-1.111 9.75-.896 13.595 1.363a1.124 1.124 0 0 1-1.404 1.758z" />
        </svg>
        Continue with Spotify
      </button>

      <p className="mt-6 text-center text-xs text-slate-400">
        By connecting, you agree to Spotify&apos;s{" "}
        <a
          href="https://www.spotify.com/legal/end-user-agreement/"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-slate-600"
        >
          Terms of Service
        </a>
        . Moodinator only requests the permissions it needs.
      </p>
    </div>
  );
}
