import { getSupabaseBrowserClient, isSupabaseConfigured } from './supabase';

/**
 * 取っておく参考画像の読み書き（ブラウザ）。
 *
 * 生成画像は保存しない方針なので、Supabase の容量を使うのはここだけ。
 * 実体は gravure-images バケットの「<user_id>/references/<uuid>」に置く。
 * 先頭フォルダが user_id なので 0002 の Storage ポリシーがそのまま効く。
 *
 * 画像は Next のサーバーを経由させず、ブラウザから直接やり取りする。
 * 権限は RLS で決まるため、間にサーバーを挟んでも増える安全性が無い。
 */

const BUCKET = 'gravure-images';

/** サムネイル用の署名付き URL の寿命（秒） */
const SIGNED_URL_TTL = 60 * 60;

export interface SavedReference {
  id: string;
  storagePath: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
  /** 一覧表示用。バケットが非公開なので署名付きで出す */
  signedUrl?: string;
}

interface ReferenceRow {
  id: string;
  storage_path: string;
  file_name: string;
  content_type: string;
  byte_size: number;
  created_at: string;
}

function toSavedReference(row: ReferenceRow): SavedReference {
  return {
    id: row.id,
    storagePath: row.storage_path,
    fileName: row.file_name,
    contentType: row.content_type,
    byteSize: row.byte_size,
    createdAt: row.created_at,
  };
}

/** 拡張子。元のファイル名から拾えなければ種類で決める */
function extensionFor(file: File): string {
  const fromName = file.name.match(/\.([A-Za-z0-9]+)$/)?.[1];
  if (fromName) return fromName.toLowerCase();
  return file.type === 'image/png' ? 'png' : 'jpg';
}

/** ログイン中で、かつ Supabase が使える状態か。使えないなら null */
async function currentUserId(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await getSupabaseBrowserClient().auth.getUser();
  return data.user?.id ?? null;
}

/** 保存済みかどうかを画面側が知るためだけに使う */
export async function canSaveReferences(): Promise<boolean> {
  return (await currentUserId()) !== null;
}

/**
 * 1 枚を保存する。
 * ログインしていなければ null を返す（例外にはしない）。
 */
export async function saveReference(file: File): Promise<SavedReference | null> {
  const userId = await currentUserId();
  if (!userId) return null;

  const supabase = getSupabaseBrowserClient();
  const storagePath = `${userId}/references/${crypto.randomUUID()}.${extensionFor(file)}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: file.type });

  if (uploadError) {
    throw new Error(`参考画像のアップロードに失敗しました: ${uploadError.message}`);
  }

  const { data, error: insertError } = await supabase
    .from('gravure_references')
    .insert({
      user_id: userId,
      storage_path: storagePath,
      file_name: file.name,
      content_type: file.type,
      byte_size: file.size,
    })
    .select('id, storage_path, file_name, content_type, byte_size, created_at')
    .single();

  if (insertError || !data) {
    // 行が作れないとファイルだけ残って辿れなくなるので、上げた実体を戻す
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw new Error(
      `参考画像の記録に失敗しました: ${insertError?.message ?? '行を作成できませんでした'}`,
    );
  }

  return toSavedReference(data as ReferenceRow);
}

/** 保存済みの一覧。サムネイル用の署名付き URL も付ける */
export async function listSavedReferences(): Promise<SavedReference[]> {
  const userId = await currentUserId();
  if (!userId) return [];

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('gravure_references')
    .select('id, storage_path, file_name, content_type, byte_size, created_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`保存済みの参考画像を読めませんでした: ${error.message}`);

  const references = (data as ReferenceRow[]).map(toSavedReference);
  if (references.length === 0) return references;

  // 1 枚ずつ発行すると枚数ぶん往復するのでまとめて作る
  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(
      references.map((reference) => reference.storagePath),
      SIGNED_URL_TTL,
    );

  const urls = new Map(
    (signed ?? []).map((item) => [item.path, item.signedUrl] as const),
  );
  return references.map((reference) => ({
    ...reference,
    signedUrl: urls.get(reference.storagePath) ?? undefined,
  }));
}

/** 保存済みの 1 枚を、もう一度 img2img に渡せる File として取り出す */
export async function downloadReference(reference: SavedReference): Promise<File> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(reference.storagePath);

  if (error || !data) {
    throw new Error(
      `参考画像を読み込めませんでした: ${error?.message ?? '中身が空でした'}`,
    );
  }

  return new File([data], reference.fileName || 'reference.jpg', {
    type: reference.contentType || data.type,
  });
}

/**
 * 保存済みの 1 枚を消す。実体 → 行の順で消す。
 *
 * remove() は権限が無くてもエラーにならず空で返り、delete() も 0 行で
 * エラーにならないので、どちらも結果を確かめてから終わる
 * （/api/gravure/delete-image と同じ考え方）。
 */
export async function deleteSavedReference(reference: SavedReference): Promise<void> {
  const supabase = getSupabaseBrowserClient();

  const { error: removeError } = await supabase.storage
    .from(BUCKET)
    .remove([reference.storagePath]);

  if (removeError) {
    throw new Error(`参考画像の削除に失敗しました: ${removeError.message}`);
  }

  const slash = reference.storagePath.lastIndexOf('/');
  const folder = reference.storagePath.slice(0, slash);
  const name = reference.storagePath.slice(slash + 1);
  const { data: left } = await supabase.storage
    .from(BUCKET)
    .list(folder, { search: name });

  // search は部分一致なので、名前が完全に一致するものだけ見る
  if ((left ?? []).some((object) => object.name === name)) {
    throw new Error('参考画像のファイルを削除できませんでした。');
  }

  const { data: deleted, error: deleteError } = await supabase
    .from('gravure_references')
    .delete()
    .eq('id', reference.id)
    .select('id');

  if (deleteError) {
    throw new Error(`参考画像の記録を削除できませんでした: ${deleteError.message}`);
  }
  if (!deleted || deleted.length === 0) {
    throw new Error('参考画像の記録を削除できませんでした。');
  }
}
