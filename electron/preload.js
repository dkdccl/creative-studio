const { contextBridge, ipcRenderer } = require('electron');

/**
 * レンダラーへ渡す窓口。
 *
 * contextIsolation の内側なので、画面側は fs を直接触れない。
 * ここで名前を絞った関数だけを出し、実体はメインプロセスが持つ。
 *
 * メイン側は { ok, value } / { ok:false, error } の形で返すので、
 * ここで開いて、失敗なら例外にして呼び出し側に伝える。
 */

async function call(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result?.ok) throw new Error(result?.error ?? '処理に失敗しました。');
  return result.value;
}

contextBridge.exposeInMainWorld('desktop', {
  /** 画面側が「デスクトップ版で動いているか」を見分けるための目印 */
  isDesktop: true,

  workspaceDir: () => call('fs:workspace-dir'),
  openWorkspace: () => call('fs:open-workspace'),

  /** kind は 'gravure' か 'novel' */
  nextVolumeNumber: (kind, seriesTitle) =>
    call('fs:next-volume', kind, seriesTitle ?? ''),

  // 画像や PDF は Uint8Array で渡す。Blob はそのままでは IPC に載らない
  saveGravureImage: (volumeNumber, imageNumber, bytes, extension) =>
    call('fs:save-gravure-image', volumeNumber, imageNumber, bytes, extension),
  saveGravurePdf: (volumeNumber, bytes) =>
    call('fs:save-gravure-pdf', volumeNumber, bytes),

  saveNovelStory: (seriesTitle, volumeNumber, title, content, summary) =>
    call('fs:save-novel-story', seriesTitle, volumeNumber, title, content, summary),
  previousVolumeSummary: (seriesTitle, volumeNumber) =>
    call('fs:previous-summary', seriesTitle, volumeNumber),
});
