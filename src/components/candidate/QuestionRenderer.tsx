/**
 * QuestionRenderer — renders different question types dynamically
 * Supports: multiple_choice, true_false, short_answer, coding
 * Auto-saves answers to backend on change
 */

import React, { useCallback } from 'react';
import { CodeEditor } from '@/components/shared/CodeEditor';
import type { KeystrokeStats } from '@/components/shared/CodeEditor';
import type { Question } from '@/types/types';

interface QuestionRendererProps {
  question: Question;
  answer: string | number | undefined;
  onChange: (value: string | number) => void;
  onTelemetry?: (stats: KeystrokeStats) => void;
}

/**
 * Infers the effective question type from the question object.
 * Handles edge-cases where stored type might not match expected format.
 */
export function inferQuestionType(q: Question | null | undefined): string | undefined {
  if (!q) return undefined;

  const t = (q.type ?? '').toLowerCase().replace(/\s+/g, '_');

  // Direct match
  if (['coding', 'short_answer', 'true_false', 'multiple_choice'].includes(t)) return t;

  // Fuzzy: "shortAnswer" → "short_answer", "trueFalse" → "true_false"
  if (/short.?answer/i.test(t)) return 'short_answer';
  if (/true.?false/i.test(t)) return 'true_false';
  if (/multi/i.test(t)) return 'multiple_choice';
  if (/cod/i.test(t)) return 'coding';

  // Infer from data shape
  if (q.testCases && q.testCases.length > 0) return 'coding';
  if (q.entryPoint || q.languages?.length) return 'coding';

  if (q.options && q.options.length > 0) {
    // Check if it's a true/false question (only 2 options with true/false text)
    if (q.options.length === 2 && q.options.every(o => /^(true|false)$/i.test(o.text))) {
      return 'true_false';
    }
    return 'multiple_choice';
  }

  // Default to short answer
  return 'short_answer';
}

export const QuestionRenderer: React.FC<QuestionRendererProps> = ({
  question,
  answer,
  onChange,
  onTelemetry,
}) => {
  const effectiveType = inferQuestionType(question);

  const handleChange = useCallback((value: string | number) => {
    onChange(value);
  }, [onChange]);

  // Render coding editor
  if (effectiveType === 'coding') {
    return (
      <CodeEditor
        key={question.id}
        languages={question.languages ?? (question.language ? [question.language] : ['javascript'])}
        entryPoint={question.entryPoint ?? ''}
        starterCodes={
          question.starterCodes ??
          (question.language && question.starterCode ? { [question.language]: question.starterCode } : undefined)
        }
        testCases={question.testCases}
        value={(answer as string) ?? ''}
        onChange={(code) => handleChange(code)}
        onTelemetry={(stats) => onTelemetry?.(stats)}
      />
    );
  }

  // Render short answer
  if (effectiveType === 'short_answer') {
    return (
      <textarea
        className="w-full min-h-32 p-3 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
        placeholder="Type your answer here…"
        value={(answer as string) || ''}
        onChange={(e) => handleChange(e.target.value)}
        aria-label={`Answer to: ${question.text}`}
      />
    );
  }

  // Render true/false
  if (effectiveType === 'true_false') {
    return (
      <fieldset className="space-y-2">
        <legend className="sr-only">True or False answer</legend>
        {['True', 'False'].map((val) => (
          <label
            key={val}
            className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors min-h-12 ${
              answer === val ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
            }`}
          >
            <input
              type="radio"
              name={`q-${question.id}`}
              value={val}
              checked={answer === val}
              onChange={(e) => handleChange(e.target.value)}
              className="shrink-0 cursor-pointer"
              aria-label={val}
            />
            <span className="text-sm text-foreground font-medium">{val}</span>
          </label>
        ))}
      </fieldset>
    );
  }

  // Render multiple choice (default)
  if (question.options && question.options.length > 0) {
    return (
      <fieldset className="space-y-2">
        <legend className="sr-only">Multiple choice answer options</legend>
        {question.options.map((opt, i) => (
          <label
            key={opt.id ?? `option-${i}`}
            className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors min-h-12 ${
              answer === i ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
            }`}
          >
            <input
              type="radio"
              name={`q-${question.id}`}
              value={i}
              checked={answer === i}
              onChange={(e) => handleChange(Number(e.target.value))}
              className="shrink-0 cursor-pointer"
              aria-label={opt.text}
            />
            <span className="text-sm text-foreground flex-1">{opt.text}</span>
          </label>
        ))}
      </fieldset>
    );
  }

  // Fallback: render text area for questions without options or coding setup
  return (
    <textarea
      className="w-full min-h-32 p-3 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
      placeholder="Type your answer here…"
      value={(answer as string) || ''}
      onChange={(e) => handleChange(e.target.value)}
      aria-label={`Answer to: ${question.text}`}
    />
  );
};
