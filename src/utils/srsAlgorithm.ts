/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SuperMemo-2 (SM-2) Spaced Repetition Algorithm
 * 
 * Quality:
 * 0: Complete blackout
 * 1: Incorrect, but upon seeing the correct answer it felt familiar
 * 2: Incorrect, but upon seeing the correct answer it seemed easy to remember
 * 3: Correct, but required significant difficulty to recall (Hard)
 * 4: Correct, after some hesitation (Good)
 * 5: Perfect response (Easy)
 */
export function calculateNextReview(
  quality: number,
  previousEaseFactor: number = 2.5,
  previousInterval: number = 0,
  previousRepetitions: number = 0
): {
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReviewDate: number;
} {
  let repetitions = previousRepetitions;
  let interval = previousInterval;
  let easeFactor = previousEaseFactor;

  // Calculate new Ease Factor
  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  
  // Floor it at 1.3 to avoid exponential decay becoming a flatline
  if (easeFactor < 1.3) {
    easeFactor = 1.3;
  }

  // Calculate Repetitions and Interval
  if (quality >= 3) {
    // Correct response
    repetitions += 1;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
  } else {
    // Incorrect response
    repetitions = 0;
    interval = 1; // reset interval to 1 day for relearning
  }

  // Calculate next review date in milliseconds
  // 1 day = 86400000 ms
  const nextReviewDate = Date.now() + interval * 86400000;

  return {
    interval,
    easeFactor,
    repetitions,
    nextReviewDate
  };
}
