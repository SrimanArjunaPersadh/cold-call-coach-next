// The golden fixture: the one real call in Supabase, copied verbatim from row
// 6c9e53d4-23ea-4020-ba56-130290938e4f (69s, scored, linked to a lead).
//
// `STORED_METRICS` is what the OLD app computed and persisted for this exact
// transcript. The port is only correct if it reproduces that object byte for
// byte, so this fixture is the regression fence around every formula in
// `computeMetrics` — a rounding or gap-rule slip fails here even if the
// synthetic cases still pass. Do not regenerate it from the new code.

import type { CallMetrics, DiarisedTurn } from "../metrics"

export const GOLDEN_CALL_ID = "6c9e53d4-23ea-4020-ba56-130290938e4f"

export const GOLDEN_REP_SPEAKER = 0

export const GOLDEN_TRANSCRIPT: DiarisedTurn[] = [
  {
    speaker: 0,
    start: 27.24,
    end: 31.16,
    text: "Hi. Is this is this this is Shimon. Is this the owner of Auxiliary Plumbers that I'm speaking",
  },
  {
    speaker: 1,
    start: 31.16,
    end: 33.16,
    text: "to? Hi.",
  },
  {
    speaker: 0,
    start: 33.16,
    end: 44.325,
    text: "How are you doing, man? I'm good. I'm good, man. Look. I was actually, I was trying to find you guys online a bit earlier, and I was I was looking for a plumber in the area, and I couldn't really find, like, a website. I think I got your number. No.",
  },
  {
    speaker: 1,
    start: 44.325,
    end: 56.42494,
    text: "No. This is the website for all the websites for. Is it? There's two websites. Please don't try and sell me email stories by saying it's not websites. Alright? Thank you so much, and you have a good day.",
  },
  {
    speaker: 0,
    start: 56.42494,
    end: 61.064938,
    text: "Okay. You too. Thanks. You. That was bad. She dog.",
  },
]

export const GOLDEN_STORED_METRICS: CallMetrics = {
  version: 1,
  rep_speaker: 0,
  talk_listen: {
    rep_seconds: 19.7,
    total_seconds: 33.8,
    rep_pct: 58,
  },
  longest_monologue_seconds: 11.2,
  fillers: {
    count: 1,
    per_minute: 3,
  },
}
