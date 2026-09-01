'use client';

import type { EpisodeRecord } from '@/lib/series';

/** STEP 4 の最上部に出す「前の話の情報」 */
export function PreviousEpisodePanel({
  episode,
}: {
  episode: EpisodeRecord;
}) {
  return (
    <section className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-5">
      <p className="text-sm font-bold text-amber-100">【前の話の情報】</p>

      <p className="mt-3 text-base font-bold text-white">
        第{episode.episode}話：{episode.title}
      </p>

      <div className="mt-4 space-y-4 text-sm">
        <div>
          <p className="text-xs font-bold text-amber-100/80">【あらすじ】</p>
          <p className="mt-1 leading-7 text-blue-50/80">
            {episode.summary || '（本文がまだありません）'}
          </p>
        </div>

        <div>
          <p className="text-xs font-bold text-amber-100/80">【登場人物】</p>
          {episode.characters.length === 0 ? (
            <p className="mt-1 text-blue-100/40">（登録なし）</p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {episode.characters.map((character) => (
                <li key={character.name} className="text-blue-50/80">
                  ・{character.name}
                  <span className="ml-2 text-xs text-blue-200/50">
                    {character.role}
                    {character.description && `／${character.description}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="text-xs font-bold text-amber-100/80">
            【前回のエンディング】
          </p>
          <p className="mt-1 leading-7 text-blue-50/80">
            {episode.ending || '（本文がまだありません）'}
          </p>
        </div>
      </div>
    </section>
  );
}
