import type { Metadata } from 'next';

import { NovelStudio } from './novel-studio';

export const metadata: Metadata = {
  title: '小説を書く',
  description:
    'テーマ選択・キャラクター設定・プロット構成・執筆・エクスポートの5ステップで小説を作ります。',
};

export default function NovelPage() {
  return <NovelStudio />;
}
