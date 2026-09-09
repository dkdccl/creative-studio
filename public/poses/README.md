# ポーズ参考画像

`lib/poses.ts` の `POSE_REFERENCES` が参照するファイルを、この場所に置く。

    pose_001.jpg  立ち・正面
    pose_002.jpg  しゃがみ・正面
    pose_003.jpg  座り・片膝立て
    pose_004.jpg  ベッドで横たわる
    pose_005.jpg  ベッドで膝立ち
    pose_006.jpg  仰向け・真上から

JPEG か PNG。長辺 1920px までに収めること（それを超えるぶんは
img2img へ渡す前に縮小されるので、大きくしても意味がない）。

ファイル名は lib/poses.ts の file と一致させる。増やすときは
lib/poses.ts に説明を書き足してから置く。
