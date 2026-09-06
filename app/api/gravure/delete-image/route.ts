import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import { requireUser } from '../../series/_auth';

export const runtime = 'nodejs';

/** 画像の実体を置いているバケット。supabase/migrations/0002_gravure_images.sql を参照 */
const BUCKET = 'gravure-images';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/gravure/delete-image
 * body: { imageId: string, userId?: string }
 *
 * Storage のファイルと gravure_images の行を両方消す。元には戻せない。
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const { supabase, user } = auth;

  let body: { imageId?: string; userId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'リクエストの形式が不正です。' },
      { status: 400 },
    );
  }

  const imageId = body.imageId?.trim();
  if (!imageId) {
    return NextResponse.json(
      { error: '削除する画像が指定されていません。' },
      { status: 400 },
    );
  }
  // uuid 以外を渡すと Postgres 側で型エラーになるので、先に弾いて 400 で返す
  if (!UUID_PATTERN.test(imageId)) {
    return NextResponse.json(
      { error: '画像 ID の形式が不正です。' },
      { status: 400 },
    );
  }

  // userId は送られてきても権限の根拠にはしない。ログイン中のユーザーと
  // 食い違っていないかを見るだけで、実際の判定はセッションと RLS に任せる。
  if (body.userId && body.userId !== user.id) {
    return NextResponse.json(
      { error: 'この画像を削除する権限がありません。' },
      { status: 403 },
    );
  }

  // 消す前に置き場所を引く。クライアントから渡されたパスは信用しない
  const { data: image, error: findError } = await supabase
    .from('gravure_images')
    .select('id, storage_path')
    .eq('id', imageId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }
  if (!image) {
    return NextResponse.json(
      { error: '画像が見つかりませんでした。' },
      { status: 404 },
    );
  }

  // 1. Storage から実体を消す
  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([image.storage_path]);

  if (storageError) {
    // 先に行を消すとファイルだけ残って誰も辿れなくなるため、ここで止める
    return NextResponse.json(
      { error: `画像ファイルの削除に失敗しました: ${storageError.message}` },
      { status: 500 },
    );
  }

  // remove() は「消す権限が無かった」場合もエラーではなく空の結果で返ってくる。
  // 消えたつもりで行だけ削ると、実体が残ったまま誰も辿れなくなるので確かめる。
  // 元から無いファイルはここに現れないため、二重削除は素通りできる。
  if (await stillExists(supabase, image.storage_path)) {
    return NextResponse.json(
      { error: '画像ファイルを削除できませんでした。' },
      { status: 500 },
    );
  }

  // 2. テーブルから行を消す
  const { data: deleted, error: deleteError } = await supabase
    .from('gravure_images')
    .delete()
    .eq('id', image.id)
    .eq('user_id', user.id)
    .select('id');

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }
  // delete() は 0 行でもエラーにならない。消せていないのに success を返さない
  if (!deleted || deleted.length === 0) {
    return NextResponse.json(
      { error: '画像の記録を削除できませんでした。' },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}

/** Storage にまだファイルが残っているか */
async function stillExists(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<boolean> {
  const slash = storagePath.lastIndexOf('/');
  const folder = slash === -1 ? '' : storagePath.slice(0, slash);
  const name = storagePath.slice(slash + 1);

  const { data } = await supabase.storage
    .from(BUCKET)
    .list(folder, { search: name });

  // search は部分一致なので、名前が完全に一致するものだけ見る
  return (data ?? []).some((object) => object.name === name);
}
