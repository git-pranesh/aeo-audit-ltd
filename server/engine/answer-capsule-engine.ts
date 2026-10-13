/**
 * Answer Capsule Engine — Module 1 (0–25 points)
 *
 * Answer capsules are the single strongest on-site predictor of AI citation.
 * 55% of AI Overview citations come from the first 30% of a page.
 * Optimal answer capsule: 40–150 words immediately after a question-based heading,
 * structured as: [Definition] → [Scope] → [Data point] → [Qualifier]
 */

import type { AnswerCapsuleSignals } from './blueprint-signals';

// ─── Question-framed heading detection ───────────────────────────────────────

const QUESTION_STARTERS = /^(how|what|why|when|which|who|where|can|does|is|are|will|should|could|would)\b/i;

const DEFINITION_PATTERNS = [
  // "X is/are a/an/the/used/known/the process/..." — direct definitional opening
  /^[A-Z][^.]{3,60} (is|are) (a|an|the|one|used|defined|known|considered|caused|characterized|the process|the practice|the term|the condition|the study) /i,
  /^[A-Z][^.]{3,60} (refers? to|describes?|means|denotes?|involves?|consists? of|is defined as|stands for) /i,
  // biographical / historical direct answers ("X was the first...", "X were founded...")
  /^[A-Z][^.]{2,60} (was|were) (a|an|the|one|founded|established|born|created|developed|named|known) /i,
  /^(a|an|the) [a-z][^.]{3,55} (is|are|refers? to|describes?|means) /i, // "A [thing] is..."
  /^in (simple|plain|brief|short|essence|general) terms?,? /i,
  /^[A-Z][A-Za-z0-9 ()'\-]{2,50}:\s+[A-Z]/,            // "Term: Definition"
  /^[A-Z][A-Za-z0-9 ()'\-]{2,50}\s+[—–]\s+[a-z]/,      // "Term — definition"
  /^[A-Z][^.]{3,60} (also (known|called|referred to)|abbreviated|aka) /i,
];

const DATA_POINT_PATTERNS = [
  /\b\d+(\.\d+)?(%|percent|million|billion|thousand|x|×)\b/i,
  /\b(r=|correlation of|correlates at|study (found|shows)|research (shows|found|indicates))\b/i,
  /\b\d{4}\b.*\b(study|research|survey|report|analysis)\b/i,
  /\b(according to|based on|per|citing)\b.{5,40}\b(\d+|\bdata\b|\bstudy\b)/i,
];

const FIRST_PERSON_EXPERIENTIAL = [
  /\bI (tested|tried|used|found|discovered|learned|built|created)\b/i,
  /\bwe (tested|found|discovered|built|analyzed|measured|observed)\b/i,
  /\bbased on (our|my) (experience|testing|research|analysis|review)\b/i,
  /\b(in my|in our) (experience|testing|opinion|review|analysis)\b/i,
];

// ─── Main analyzer ────────────────────────────────────────────────────────────

export function analyzeAnswerCapsule(
  html: string,
  text: string,
  primaryQuery?: string
): AnswerCapsuleSignals {
  const cleanText = text.replace(/\s+/g, ' ').trim();
  const first150Words = cleanText.split(/\s+/).slice(0, 150).join(' ');
  const first3Sentences = splitIntoSentences(cleanText).slice(0, 3).join(' ');

  // ── H1 style ──────────────────────────────────────────────────────────────
  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  const h1Text = h1Match ? stripHtml(h1Match[1]) : '';
  const h1IsDeclarative = h1Text.length > 0 && !QUESTION_STARTERS.test(h1Text.trim());

  // ── Question-framed H2/H3 headings ────────────────────────────────────────
  const h2h3Matches = Array.from(html.matchAll(/<h[23][^>]*>(.*?)<\/h[23]>/gi));
  const questionFramedHeadingCount = h2h3Matches.filter(m =>
    QUESTION_STARTERS.test(stripHtml(m[1]).trim())
  ).length;

  // ── Definition-first pattern ──────────────────────────────────────────────
  const firstSentence = splitIntoSentences(first150Words)[0] || '';
  const hasDefinitionFirstPattern = DEFINITION_PATTERNS.some(p => p.test(firstSentence.trim()));

  // ── Data point in first 3 sentences ───────────────────────────────────────
  const hasDataPointInFirst3Sentences = DATA_POINT_PATTERNS.some(p => p.test(first3Sentences));

  // ── Answer blocks: 40–150 word paragraphs immediately under headings ──────
  const answerBlocksPresent = countAnswerBlocks(html);

  // ── Score calculation ──────────────────────────────────────────────────────
  let score = 0;

  // H1 present = +3. Question-style H1s ("What is X?") are NOT penalized — they
  // mirror how people query AI assistants and are favoured in retrieval.
  if (h1Text.trim().length > 0) score += 3;

  // Definition-first opening = +6
  if (hasDefinitionFirstPattern) score += 6;

  // Data point in first 3 sentences = +5
  if (hasDataPointInFirst3Sentences) score += 5;

  // Question-framed subheadings = up to +6 (2 pts each, cap at 3)
  score += Math.min(6, questionFramedHeadingCount * 2);

  // Answer blocks present = up to +5
  score += Math.min(5, answerBlocksPresent);

  const answerCapsuleScore = Math.max(0, Math.min(25, score));

  return {
    first150WordCount: first150Words.split(/\s+/).length,
    hasDefinitionFirstPattern,
    hasDataPointInFirst3Sentences,
    questionFramedHeadingCount,
    answerBlocksPresent,
    h1IsDeclarative,
    answerCapsuleScore,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map(s => s.trim())
    .filter(s => s.length > 10);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function countAnswerBlocks(html: string): number {
  // Match H2/H3 followed immediately by a paragraph
  const headingParagraphPairs = html.matchAll(
    /<h[23][^>]*>[\s\S]*?<\/h[23]>\s*<p[^>]*>([\s\S]*?)<\/p>/gi
  );

  let count = 0;
  for (const match of Array.from(headingParagraphPairs)) {
    const paraText = stripHtml(match[1]);
    const wordCount = paraText.split(/\s+/).filter(Boolean).length;
    // 40–150 words = optimal answer block
    if (wordCount >= 40 && wordCount <= 150) count++;
  }
  return count;
}
