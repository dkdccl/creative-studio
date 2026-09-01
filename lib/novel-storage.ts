import {
  createEmptyNovelProject,
  type NovelProject,
  type SceneBlock,
} from './types';

/**
 * 小説プロジェクトのローカル保存。
 *
 * 現段階では localStorage に自動保存する。
 * Supabase の novel_projects テーブルを用意したら、
 * loadNovelProject / saveNovelProject の中身を差し替えれば移行できる。
 */

const STORAGE_KEY = 'creative-studio:novel-project:v1';

export function loadNovelProject(): NovelProject | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NovelProject>;
    if (parsed.version !== 1) return null;
    // 保存後に項目が増えても壊れないよう、空プロジェクトへマージする
    const empty = createEmptyNovelProject();
    return {
      ...empty,
      ...parsed,
      serial: { ...empty.serial, ...parsed.serial },
      theme: { ...empty.theme, ...parsed.theme },
      characters: parsed.characters ?? [],
      // blocks は後から追加した項目なので、古い保存データにも補う
      scenes: (parsed.scenes ?? []).map((scene) => ({
        ...scene,
        blocks: (scene.blocks ?? []).map(normalizeBlock),
      })),
    };
  } catch {
    return null;
  }
}

/**
 * コマ割り自由 → 1ページ 6コマ固定に変えたときの読み替え。
 * 古い下書き（layout / prompt を持つ形）でも壊れずに開けるようにする。
 */
function normalizeBlock(block: SceneBlock): SceneBlock {
  if (block.kind === 'photo') {
    const photos = block.photos ?? [];
    return {
      ...block,
      photos,
      pages: block.pages ?? Math.max(1, Math.ceil(photos.length / 6)),
    };
  }
  const legacy = block as Partial<{ prompt: string }> & typeof block;
  return {
    ...block,
    story: block.story ?? legacy.prompt ?? '',
    pages: block.pages ?? 1,
    mood: block.mood ?? '',
  };
}

/**
 * 保存できたら true。
 * 写真シーンを大量に入れると localStorage の容量制限に当たるため、
 * 失敗を呼び出し側へ伝えて画面に警告を出せるようにしている。
 */
export function saveNovelProject(project: NovelProject): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    return true;
  } catch {
    // 容量超過やプライベートモードでは保存できない。編集自体は続行できる。
    return false;
  }
}

export function clearNovelProject(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 何もしない
  }
}

/** 衝突しない ID を作る（ブラウザ操作時にのみ呼ばれる） */
export function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
