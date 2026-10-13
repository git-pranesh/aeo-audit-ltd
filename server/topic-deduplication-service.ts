/**
 * Topic Deduplication Service
 * 
 * Removes near-duplicate topics from the generated list to ensure diversity.
 * Uses keyword-based similarity detection to identify duplicates.
 */

interface Topic {
  topic: string;
  rationale: string;
  scoreImpact?: string;
  contentType?: string;
  platforms?: string[];
  targetPlatform?: string;
}

/**
 * Extract key terms from a topic for similarity comparison
 */
function extractKeyTerms(topic: string): Set<string> {
  // Remove common stop words and extract meaningful terms
  const stopWords = new Set([
    'how', 'to', 'the', 'a', 'an', 'and', 'or', 'for', 'with', 'your', 'by',
    'in', 'on', 'at', 'is', 'are', 'what', 'when', 'where', 'why', 'which',
    'step', 'guide', 'tutorial', 'faq', 'framework', 'using', 'into', 'from',
    'can', 'will', 'should', 'that', 'this', 'of', 'be', 'as', 'it', 'its'
  ]);
  
  const terms = topic.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
  
  return new Set(terms);
}

/**
 * Calculate Jaccard similarity between two sets of terms
 */
function calculateSimilarity(terms1: Set<string>, terms2: Set<string>): number {
  const arr1 = Array.from(terms1);
  const arr2 = Array.from(terms2);
  const intersection = arr1.filter(x => terms2.has(x));
  const unionSet = new Set([...arr1, ...arr2]);
  
  if (unionSet.size === 0) return 0;
  return intersection.length / unionSet.size;
}

/**
 * Deduplicate topics based on similarity threshold
 * 
 * @param topics - Array of topics to deduplicate
 * @param similarityThreshold - Topics with similarity above this are considered duplicates (default: 0.6)
 * @returns Deduplicated array of topics
 */
function extractIntentFingerprint(title: string): string {
  // Extract the core intent: first 4 content words, lowercased, stopwords removed
  const stopwords = new Set(['a','an','the','for','in','of','to','and','or',
    'with','how','what','why','when','where','which','is','are','do','does',
    'your','my','our','their','its','this','that','these','those','at','by',
    'from','on','as','into','about','between','through','during','best','top']);
  const words = title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w));
  return words.slice(0, 4).sort().join('|');
}

export function deduplicateTopics<T extends Topic>(
  topics: T[],
  similarityThreshold: number = 0.65
): T[] {
  if (topics.length <= 1) return topics;
  
  const result: T[] = [];
  const usedTermSets: Set<string>[] = [];
  const usedFingerprints: string[] = [];
  
  for (const topicB of topics) {
    const terms = extractKeyTerms(topicB.topic);
    const fp2 = extractIntentFingerprint(topicB.topic);
    
    // Check similarity against all already-selected topics
    let isDuplicate = false;
    for (let i = 0; i < usedTermSets.length; i++) {
      const existingTerms = usedTermSets[i];
      const topicA = result[i];
      const fp1 = usedFingerprints[i];
      
      // Intent fingerprint check FIRST — same first-4-content-words = guaranteed duplicate
      if (fp1 && fp2 && fp1 === fp2) {
        const differentPlatforms =
          topicA.targetPlatform &&
          topicB.targetPlatform &&
          topicA.targetPlatform !== topicB.targetPlatform;
        if (!differentPlatforms) {
          isDuplicate = true;
          break;
        }
      }
      
      const similarity = calculateSimilarity(terms, existingTerms);
      if (similarity > similarityThreshold) {
        // Never merge topics that target different AI platforms
        // e.g. "How to improve ChatGPT visibility" vs "How to improve Perplexity citations"
        // are distinct even if textually similar
        const differentPlatforms =
          topicA.targetPlatform &&
          topicB.targetPlatform &&
          topicA.targetPlatform !== topicB.targetPlatform;
        if (differentPlatforms) {
          continue; // skip merge even if similarity score exceeds threshold
        }
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      result.push(topicB);
      usedTermSets.push(terms);
      usedFingerprints.push(fp2);
    }
  }
  
  return result;
}

/**
 * Ensure topic diversity by content type
 * Limits topics per content type to avoid all being the same format
 * 
 * @param topics - Array of topics
 * @param maxPerType - Maximum topics per content type (default: 10)
 * @returns Topics with enforced diversity
 */
export function enforceContentTypeDiversity<T extends Topic>(
  topics: T[],
  maxPerType: number = 10
): T[] {
  const typeCounts: Record<string, number> = {};
  
  return topics.filter(topic => {
    const type = topic.contentType || 'other';
    typeCounts[type] = (typeCounts[type] || 0) + 1;
    return typeCounts[type] <= maxPerType;
  });
}

/**
 * Full deduplication pipeline:
 * 1. Remove near-duplicates based on similarity
 * 2. Enforce content type diversity
 */
export function processTopics<T extends Topic>(
  topics: T[],
  options: {
    similarityThreshold?: number;
    maxPerType?: number;
  } = {}
): T[] {
  const { similarityThreshold = 0.65, maxPerType = 10 } = options;
  
  const inputCount = topics.length;
  // Step 1: Deduplicate
  const deduplicated = deduplicateTopics(topics, similarityThreshold);
  const outputCount = deduplicated.length;
  
  // Step 2: Enforce diversity
  const diverse = enforceContentTypeDiversity(deduplicated, maxPerType);
  
  console.log(
    `Topic deduplication: ${inputCount} → ${outputCount} topics ` +
    `(removed ${inputCount - outputCount} duplicates at threshold ${similarityThreshold})`
  );
  
  return diverse;
}
