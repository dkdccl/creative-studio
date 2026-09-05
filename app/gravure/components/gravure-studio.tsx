'use client';

import { useMemo, useState } from 'react';

import {
  CHECKLIST_ITEMS,
  DEFAULT_PROMPT_SETTINGS,
  EMPTY_METADATA,
  type ChecklistId,
  type GravureMetadata,
  type PromptSettings,
} from '@/lib/gravure';

import { StepBatch } from './step-batch';
import { StepExport } from './step-export';
import { StepMetadata } from './step-metadata';
import { StepPrompt } from './step-prompt';
import { Stepper } from './ui';
import { useBatchGeneration } from './use-batch-generation';

/**
 * グラビアモードの司令塔。
 * 4 ステップぶんの状態をここに集めて、表示だけ各ステップに渡す。
 */
export default function GravureStudio() {
  const [step, setStep] = useState(1);
  const [settings, setSettings] = useState<PromptSettings>(DEFAULT_PROMPT_SETTINGS);
  const [count, setCount] = useState<number>(5);
  // img2img の参考画像。txt2img のときは null のまま
  const [reference, setReference] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<GravureMetadata>(EMPTY_METADATA);
  const [checked, setChecked] = useState<ChecklistId[]>([]);

  const batch = useBatchGeneration();

  const toggleChecklist = (id: ChecklistId) =>
    setChecked((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );

  // 入力が済んだステップにチェックを出す
  const completed = useMemo(() => {
    const done: number[] = [];
    if (settings.prompt.trim() !== '') done.push(1);
    if (batch.shots.length > 0) done.push(2);
    if (
      metadata.title.trim() !== '' &&
      CHECKLIST_ITEMS.every((item) => checked.includes(item.id))
    ) {
      done.push(3);
    }
    return done;
  }, [settings.prompt, batch.shots.length, metadata.title, checked]);

  return (
    <div className="space-y-8">
      <Stepper current={step} completed={completed} onSelect={setStep} />

      {step === 1 && (
        <StepPrompt
          settings={settings}
          onChange={setSettings}
          count={count}
          onCountChange={setCount}
          reference={reference}
          onReferenceChange={setReference}
          onNext={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <StepBatch
          batch={batch}
          count={count}
          settings={settings}
          reference={reference}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <StepMetadata
          metadata={metadata}
          onChange={setMetadata}
          checked={checked}
          onToggle={toggleChecklist}
          onNext={() => setStep(4)}
        />
      )}

      {step === 4 && <StepExport metadata={metadata} shots={batch.shots} />}
    </div>
  );
}
